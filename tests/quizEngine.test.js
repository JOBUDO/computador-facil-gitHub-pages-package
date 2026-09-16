import assert from "node:assert/strict";
import test from "node:test";
import { foldQuizIntoMastery, gradeAnswer, quizAction, scoreQuiz } from "../site/quizEngine.js";

const question = { question: "O que é uma pasta?", options: ["a", "b", "c", "d"], correct_index: 1, explanation: "x" };

test("gradeAnswer compares against the application's own correct_index, never the model's word", () => {
  assert.equal(gradeAnswer(question, 1), true);
  assert.equal(gradeAnswer(question, 0), false);
});

test("scoreQuiz computes a percentage and handles an empty result set", () => {
  assert.equal(scoreQuiz([{ correct: true }, { correct: true }, { correct: false }]), 67);
  assert.equal(scoreQuiz([{ correct: false }, { correct: false }]), 0);
  assert.equal(scoreQuiz([]), 0);
});

test("quizAction maps score bands to reinforce / practice / advance, matching the spec thresholds", () => {
  assert.equal(quizAction(20), "reinforce");
  assert.equal(quizAction(49), "reinforce");
  assert.equal(quizAction(50), "practice");
  assert.equal(quizAction(79), "practice");
  assert.equal(quizAction(80), "advance");
  assert.equal(quizAction(100), "advance");
});

test("foldQuizIntoMastery starts from an existing mastery record and blends every question in", () => {
  const results = [{ correct: true }, { correct: true }, { correct: false }];
  const folded = foldQuizIntoMastery({ mastery_score: 40, attempts: 2, correct_attempts: 1 }, results);
  assert.equal(folded.attempts, 5);
  assert.equal(folded.correctAttempts, 3);
  assert.ok(folded.score >= 0 && folded.score <= 100);
});

test("foldQuizIntoMastery treats a missing mastery record as a fresh skill (all zeros)", () => {
  const folded = foldQuizIntoMastery(null, [{ correct: true }, { correct: true }]);
  assert.equal(folded.attempts, 2);
  assert.equal(folded.correctAttempts, 2);
  assert.ok(folded.score > 0);
});
