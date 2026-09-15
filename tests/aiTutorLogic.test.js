import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSystemPrompt,
  handleAiTutorRequest,
  hasActiveAccess,
  parseTutorResponse,
  providerRequest,
  validateRequestBody
} from "../supabase/functions/ai-tutor/logic.js";

test("validateRequestBody accepts a well-formed body and rejects bad input", () => {
  assert.deepEqual(validateRequestBody({ lesson_id: 3, message: " Olá ", interaction_type: "hint" }), {
    lessonId: 3,
    message: "Olá",
    interactionType: "hint"
  });
  assert.throws(() => validateRequestBody(null));
  assert.throws(() => validateRequestBody({ message: "", interaction_type: "hint" }));
  assert.throws(() => validateRequestBody({ message: "ok", interaction_type: "quiz" }));
  assert.throws(() => validateRequestBody({ message: "ok", interaction_type: "hint", lesson_id: "3" }));
  assert.throws(() => validateRequestBody({ message: "x".repeat(1001), interaction_type: "hint" }));
});

test("hasActiveAccess mirrors the SQL entitlement check", () => {
  assert.equal(hasActiveAccess(null), false);
  assert.equal(hasActiveAccess({ status: "active", access_ends_at: "2999-01-01T00:00:00Z" }), true);
  assert.equal(hasActiveAccess({ status: "active", access_ends_at: "2000-01-01T00:00:00Z" }), false);
  assert.equal(hasActiveAccess({ status: "canceled", access_ends_at: "2999-01-01T00:00:00Z" }), false);
});

test("buildSystemPrompt substitutes every placeholder and preserves the Lia persona", () => {
  const prompt = buildSystemPrompt({
    learnerContext: "Nome: Ana.",
    lessonContext: "Ficheiros e pastas",
    learningObjective: "Distinguir ficheiros de pastas",
    mastery: "40/100",
    recentDifficulties: "- Confunde ficheiro com pasta"
  });
  assert.match(prompt, /You are Lia/);
  assert.match(prompt, /Nome: Ana\./);
  assert.match(prompt, /Ficheiros e pastas/);
  assert.match(prompt, /Distinguir ficheiros de pastas/);
  assert.match(prompt, /40\/100/);
  assert.match(prompt, /Confunde ficheiro com pasta/);
  assert.doesNotMatch(prompt, /\{\{/);
});

test("parseTutorResponse accepts valid JSON, unwraps markdown fences, and clamps confidence", () => {
  assert.deepEqual(parseTutorResponse('{"response":"Ok","detected_difficulty":"x","recommended_action":"practice","confidence":1.4}'), {
    response: "Ok",
    detected_difficulty: "x",
    recommended_action: "practice",
    confidence: 1
  });
  assert.deepEqual(parseTutorResponse('```json\n{"response":"Ok"}\n```'), {
    response: "Ok",
    detected_difficulty: null,
    recommended_action: null,
    confidence: 0.5
  });
});

test("parseTutorResponse never trusts an invalid recommended_action or malformed JSON", () => {
  const withBadAction = parseTutorResponse('{"response":"Ok","recommended_action":"delete_everything"}');
  assert.equal(withBadAction.recommended_action, null);

  const malformed = parseTutorResponse("isto não é JSON de todo");
  assert.equal(malformed.response, "isto não é JSON de todo");
  assert.equal(malformed.detected_difficulty, null);
  assert.equal(malformed.recommended_action, null);
  assert.equal(malformed.confidence, 0);

  const empty = parseTutorResponse("");
  assert.match(empty.response, /não tenho a certeza|Não tenho a certeza/i);
});

test("providerRequest builds the correct shape per provider and rejects unknown providers", () => {
  const common = { model: "m", apiKey: "k", systemPrompt: "sp", userMessage: "um" };
  assert.equal(providerRequest({ provider: "anthropic", ...common }).headers["x-api-key"], "k");
  assert.equal(providerRequest({ provider: "openai", ...common }).headers.authorization, "Bearer k");
  assert.match(providerRequest({ provider: "gemini", ...common }).url, /generateContent\?key=k$/);
  assert.throws(() => providerRequest({ provider: "carrier-pigeon", ...common }));
});

function baseDeps(overrides = {}) {
  return {
    log: () => {},
    getUser: async () => ({ id: "user-1", email: "ana@example.com" }),
    hasActiveAccess: async () => true,
    getLessonContext: async () => ({ id: 2, title: "Ficheiros", skill_key: "files_folders" }),
    getMastery: async () => ({ mastery_score: 40, attempts: 2, correct_attempts: 1 }),
    getRecentInteractions: async () => [],
    callProvider: async () => '{"response":"Resposta da Lia.","recommended_action":"practice","confidence":0.9}',
    saveInteraction: async () => {},
    saveAiSession: async () => {},
    ...overrides
  };
}

const validBody = { lesson_id: 2, message: "Não percebo a diferença", interaction_type: "explanation_request" };

test("handleAiTutorRequest: authenticated call with a valid AI response returns 200 and stores the interaction", async () => {
  const savedInteractions = [];
  const savedSessions = [];
  const result = await handleAiTutorRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model", aiProvider: "anthropic" },
    deps: baseDeps({
      saveInteraction: async row => savedInteractions.push(row),
      saveAiSession: async row => savedSessions.push(row)
    })
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.response, "Resposta da Lia.");
  assert.equal(result.body.recommended_action, "practice");
  assert.equal(savedInteractions.length, 1);
  assert.equal(savedInteractions[0].user_id, "user-1");
  assert.equal(savedSessions.length, 1);
  assert.equal(savedSessions[0].recommended_action, "practice");
});

test("handleAiTutorRequest: unauthenticated call returns 401 and never calls the provider", async () => {
  let providerCalled = false;
  const result = await handleAiTutorRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ getUser: async () => null, callProvider: async () => { providerCalled = true; return ""; } })
  });
  assert.equal(result.status, 401);
  assert.equal(providerCalled, false);
});

test("handleAiTutorRequest: caller without active access is rejected before calling the provider", async () => {
  let providerCalled = false;
  const result = await handleAiTutorRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({
      hasActiveAccess: async () => false,
      callProvider: async () => { providerCalled = true; return ""; }
    })
  });
  assert.equal(result.status, 403);
  assert.equal(providerCalled, false);
});

test("handleAiTutorRequest: missing AI_API_KEY degrades gracefully instead of breaking Lia", async () => {
  const result = await handleAiTutorRequest({
    body: validBody,
    env: { aiApiKey: "", aiModel: "model" },
    deps: baseDeps()
  });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /indisponível/);
});

test("handleAiTutorRequest: an AI timeout is reported as 504 without storing anything", async () => {
  const saved = [];
  const timeoutError = Object.assign(new Error("aborted"), { name: "AbortError" });
  const result = await handleAiTutorRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({
      callProvider: async () => { throw timeoutError; },
      saveInteraction: async row => saved.push(row)
    })
  });
  assert.equal(result.status, 504);
  assert.equal(saved.length, 0);
});

test("handleAiTutorRequest: a provider error is reported as 502 without storing anything", async () => {
  const saved = [];
  const result = await handleAiTutorRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({
      callProvider: async () => { throw Object.assign(new Error("boom"), { category: "provider_error" }); },
      saveInteraction: async row => saved.push(row)
    })
  });
  assert.equal(result.status, 502);
  assert.equal(saved.length, 0);
});

test("handleAiTutorRequest: a malformed AI response still returns 200 with a safe fallback shape", async () => {
  const savedInteractions = [];
  const result = await handleAiTutorRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({
      callProvider: async () => "<script>alert(1)</script> não é JSON",
      saveInteraction: async row => savedInteractions.push(row)
    })
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.recommended_action, null);
  assert.equal(result.body.confidence, 0);
  assert.equal(savedInteractions[0].result, result.body.response);
});

test("handleAiTutorRequest: invalid request body is rejected before touching auth or the provider", async () => {
  let getUserCalled = false;
  const result = await handleAiTutorRequest({
    body: { message: "", interaction_type: "hint" },
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ getUser: async () => { getUserCalled = true; return null; } })
  });
  assert.equal(result.status, 400);
  assert.equal(getUserCalled, false);
});
