// Pure, dependency-free logic for the practice-mission Edge Function (Stage 7).
// Same shape as ../ai-tutor/logic.js and ../quiz-generate/logic.js.

import { providerRequest } from "../ai-tutor/logic.js";

export const DIFFICULTIES = Object.freeze({ EASY: "easy", STANDARD: "standard", CHALLENGE: "challenge" });
export const MAX_MISSION_LENGTH = 400;

const FALLBACK_MISSION = "Abre o computador e repete, devagar, o último passo desta lição.";

const FORBIDDEN_ACTIONS = [
  "deleting or moving system files",
  "changing security-critical configuration (firewall, admin accounts, permissions)",
  "installing unknown or unverified software",
  "disabling antivirus or other protection software",
  "sharing passwords or other credentials"
];

// Difficulty is decided here, by application code reading the learner's own mastery_score for
// this skill — never left to the model. Mirrors the same 50/80 breakpoints masteryEngine.js
// uses for recommendedAction (0-49 reinforce/easy, 50-79 practice/standard, 80+ advance/challenge).
export function missionDifficultyForScore(score) {
  if (score < 50) return DIFFICULTIES.EASY;
  if (score < 80) return DIFFICULTIES.STANDARD;
  return DIFFICULTIES.CHALLENGE;
}

export function validateRequestBody(body) {
  if (!body || typeof body !== "object") throw new Error("Pedido inválido.");
  const { lesson_id } = body;
  if (!Number.isInteger(lesson_id)) throw new Error("lesson_id inválido.");
  return { lessonId: lesson_id };
}

export function describeLesson(lesson) {
  if (!lesson) return "Sem lição específica associada.";
  return `${lesson.title} — ${lesson.description || "sem descrição"}. Missão original: ${lesson.mission || "não definida"}.`;
}

// Deliberately takes no learner name/email/profile data — only what is needed to write a
// competency-scoped exercise (lesson, objective, skill, difficulty, prior attempt count).
export function buildMissionPrompt({ lessonContext, learningObjective, skillKey, difficulty, previousAttempts }) {
  return `You are generating one short, personal practice mission for a Computador Fácil learner — a complete computer beginner learning in European Portuguese.

The mission must exercise the exact same competency as the lesson below, but you may vary the concrete scenario (e.g. a different folder or file name) between learners. Never change what skill is being tested.

Current lesson:
${lessonContext}

Learning objective:
${learningObjective}

Skill: ${skillKey || "não definida"}

Target difficulty: ${difficulty} (${
    difficulty === DIFFICULTIES.EASY
      ? "keep it to one very small, guided step"
      : difficulty === DIFFICULTIES.STANDARD
        ? "a normal-sized task with 2-3 steps"
        : "a slightly more independent task, still safe for a beginner"
  }).

The learner has attempted a practice mission for this skill ${previousAttempts} time(s) before.

Safety rules — the mission must NEVER involve:
${FORBIDDEN_ACTIONS.map(item => `- ${item}`).join("\n")}

Write one short mission (1-3 sentences) in simple, encouraging European Portuguese, safe for a nervous beginner to try right now on their own computer.

Respond ONLY with a single JSON object matching exactly this shape, and nothing else — no markdown fences, no commentary before or after it:
{"mission": "<learner-facing Portuguese instructions>"}`;
}

// Never trusts the model's own idea of difficulty or anything else it might add — only the
// mission text is taken from the response, and even that degrades to a safe default rather
// than ever breaking or showing something unparsed to the learner.
export function parseMissionResponse(raw, fallbackMission = FALLBACK_MISSION) {
  const text = typeof raw === "string" ? raw.trim() : "";
  const unwrapped = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(unwrapped);
    const mission = typeof parsed.mission === "string" && parsed.mission.trim() ? parsed.mission.trim() : fallbackMission;
    return mission.slice(0, MAX_MISSION_LENGTH);
  } catch {
    return (text || fallbackMission).slice(0, MAX_MISSION_LENGTH);
  }
}

export async function handleGenerateMissionRequest({ body, env, deps }) {
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
  if (!entitled) return finish(403, { error: "É necessário acesso ativo para gerar uma missão." }, "no_access");

  if (!env.aiApiKey) {
    return finish(503, { error: "A missão está temporariamente indisponível. Tenta novamente mais tarde." }, "provider_not_configured");
  }

  const lesson = await deps.getLessonContext(user.id, parsed.lessonId);
  if (!lesson) return finish(404, { error: "Lição não encontrada." }, "lesson_not_found");

  const skillKey = lesson.skill_key ?? null;
  const mastery = skillKey ? await deps.getMastery(user.id, skillKey) : null;
  const difficulty = missionDifficultyForScore(mastery?.mastery_score ?? 0);
  const previousAttempts = skillKey ? await deps.countPracticeAttempts(user.id, skillKey) : 0;

  const systemPrompt = buildMissionPrompt({
    lessonContext: describeLesson(lesson),
    learningObjective: lesson.learning_objective || "Não definido para esta lição.",
    skillKey,
    difficulty,
    previousAttempts
  });

  let request;
  try {
    request = providerRequest({
      provider: env.aiProvider || "anthropic",
      model: env.aiModel,
      apiKey: env.aiApiKey,
      systemPrompt,
      userMessage: "Gera a missão agora, seguindo exatamente o formato JSON pedido."
    });
  } catch {
    return finish(503, { error: "A missão está temporariamente indisponível. Tenta novamente mais tarde." }, "provider_misconfigured");
  }

  let rawText;
  try {
    rawText = await deps.callProvider(request);
  } catch (error) {
    const timedOut = error?.name === "AbortError" || error?.category === "timeout";
    return finish(
      timedOut ? 504 : 502,
      { error: "Não consegui gerar a missão agora. Tenta novamente dentro de momentos." },
      timedOut ? "ai_timeout" : "provider_error"
    );
  }

  const mission = parseMissionResponse(rawText);

  return finish(200, { mission, difficulty, skill_key: skillKey, lesson_id: parsed.lessonId }, "success");
}
