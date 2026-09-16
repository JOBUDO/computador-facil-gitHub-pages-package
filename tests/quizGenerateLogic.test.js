import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  buildQuizPrompt,
  handleQuizGenerateRequest,
  validateQuiz,
  validateRequestBody
} from "../supabase/functions/quiz-generate/logic.js";

test("validateRequestBody requires an integer lesson_id", () => {
  assert.deepEqual(validateRequestBody({ lesson_id: 4 }), { lessonId: 4 });
  assert.throws(() => validateRequestBody(null));
  assert.throws(() => validateRequestBody({}));
  assert.throws(() => validateRequestBody({ lesson_id: "4" }));
});

test("buildQuizPrompt stays strictly scoped to the lesson, objective and skill", () => {
  const prompt = buildQuizPrompt({
    lessonContext: "Ficheiros e pastas",
    learningObjective: "Distinguir ficheiros de pastas",
    skillKey: "files_folders"
  });
  assert.match(prompt, /Ficheiros e pastas/);
  assert.match(prompt, /Distinguir ficheiros de pastas/);
  assert.match(prompt, /files_folders/);
  assert.match(prompt, /strictly based on the current lesson/);
});

const validQuestion = {
  question: "O que é uma pasta?",
  options: ["Um ficheiro", "Um local para guardar ficheiros", "Um programa", "Uma impressora"],
  correct_index: 1,
  explanation: "Uma pasta organiza ficheiros dentro dela."
};

test("validateQuiz accepts a well-formed quiz JSON, unwraps markdown fences, and caps at MAX_QUESTIONS", () => {
  const raw = JSON.stringify({ questions: [validQuestion, validQuestion, validQuestion, validQuestion] });
  const quiz = validateQuiz(raw);
  assert.equal(quiz.questions.length, MAX_QUESTIONS);

  const fenced = "```json\n" + JSON.stringify({ questions: [validQuestion, validQuestion] }) + "\n```";
  assert.equal(validateQuiz(fenced).questions.length, 2);
});

test("validateQuiz drops malformed questions and throws when fewer than MIN_QUESTIONS survive", () => {
  const withBadOptions = { ...validQuestion, options: ["só uma opção"] };
  const withBadIndex = { ...validQuestion, correct_index: 9 };
  const withoutExplanation = { ...validQuestion, explanation: "" };

  assert.throws(() => validateQuiz(JSON.stringify({ questions: [validQuestion, withBadOptions] })), /Não foi possível/);
  assert.throws(() => validateQuiz(JSON.stringify({ questions: [withBadIndex, withoutExplanation] })));
  assert.throws(() => validateQuiz("isto não é JSON"));
  assert.throws(() => validateQuiz(JSON.stringify({ questions: [validQuestion] })));

  assert.equal(validateQuiz(JSON.stringify({ questions: [validQuestion, validQuestion, withBadIndex] })).questions.length, 2);
});

test("validateQuiz never lets an oversized field through unbounded", () => {
  const huge = { ...validQuestion, question: "x".repeat(10000) };
  const quiz = validateQuiz(JSON.stringify({ questions: [huge, validQuestion] }));
  assert.ok(quiz.questions[0].question.length <= 300);
});

function baseDeps(overrides = {}) {
  return {
    log: () => {},
    getUser: async () => ({ id: "user-1", email: "ana@example.com" }),
    hasActiveAccess: async () => true,
    getLessonContext: async () => ({ id: 2, title: "Ficheiros", skill_key: "files_folders", learning_objective: "obj" }),
    callProvider: async () => JSON.stringify({ questions: [validQuestion, validQuestion] }),
    ...overrides
  };
}

const validBody = { lesson_id: 2 };

test("handleQuizGenerateRequest: authenticated call with a valid AI response returns 200 with the quiz", async () => {
  const result = await handleQuizGenerateRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model", aiProvider: "anthropic" },
    deps: baseDeps()
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.questions.length, MIN_QUESTIONS);
  assert.equal(result.body.skill_key, "files_folders");
});

test("handleQuizGenerateRequest: unauthenticated call returns 401 and never calls the provider", async () => {
  let providerCalled = false;
  const result = await handleQuizGenerateRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ getUser: async () => null, callProvider: async () => { providerCalled = true; return ""; } })
  });
  assert.equal(result.status, 401);
  assert.equal(providerCalled, false);
});

test("handleQuizGenerateRequest: caller without active access is rejected before calling the provider", async () => {
  const result = await handleQuizGenerateRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ hasActiveAccess: async () => false })
  });
  assert.equal(result.status, 403);
});

test("handleQuizGenerateRequest: missing lesson returns 404", async () => {
  const result = await handleQuizGenerateRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ getLessonContext: async () => null })
  });
  assert.equal(result.status, 404);
});

test("handleQuizGenerateRequest: missing AI_API_KEY degrades gracefully", async () => {
  const result = await handleQuizGenerateRequest({
    body: validBody,
    env: { aiApiKey: "", aiModel: "model" },
    deps: baseDeps()
  });
  assert.equal(result.status, 503);
});

test("handleQuizGenerateRequest: a malformed AI response is rejected rather than shown to the learner", async () => {
  const result = await handleQuizGenerateRequest({
    body: validBody,
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ callProvider: async () => "<script>alert(1)</script>" })
  });
  assert.equal(result.status, 502);
  assert.equal(result.body.questions, undefined);
});

test("handleQuizGenerateRequest: invalid request body is rejected before touching auth or the provider", async () => {
  let getUserCalled = false;
  const result = await handleQuizGenerateRequest({
    body: {},
    env: { aiApiKey: "key", aiModel: "model" },
    deps: baseDeps({ getUser: async () => { getUserCalled = true; return null; } })
  });
  assert.equal(result.status, 400);
  assert.equal(getUserCalled, false);
});
