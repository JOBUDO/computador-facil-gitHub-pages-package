// Pure, dependency-free logic for the ai-tutor Edge Function (Stage 3).
// No Deno/Supabase/network APIs here — everything that touches the outside
// world is injected as `deps` by index.ts, so this file runs unchanged under
// Node (tests) or Deno (production).

export const ALLOWED_INTERACTION_TYPES = ["help_request", "explanation_request", "hint"];
export const RECOMMENDED_ACTIONS = ["advance", "practice", "reinforce", "review_prerequisite"];
export const MAX_MESSAGE_LENGTH = 1000;

const FALLBACK_RESPONSE = "Não tenho a certeza de como explicar isso agora — tenta perguntar de outra forma.";

export function hasActiveAccess(subscription, now = new Date()) {
  return Boolean(
    subscription &&
      ["trialing", "active"].includes(subscription.status) &&
      subscription.access_ends_at &&
      new Date(subscription.access_ends_at) > now
  );
}

export function validateRequestBody(body) {
  if (!body || typeof body !== "object") throw new Error("Pedido inválido.");
  const { lesson_id, message, interaction_type } = body;
  if (lesson_id !== null && lesson_id !== undefined && !Number.isInteger(lesson_id)) {
    throw new Error("lesson_id inválido.");
  }
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("A mensagem não pode estar vazia.");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error("A mensagem é demasiado longa.");
  }
  if (!ALLOWED_INTERACTION_TYPES.includes(interaction_type)) {
    throw new Error("interaction_type inválido.");
  }
  return { lessonId: lesson_id ?? null, message: message.trim(), interactionType: interaction_type };
}

export function describeLearner(user) {
  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Aprendiz";
  return `Nome: ${name}.`;
}

export function describeLesson(lesson) {
  if (!lesson) return "Sem lição específica associada a esta conversa.";
  return `${lesson.title} — ${lesson.description || "sem descrição"}. Missão: ${lesson.mission || "não definida"}.`;
}

export function describeMastery(mastery) {
  if (!mastery) return "Ainda sem dados de mestria para esta competência.";
  return `${mastery.mastery_score}/100 (${mastery.attempts} tentativa(s), ${mastery.correct_attempts} corretas).`;
}

export function describeRecentDifficulties(interactions) {
  if (!interactions || !interactions.length) return "Nenhuma dificuldade recente registada.";
  return interactions
    .map(item => `- ${item.question ? item.question.slice(0, 140) : "(pergunta não registada)"}`)
    .join("\n");
}

export function buildSystemPrompt({ learnerContext, lessonContext, learningObjective, mastery, recentDifficulties }) {
  return `You are Lia, the AI learning tutor for Computador Fácil.

You teach complete computer beginners.

Communicate in clear European Portuguese.

The learner may:
- have little or no computer experience
- be unfamiliar with technical vocabulary
- require step-by-step instructions
- be nervous about using technology

Your responsibility is to help the learner understand the current Computador Fácil lesson.

Current learner context:
${learnerContext}

Current lesson:
${lessonContext}

Learning objective:
${learningObjective}

Current mastery:
${mastery}

Recent difficulties:
${recentDifficulties}

Rules:

1. Use simple Portuguese.
2. Avoid unnecessary technical terminology.
3. Explain any technical word before using it.
4. Give no more than 1–3 actions at once.
5. Prefer concrete examples.
6. If the learner does not understand, change the explanation rather than repeating the same wording.
7. Ask a confirmation question before progressing when appropriate.
8. Never claim the learner understands something without evidence.
9. Encourage the learner to perform actions themselves.
10. Stay within the current course context.
11. Do not invent features that are not part of the learner's operating system or lesson.
12. Never modify the permanent curriculum.

Respond ONLY with a single JSON object matching exactly this shape, and nothing else — no markdown fences, no commentary before or after it:
{"response": "<learner-facing Portuguese explanation>", "detected_difficulty": "<short label or null>", "recommended_action": "<advance|practice|reinforce|review_prerequisite|null>", "confidence": <number between 0 and 1>}`;
}

// Accepts the raw text returned by the provider and returns a validated,
// safe-to-use structured result. Never throws: a malformed or non-JSON
// response degrades to a best-effort text reply rather than breaking Lia.
export function parseTutorResponse(raw, fallbackMessage = FALLBACK_RESPONSE) {
  const text = typeof raw === "string" ? raw.trim() : "";
  const unwrapped = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(unwrapped);
    const response =
      typeof parsed.response === "string" && parsed.response.trim() ? parsed.response.trim() : fallbackMessage;
    const detectedDifficulty = typeof parsed.detected_difficulty === "string" ? parsed.detected_difficulty : null;
    const recommendedAction = RECOMMENDED_ACTIONS.includes(parsed.recommended_action)
      ? parsed.recommended_action
      : null;
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5;
    return { response, detected_difficulty: detectedDifficulty, recommended_action: recommendedAction, confidence };
  } catch {
    return { response: text || fallbackMessage, detected_difficulty: null, recommended_action: null, confidence: 0 };
  }
}

// Describes the exact HTTP request for a provider, without performing it —
// keeps `callAIProvider` (the actual fetch, in index.ts) provider-agnostic.
export function providerRequest({ provider, model, apiKey, systemPrompt, userMessage }) {
  if (provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: { model, max_tokens: 600, system: systemPrompt, messages: [{ role: "user", content: userMessage }] },
      extractText: json => json?.content?.[0]?.text ?? ""
    };
  }
  if (provider === "openai") {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ]
      },
      extractText: json => json?.choices?.[0]?.message?.content ?? ""
    };
  }
  if (provider === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      headers: { "content-type": "application/json" },
      body: {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }]
      },
      extractText: json => json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    };
  }
  throw new Error(`Fornecedor de IA desconhecido: ${provider}`);
}

// The full request orchestration, with every side effect injected via `deps`.
// index.ts wires real Supabase/network calls in; tests wire in mocks.
export async function handleAiTutorRequest({ body, env, deps }) {
  const startedAt = Date.now();
  const finish = (status, responseBody, outcome) => {
    deps.log?.({
      requestId: deps.requestId,
      outcome,
      status,
      latencyMs: Date.now() - startedAt,
      interactionType: body?.interaction_type ?? null
    });
    return { status, body: responseBody };
  };

  let parsed;
  try {
    parsed = validateRequestBody(body);
  } catch (error) {
    return finish(400, { error: error.message }, "invalid_request");
  }

  const user = await deps.getUser();
  if (!user) {
    return finish(401, { error: "Sessão inválida. Entra novamente." }, "unauthenticated");
  }

  const entitled = await deps.hasActiveAccess(user.id);
  if (!entitled) {
    return finish(403, { error: "É necessário acesso ativo para falar com a Lia." }, "no_access");
  }

  if (!env.aiApiKey) {
    return finish(
      503,
      { error: "A Lia está temporariamente indisponível. Tenta novamente mais tarde." },
      "provider_not_configured"
    );
  }

  const lesson = parsed.lessonId ? await deps.getLessonContext(user.id, parsed.lessonId) : null;
  const mastery = lesson?.skill_key ? await deps.getMastery(user.id, lesson.skill_key) : null;
  const recentInteractions = await deps.getRecentInteractions(user.id, {
    lessonId: parsed.lessonId,
    skillKey: lesson?.skill_key ?? null
  });

  const systemPrompt = buildSystemPrompt({
    learnerContext: describeLearner(user),
    lessonContext: describeLesson(lesson),
    learningObjective: lesson?.learning_objective || "Não definido para esta lição.",
    mastery: describeMastery(mastery),
    recentDifficulties: describeRecentDifficulties(recentInteractions)
  });

  let request;
  try {
    request = providerRequest({
      provider: env.aiProvider || "anthropic",
      model: env.aiModel,
      apiKey: env.aiApiKey,
      systemPrompt,
      userMessage: parsed.message
    });
  } catch {
    return finish(
      503,
      { error: "A Lia está temporariamente indisponível. Tenta novamente mais tarde." },
      "provider_misconfigured"
    );
  }

  let rawText;
  try {
    rawText = await deps.callProvider(request);
  } catch (error) {
    const timedOut = error?.name === "AbortError" || error?.category === "timeout";
    return finish(
      timedOut ? 504 : 502,
      { error: "Não consegui responder agora. Tenta novamente dentro de momentos." },
      timedOut ? "ai_timeout" : "provider_error"
    );
  }

  const result = parseTutorResponse(rawText);

  await deps.saveInteraction({
    user_id: user.id,
    lesson_id: parsed.lessonId,
    skill_key: lesson?.skill_key ?? null,
    interaction_type: parsed.interactionType,
    question: parsed.message,
    result: result.response,
    metadata: { detected_difficulty: result.detected_difficulty, confidence: result.confidence }
  });

  if (result.recommended_action) {
    await deps.saveAiSession({
      user_id: user.id,
      lesson_id: parsed.lessonId,
      difficulty_level: result.detected_difficulty,
      recommended_action: result.recommended_action,
      summary: result.response.slice(0, 240)
    });
  }

  return finish(200, result, "success");
}
