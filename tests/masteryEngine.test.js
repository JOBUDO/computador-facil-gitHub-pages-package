import assert from "node:assert/strict";
import test from "node:test";
import {
  masteryState,
  nextMastery,
  recommendedAction,
  recommendNext,
  resolveRecommendedLesson
} from "../site/masteryEngine.js";

test("recommendedAction maps score ranges to actions", () => {
  assert.equal(recommendedAction(20), "reinforce");
  assert.equal(recommendedAction(55), "practice");
  assert.equal(recommendedAction(82), "advance");
  assert.equal(recommendedAction(95), "advance");
  assert.equal(recommendedAction(49), "reinforce");
  assert.equal(recommendedAction(50), "practice");
  assert.equal(recommendedAction(79), "practice");
  assert.equal(recommendedAction(80), "advance");
});

test("recommendedAction defers to review_prerequisite when the prerequisite is unmet", () => {
  assert.equal(recommendedAction(95, { prerequisiteMet: false }), "review_prerequisite");
});

test("masteryState maps score ranges to states, including score 95", () => {
  assert.equal(masteryState(0), "needs_help");
  assert.equal(masteryState(39), "needs_help");
  assert.equal(masteryState(40), "learning");
  assert.equal(masteryState(69), "learning");
  assert.equal(masteryState(70), "competent");
  assert.equal(masteryState(84), "competent");
  assert.equal(masteryState(85), "mastered");
  assert.equal(masteryState(95), "mastered");
});

test("nextMastery blends quiz/practice accuracy into the running score", () => {
  const afterCorrectQuiz = nextMastery({ score: 40, attempts: 0, correctAttempts: 0 }, { type: "quiz", correct: true });
  assert.equal(afterCorrectQuiz.attempts, 1);
  assert.equal(afterCorrectQuiz.correctAttempts, 1);
  assert.ok(afterCorrectQuiz.score > 40);

  const afterWrongPractice = nextMastery({ score: 60, attempts: 1, correctAttempts: 1 }, { type: "practice", correct: false });
  assert.equal(afterWrongPractice.attempts, 2);
  assert.equal(afterWrongPractice.correctAttempts, 1);
  assert.ok(afterWrongPractice.score < 60);
});

test("nextMastery gives a flat bonus for lesson completion and clamps at 100", () => {
  assert.equal(nextMastery({ score: 90 }, { type: "lesson_completion" }).score, 95);
  assert.equal(nextMastery({ score: 98 }, { type: "lesson_completion" }).score, 100);
});

test("nextMastery leaves the score untouched for non-graded interactions", () => {
  for (const type of ["hint", "help_request", "explanation_request"]) {
    const result = nextMastery({ score: 42, attempts: 3, correctAttempts: 1 }, { type });
    assert.deepEqual(result, { score: 42, attempts: 3, correctAttempts: 1 });
  }
});

const lessons = [
  { id: 1, skill_key: "mouse_basics", prerequisite_skill: null, mastery_threshold: null },
  { id: 2, skill_key: "files_folders", prerequisite_skill: "mouse_basics", mastery_threshold: 70 },
  { id: 3, skill_key: null, prerequisite_skill: null, mastery_threshold: null }
];

test("recommendNext defaults to the original sequential behaviour when there is no mastery data", () => {
  assert.deepEqual(recommendNext(lessons, []), { lesson: lessons[0], action: "advance" });
  assert.deepEqual(recommendNext(lessons, [1, 2, 3]), { lesson: lessons[0], action: "advance" });
  assert.deepEqual(recommendNext([], []), { lesson: null, action: null });
});

test("recommendNext recommends review_prerequisite when the prerequisite skill is below threshold", () => {
  const result = recommendNext(lessons, [1], [{ skill_key: "mouse_basics", mastery_score: 50 }]);
  assert.deepEqual(result, { lesson: lessons[1], action: "review_prerequisite" });
});

test("recommendNext advances once the prerequisite is met and there is no mastery record for the lesson's own skill", () => {
  const result = recommendNext(lessons, [1], [{ skill_key: "mouse_basics", mastery_score: 80 }]);
  assert.deepEqual(result, { lesson: lessons[1], action: "advance" });
});

test("recommendNext reflects the lesson's own skill mastery once a record exists", () => {
  const result = recommendNext(lessons, [], [{ skill_key: "mouse_basics", mastery_score: 20 }]);
  assert.deepEqual(result, { lesson: lessons[0], action: "reinforce" });
});

test("resolveRecommendedLesson points at the lesson teaching the missing prerequisite skill, not the locked lesson recommendNext names", () => {
  const recommendation = recommendNext(lessons, [1], [{ skill_key: "mouse_basics", mastery_score: 50 }]);
  assert.equal(recommendation.action, "review_prerequisite");
  assert.equal(recommendation.lesson, lessons[1]); // the locked lesson, per recommendNext's own contract

  const resolved = resolveRecommendedLesson(lessons, recommendation);
  assert.equal(resolved, lessons[0]); // the lesson that actually teaches "mouse_basics"
});

test("resolveRecommendedLesson falls back to the locked lesson when no lesson teaches the prerequisite skill", () => {
  const recommendation = { lesson: { id: 9, prerequisite_skill: "nonexistent_skill" }, action: "review_prerequisite" };
  assert.equal(resolveRecommendedLesson(lessons, recommendation), recommendation.lesson);
});

test("resolveRecommendedLesson is a no-op for every action other than review_prerequisite", () => {
  assert.equal(resolveRecommendedLesson(lessons, { lesson: lessons[0], action: "advance" }), lessons[0]);
  assert.equal(resolveRecommendedLesson(lessons, { lesson: lessons[1], action: "practice" }), lessons[1]);
  assert.equal(resolveRecommendedLesson(lessons, null), null);
});
