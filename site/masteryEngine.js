// Deterministic mastery/recommendation logic (Stage 2). No AI involved: this decides
// WHAT should happen next; an AI tutor may later decide HOW to explain it (Stage 3).

export const MASTERY_THRESHOLDS = Object.freeze({
  MASTERED: 85,
  COMPETENT: 70,
  LEARNING: 40
});

export const DEFAULT_PREREQUISITE_THRESHOLD = 70;

const REINFORCE_MAX = 49;
const PRACTICE_MAX = 79;
const QUIZ_WEIGHT = 0.4;
const PRACTICE_WEIGHT = 0.25;
const LESSON_COMPLETION_BONUS = 5;
const GRADED_INTERACTION_TYPES = new Set(["quiz", "practice"]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function masteryState(score) {
  if (score >= MASTERY_THRESHOLDS.MASTERED) return "mastered";
  if (score >= MASTERY_THRESHOLDS.COMPETENT) return "competent";
  if (score >= MASTERY_THRESHOLDS.LEARNING) return "learning";
  return "needs_help";
}

export function recommendedAction(score, { prerequisiteMet = true } = {}) {
  if (!prerequisiteMet) return "review_prerequisite";
  if (score <= REINFORCE_MAX) return "reinforce";
  if (score <= PRACTICE_MAX) return "practice";
  return "advance";
}

// Folds one learner_interactions-shaped event into a learner_mastery-shaped record.
// Quiz/practice results blend recent accuracy into the running score; a lesson
// completion gives a small flat boost; everything else (hints, help/explanation
// requests) is left for the interaction log alone and does not move the score.
export function nextMastery({ score = 0, attempts = 0, correctAttempts = 0 }, { type, correct }) {
  if (type === "lesson_completion") {
    return { score: clamp(score + LESSON_COMPLETION_BONUS, 0, 100), attempts, correctAttempts };
  }
  if (!GRADED_INTERACTION_TYPES.has(type)) {
    return { score, attempts, correctAttempts };
  }
  const nextAttempts = attempts + 1;
  const nextCorrectAttempts = correctAttempts + (correct ? 1 : 0);
  const accuracy = Math.round((nextCorrectAttempts / nextAttempts) * 100);
  const weight = type === "quiz" ? QUIZ_WEIGHT : PRACTICE_WEIGHT;
  const blended = Math.round(score * (1 - weight) + accuracy * weight);
  return { score: clamp(blended, 0, 100), attempts: nextAttempts, correctAttempts: nextCorrectAttempts };
}

// Same "next lesson" selection as the existing sequential flow (first not-done lesson,
// falling back to the first lesson). Layers a recommended action on top from mastery
// data when it exists; with no mastery record or no adaptive fields on the lesson, the
// result is always { lesson: <the sequential next lesson>, action: "advance" } — the
// original behaviour, unchanged.
export function recommendNext(lessons, done, masteryRecords = []) {
  const next = lessons.find(lesson => !done.includes(lesson.id)) || lessons[0] || null;
  if (!next) return { lesson: null, action: null };

  const masteryBySkill = new Map(masteryRecords.map(record => [record.skill_key, record]));

  if (next.prerequisite_skill) {
    const threshold = next.mastery_threshold ?? DEFAULT_PREREQUISITE_THRESHOLD;
    const prerequisite = masteryBySkill.get(next.prerequisite_skill);
    if (!prerequisite || prerequisite.mastery_score < threshold) {
      return { lesson: next, action: "review_prerequisite" };
    }
  }

  const mastery = next.skill_key ? masteryBySkill.get(next.skill_key) : null;
  if (!mastery) return { lesson: next, action: "advance" };

  return { lesson: next, action: recommendedAction(mastery.mastery_score) };
}
