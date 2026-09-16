// Pure, dependency-free logic for the quiz-generate Edge Function (Stage 5).
// Same shape as ../ai-tutor/logic.js: no Deno/Supabase/network APIs here, everything that
// touches the outside world is injected as `deps` by index.ts.

import { providerRequest } from "../ai-tutor/logic.js";

export const MIN_QUESTIONS = 2;
export const MAX_QUESTIONS = 3;
export const OPTION_COUNT = 4;
export const MAX_FIELD_LENGTH = 300;

const FALLBACK_ERROR = "Não foi possível gerar o teste agora. Tenta novamente.";

export function validateRequestBody(body) {
  if (!body || typeof body !== "object") throw new Error("Pedido inválido.");
  const { lesson_id } = body;
  if (!Number.isInteger(lesson_id)) throw new Error("lesson_id inválido.");
  return { lessonId: lesson_id };
}

export function describeLesson(lesson) {
  if (!lesson) return "Sem lição específica associada.";
  return `${lesson.title} — ${lesson.description || "sem descrição"}. Missão: ${lesson.mission || "não definida"}.`;
}

export function buildQuizPrompt({ lessonContext, learningObjective, skillKey }) {
  return `You are generating a short knowledge check for Computador Fácil, a mobile-first Portuguese platform that teaches complete computer beginners.

The quiz MUST stay strictly based on the current lesson, its learning objective and its skill — never introduce unrelated topics.

Current lesson:
${lessonContext}

Learning objective:
${learningObjective}

Skill: ${skillKey || "não definida"}

Write ${MIN_QUESTIONS} to ${MAX_QUESTIONS} multiple-choice questions in clear, simple European Portuguese suitable for a nervous beginner. Each question has exactly ${OPTION_COUNT} short options and exactly one correct option. Each question needs a brief, kind explanation (1-2 sentences) of why the correct option is right, written so it still helps a learner who got it wrong.

Respond ONLY with a single JSON object matching exactly this shape, and nothing else — no markdown fences, no commentary before or after it:
{"questions": [{"question": "<text>", "options": ["<a>", "<b>", "<c>", "<d>"], "correct_index": <0-3>, "explanation": "<text>"}]}`;
}

function clampString(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_FIELD_LENGTH) : "";
}

function sanitizeQuestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const question = clampString(raw.question);
  const options = Array.isArray(raw.options) ? raw.options.map(clampString).filter(Boolean) : [];
  const correctIndex = Number.isInteger(raw.correct_index) ? raw.correct_index : -1;
  const explanation = clampString(raw.explanation);
  if (!question || options.length !== OPTION_COUNT || correctIndex < 0 || correctIndex >= OPTION_COUNT || !explanation) {
    return null;
  }
  return { question, options, correct_index: correctIndex, explanation };
}

// Never trusts the model's output structurally: drops any malformed question, requires at
// least MIN_QUESTIONS valid ones to survive, and caps the result at MAX_QUESTIONS. Throws
// (rather than fabricating a fallback quiz) when the result isn't safe to display.
export function validateQuiz(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  const unwrapped = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    throw new Error(FALLBACK_ERROR);
  }
  const questions = Array.isArray(parsed?.questions)
    ? parsed.questions.map(sanitizeQuestion).filter(Boolean).slice(0, MAX_QUESTIONS)
    : [];
  if (questions.length < MIN_QUESTIONS) throw new Error(FALLBACK_ERROR);
  return { questions };
}

export async function handleQuizGenerateRequest({ body, env, deps }) {
  const startedAt = Date.now();
  const finish = (status, responseBody, outcome) => {
    deps.log?.({ requestId: deps.requestId, outcome, status, latencyMs: Date.now() - startedAt });
    return { status, body: responseBody };
  };

  let parsed;
  try {
    parsed = validateRequestBody(body);
  } catch (error) {
    return finish(400, { error: error.message }, "invalid_request");
  }

  const user = await deps.getUser();
  if (!user) return finish(401, { error: "Sessão inválida. Entra novamente." }, "unauthenticated");

  const entitled = await deps.hasActiveAccess(user.id);
  if (!entitled) return finish(403, { error: "É necessário acesso ativo para fazer o teste." }, "no_access");

  if (!env.aiApiKey) {
    return finish(503, { error: "O teste está temporariamente indisponível. Tenta novamente mais tarde." }, "provider_not_configured");
  }

  const lesson = await deps.getLessonContext(user.id, parsed.lessonId);
  if (!lesson) return finish(404, { error: "Lição não encontrada." }, "lesson_not_found");

  const systemPrompt = buildQuizPrompt({
    lessonContext: describeLesson(lesson),
    learningObjective: lesson.learning_objective || "Não definido para esta lição.",
    skillKey: lesson.skill_key ?? null
  });

  let request;
  try {
    request = providerRequest({
      provider: env.aiProvider || "anthropic",
      model: env.aiModel,
      apiKey: env.aiApiKey,
      systemPrompt,
      userMessage: "Gera o teste agora, seguindo exatamente o formato JSON pedido."
    });
  } catch {
    return finish(503, { error: "O teste está temporariamente indisponível. Tenta novamente mais tarde." }, "provider_misconfigured");
  }

  let rawText;
  try {
    rawText = await deps.callProvider(request);
  } catch (error) {
    const timedOut = error?.name === "AbortError" || error?.category === "timeout";
    return finish(
      timedOut ? 504 : 502,
      { error: "Não consegui gerar o teste agora. Tenta novamente dentro de momentos." },
      timedOut ? "ai_timeout" : "provider_error"
    );
  }

  let quiz;
  try {
    quiz = validateQuiz(rawText);
  } catch {
    return finish(502, { error: FALLBACK_ERROR }, "invalid_quiz_shape");
  }

  return finish(200, { questions: quiz.questions, lesson_id: parsed.lessonId, skill_key: lesson.skill_key ?? null }, "success");
}
