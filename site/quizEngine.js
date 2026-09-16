// Deterministic quiz grading (Stage 5). The AI only proposes question text; the application
// always decides what is correct, what the score is, and what learner_mastery becomes —
// never the model.
import { nextMastery, recommendedAction } from "./masteryEngine.js";

export function gradeAnswer(question, selectedIndex) {
  return selectedIndex === question.correct_index;
}

export function scoreQuiz(results) {
  if (!results.length) return 0;
  const correctCount = results.filter(result => result.correct).length;
  return Math.round((correctCount / results.length) * 100);
}

// Folds every question of a quiz attempt into a mastery record, one graded "quiz" interaction
// per question, reusing masteryEngine's nextMastery unchanged.
export function foldQuizIntoMastery(mastery, results) {
  const start = {
    score: mastery?.mastery_score ?? 0,
    attempts: mastery?.attempts ?? 0,
    correctAttempts: mastery?.correct_attempts ?? 0
  };
  return results.reduce((acc, result) => nextMastery(acc, { type: "quiz", correct: result.correct }), start);
}

export function quizAction(masteryScore) {
  return recommendedAction(masteryScore);
}
