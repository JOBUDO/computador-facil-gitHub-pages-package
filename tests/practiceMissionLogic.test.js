import assert from "node:assert/strict";
import test from "node:test";
import {
  DIFFICULTIES,
  buildMissionPrompt,
  handleGenerateMissionRequest,
  missionDifficultyForScore,
  parseMissionResponse,
  validateRequestBody
} from "../supabase/functions/practice-mission/logic.js";

test("missionDifficultyForScore is decided by application thresholds, mirroring masteryEngine's bands", () => {
  assert.equal(missionDifficultyForScore(0), DIFFICULTIES.EASY);
  assert.equal(missionDifficultyForScore(49), DIFFICULTIES.EASY);
  assert.equal(missionDifficultyForScore(50), DIFFICULTIES.STANDARD);
  assert.equal(missionDifficultyForScore(79), DIFFICULTIES.STANDARD);
  assert.equal(missionDifficultyForScore(80), DIFFICULTIES.CHALLENGE);
  assert.equal(missionDifficultyForScore(100), DIFFICULTIES.CHALLENGE);
});

test("validateRequestBody requires an integer lesson_id", () => {
  assert.deepEqual(validateRequestBody({ lesson_id: 5 }), { lessonId: 5 });
  assert.throws(() => validateRequestBody(null));
  assert.throws(() => validateRequestBody({}));
});

test("buildMissionPrompt never includes learner personal data and always lists the safety rules", () => {
  const prompt = buildMissionPrompt({
    lessonContext: "Pastas",
    learningObjective: "Criar uma pasta",
    skillKey: "folder_creation",
    difficulty: "easy",
    previousAttempts: 0
  });
  assert.doesNotMatch(prompt, /email/i);
  assert.doesNotMatch(prompt, /nome:/i);
  assert.match(prompt, /deleting or moving system files/);
  assert.match(prompt, /disabling antivirus/);
  assert.match(prompt, /sharing passwords/);
  assert.match(prompt, /folder_creation/);
});

test("parseMissionResponse only ever trusts the mission text — never the model's own idea of difficulty", () => {
  const result = parseMissionResponse('{"mission":"Cria uma pasta chamada Fotografias.","difficulty":"challenge"}');
  assert.equal(result, "Cria uma pasta chamada Fotografias.");
  // no `difficulty` field is even returned by this function — callers use their own app-decided value.

  assert.match(parseMissionResponse("não é JSON"), /não é JSON|repete/i);
  assert.match(parseMissionResponse(""), /repete/i);
  assert.ok(parseMissionResponse("x".repeat(10000)).length <= 400);
});

function baseDeps(overrides = {}) {
  return {
    log: () => {},
    getUser: async () => ({ id: "user-1", email: "ana@example.com" }),
    hasActiveAccess: async () => true,
    getLessonContext: async () => ({ id: 2, title: "Pastas", skill_key: "folder_creation", learning_objective: "obj" }),
    getMastery: async () => ({ mastery_score: 30, attempts: 1, correct_attempts: 0 }),
    countPracticeAttempts: async () => 0,
    callProvider: async () => '{"mission":"Cria uma pasta no Ambiente de Trabalho chamada Fotografias."}',
    ...overrides
  };
}

const validBody = { lesson_id: 2 };

test("handleGenerateMissionRequest: authenticated call returns 200 with mission and app-decided difficulty", async () => {
  const result = await handleGenerateMissionRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps()
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.mission, "Cria uma pasta no Ambiente de Trabalho chamada Fotografias.");
  assert.equal(result.body.difficulty, "easy"); // mastery_score 30 -> easy, decided by the app, not the model
  assert.equal(result.body.skill_key, "folder_creation");
});

test("handleGenerateMissionRequest: difficulty tracks the learner's own mastery_score for the skill", async () => {
  const result = await handleGenerateMissionRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ getMastery: async () => ({ mastery_score: 85, attempts: 5, correct_attempts: 5 }) })
  });
  assert.equal(result.body.difficulty, "challenge");
});

test("handleGenerateMissionRequest: unauthenticated call returns 401 and never calls the provider", async () => {
  let providerCalled = false;
  const result = await handleGenerateMissionRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ getUser: async () => null, callProvider: async () => { providerCalled = true; return ""; } })
  });
  assert.equal(result.status, 401);
  assert.equal(providerCalled, false);
});

test("handleGenerateMissionRequest: caller without active access is rejected before calling the provider", async () => {
  const result = await handleGenerateMissionRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ hasActiveAccess: async () => false })
  });
  assert.equal(result.status, 403);
});

test("handleGenerateMissionRequest: missing lesson returns 404", async () => {
  const result = await handleGenerateMissionRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ getLessonContext: async () => null })
  });
  assert.equal(result.status, 404);
});

test("handleGenerateMissionRequest: missing AI_API_KEY degrades gracefully", async () => {
  const result = await handleGenerateMissionRequest({
    body: validBody,
    env: { aiApiKey: "", aiModel: "model" },
    deps: baseDeps()
  });
  assert.equal(result.status, 503);
});

test("handleGenerateMissionRequest: a lesson without a skill_key still generates a mission at easy difficulty, with zero prior attempts", async () => {
  const result = await handleGenerateMissionRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({
      getLessonContext: async () => ({ id: 2, title: "Intro", skill_key: null, learning_objective: null }),
      getMastery: async () => { throw new Error("should not be called without a skill_key"); },
      countPracticeAttempts: async () => { throw new Error("should not be called without a skill_key"); }
    })
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.difficulty, "easy");
  assert.equal(result.body.skill_key, null);
});

test("handleGenerateMissionRequest: invalid request body is rejected before touching auth or the provider", async () => {
  let getUserCalled = false;
  const result = await handleGenerateMissionRequest({
    body: {},
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ getUser: async () => { getUserCalled = true; return null; } })
  });
  assert.equal(result.status, 400);
  assert.equal(getUserCalled, false);
});
