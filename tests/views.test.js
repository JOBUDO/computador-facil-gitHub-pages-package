import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  accountView,
  coursesView,
  helperView,
  homeView,
  lessonView,
  noticeView,
  paywallView,
  practiceView,
  quizResultView,
  quizView,
  show
} from "../site/views.js";

async function withDocument(run) {
  const dom = new JSDOM("<!doctype html><main id='app'></main>");
  globalThis.document = dom.window.document;
  try {
    return await run(dom.window.document.querySelector("#app"));
  } finally {
    delete globalThis.document;
    dom.window.close();
  }
}

const attack = '<img src=x onerror="alert(1)">';
const lesson = {
  id: 1,
  sort_order: 1,
  icon: attack,
  title: attack,
  description: attack,
  mission: attack,
  duration_minutes: 10,
  level: attack
};

test("home and course views render backend fields as text", () => withDocument(root => {
  let selected = null;
  let followed = null;
  const recommendation = { lesson, action: "advance" };
  const handlers = {
    onView: () => {},
    onLesson: id => { selected = id; },
    onFollow: rec => { followed = rec; }
  };
  show(root, ...homeView({ first: attack, lessons: [lesson], done: [], percent: 0, recommendation }, handlers));
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector(".continue-card h3").textContent, attack);
  root.querySelector(".continue-card").click();
  assert.equal(followed, recommendation);

  show(root, ...coursesView({ profile: { learning_goal: attack }, lessons: [lesson], done: [], percent: 0 }, handlers));
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector(".section-title h2").textContent, `Plano: ${attack}`);
  assert.equal(root.querySelector(".course-card p").textContent, attack);
  root.querySelector(".course-card").click();
  assert.equal(selected, 1);
}));

test("lesson, account, and error messages cannot inject markup", () => withDocument(root => {
  const callbacks = { onBack: () => {}, onComplete: () => {}, onPortal: () => {}, onLogout: () => {} };
  show(root, ...lessonView(lesson, 1, false, callbacks));
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector(".instruction p").textContent, attack);

  show(root, ...accountView({
    first: "A", profile: { full_name: attack }, user: { email: attack },
    subscription: { access_ends_at: "2026-09-30T12:00:00Z" }
  }, callbacks));
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector(".profile-card h2").textContent, attack);
  assert.equal(root.querySelector(".profile-card p").textContent, attack);

  show(root, noticeView("Erro", attack));
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector(".instruction p").textContent, attack);
}));

test("lessonView's 'Não percebi' action renders the explanation inline, never navigates away, and escalates on repeat", () => withDocument(async root => {
  const explainCalls = [];
  let onCompleteCalled = false;
  const responses = ["Explicação alternativa.", "Explicação mais simples.", "Exercício prático guiado."];
  const onExplain = async () => {
    const response = responses[explainCalls.length] ?? responses[responses.length - 1];
    explainCalls.push(response);
    return { response };
  };
  show(root, ...lessonView(lesson, 1, false, {
    onBack: () => {},
    onComplete: () => { onCompleteCalled = true; },
    onExplain
  }));

  assert.equal(root.querySelector(".explanation-panel").classList.contains("hidden"), true);

  const explainButton = [...root.querySelectorAll("button")].find(b => b.textContent.includes("Não percebi"));
  explainButton.click();
  await new Promise(setImmediate);

  const panel = root.querySelector(".explanation-panel");
  assert.equal(panel.classList.contains("hidden"), false);
  assert.match(panel.textContent, /Explicação alternativa\./);
  assert.equal(panel.querySelector("img"), null);

  // Still fully able to complete the lesson normally with the explanation panel open.
  root.querySelector(".primary.full").click();
  assert.equal(onCompleteCalled, true);

  // "Ainda não percebi" repeats the request — escalation itself is decided server-side by
  // ai-tutor's attempt count, but the lesson view must keep surfacing each new response inline.
  const retryButton = [...panel.querySelectorAll("button")].find(b => b.textContent === "Ainda não percebi");
  retryButton.click();
  await new Promise(setImmediate);
  assert.match(root.querySelector(".explanation-panel").textContent, /Explicação mais simples\./);
  assert.equal(explainCalls.length, 2);

  // "Entendi agora" hides the panel without leaving the lesson.
  const understoodButton = [...root.querySelector(".explanation-panel").querySelectorAll("button")]
    .find(b => b.textContent === "Entendi agora");
  understoodButton.click();
  assert.equal(root.querySelector(".explanation-panel").classList.contains("hidden"), true);
}));

test("quizView never just says 'wrong': incorrect answers show an explanation, and it never navigates away before onFinish", () => withDocument(root => {
  const quiz = {
    questions: [
      { question: attack, options: ["a", attack, "c", "d"], correct_index: 1, explanation: attack },
      { question: "Q2?", options: ["a", "b", "c", "d"], correct_index: 0, explanation: "Porque sim." }
    ]
  };
  let finished = null;
  let skipped = false;
  show(root, ...quizView({ title: "Ficheiros" }, quiz, {
    onFinish: results => { finished = results; },
    onSkip: () => { skipped = true; }
  }));

  assert.equal(root.querySelector("img"), null);
  assert.match(root.querySelector(".quiz-container h3").textContent, /<img/);

  const options = [...root.querySelectorAll(".quiz-option")];
  options[0].click(); // wrong answer (correct_index is 1)

  assert.match(root.querySelector(".form-message").textContent, /Não é bem isso\./);
  assert.match(root.querySelector(".form-message").textContent, new RegExp(attack.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(options[0].classList.contains("incorrect"), true);
  assert.equal(options[1].classList.contains("correct"), true);
  assert.ok(options.every(optionButton => optionButton.disabled));

  root.querySelector(".form-message button").click(); // "Continuar" to the 2nd question
  assert.equal(finished, null);
  assert.match(root.querySelector(".quiz-container h3").textContent, /Q2\?/);

  root.querySelectorAll(".quiz-option")[0].click(); // correct answer on the last question
  assert.match(root.querySelector(".form-message").textContent, /Muito bem/);
  root.querySelector(".form-message button").click(); // "Ver resultado"

  assert.equal(finished.length, 2);
  assert.equal(finished[0].correct, false);
  assert.equal(finished[1].correct, true);

  root.querySelector(".text-button").click();
  assert.equal(skipped, true);
}));

test("quizResultView maps reinforce/practice/advance actions to distinct, safe-to-render copy", () => withDocument(root => {
  let continued = false;
  show(root, ...quizResultView(35, "reinforce", { onContinue: () => { continued = true; } }));
  assert.match(root.querySelector("h1").textContent, /reforçar/i);
  assert.equal(root.querySelector(".stat strong").textContent, "35%");

  show(root, ...quizResultView(90, "advance", { onContinue: () => {} }));
  assert.match(root.querySelector("h1").textContent, /avançar/i);

  show(root, ...quizResultView(60, "practice", { onContinue: () => { continued = true; } }));
  root.querySelector(".primary.full").click();
  assert.equal(continued, true);
}));

test("homeView renders distinct copy per recommended action and always keeps 'Ver todas as aulas'", () => withDocument(root => {
  const lessons = [{ ...lesson, id: 1 }];
  const handlers = { onView: () => {}, onFollow: () => {} };

  show(root, ...homeView({ first: "Ana", lessons, done: [], percent: 0, recommendation: { lesson: lessons[0], action: "advance" } }, handlers));
  assert.match(root.textContent, /PRÓXIMA AULA RECOMENDADA/);
  assert.ok([...root.querySelectorAll("button")].some(b => b.textContent === "Ver todas as aulas"));
  assert.ok([...root.querySelectorAll("button")].some(b => b.textContent === "Seguir recomendação"));

  show(root, ...homeView({ first: "Ana", lessons, done: [], percent: 0, recommendation: { lesson: lessons[0], action: "reinforce" } }, handlers));
  assert.match(root.textContent, /VAMOS REVER ISTO PRIMEIRO/);
  assert.match(root.textContent, /Ainda estás a praticar/);

  show(root, ...homeView({ first: "Ana", lessons, done: [], percent: 0, recommendation: { lesson: lessons[0], action: "practice" } }, handlers));
  assert.match(root.textContent, /MISSÃO RÁPIDA/);

  show(root, ...homeView({ first: "Ana", lessons, done: [], percent: 0, recommendation: { lesson: lessons[0], action: "review_prerequisite" } }, handlers));
  assert.match(root.textContent, /VAMOS REVER A BASE PRIMEIRO/);
}));

test("homeView never locks the learner out: clicking 'Ver todas as aulas' always works regardless of the recommendation", () => withDocument(root => {
  let viewed = null;
  const lessons = [{ ...lesson, id: 1 }];
  show(root, ...homeView(
    { first: "Ana", lessons, done: [], percent: 0, recommendation: { lesson: lessons[0], action: "reinforce" } },
    { onView: view => { viewed = view; }, onFollow: () => {} }
  ));
  [...root.querySelectorAll("button")].find(b => b.textContent === "Ver todas as aulas").click();
  assert.equal(viewed, "courses");
}));

test("practiceView renders the AI-provided mission as text and reports whichever outcome the learner picks", () => withDocument(root => {
  const outcomes = [];
  const mission = { mission: attack, difficulty: "standard" };
  show(root, ...practiceView(lesson, mission, { onOutcome: outcome => outcomes.push(outcome), onBack: () => {} }));

  assert.equal(root.querySelector("img"), null);
  assert.match(root.querySelector(".instruction p").textContent, new RegExp(attack.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const [consegui, precisoDeAjuda, naoConsegui] = root.querySelectorAll(".quick-questions button");
  assert.equal(consegui.textContent, "Consegui");
  assert.equal(precisoDeAjuda.textContent, "Preciso de ajuda");
  assert.equal(naoConsegui.textContent, "Não consegui");

  naoConsegui.click();
  assert.deepEqual(outcomes, ["Não consegui"]);
  assert.ok([...root.querySelectorAll(".quick-questions button")].every(b => b.disabled));
}));

test("home view handles an empty lesson list", () => withDocument(root => {
  show(root, ...homeView({ first: "Ana", lessons: [], done: [], percent: 0 }, {
    onView: () => {}, onLesson: () => {}
  }));
  assert.match(root.textContent, /As aulas aparecerão aqui em breve/);
}));

test("paywall text is safe and helper answers use DOM nodes", () => withDocument(root => {
  show(root, ...paywallView(attack, { onCheckout: () => {}, onLogout: () => {} }));
  assert.equal(root.querySelector("img"), null);
  assert.match(root.textContent, /Olá, <img/);

  show(root, ...helperView());
  root.querySelector(".quick-questions button").click();
  assert.equal(root.querySelector(".answer strong").textContent, "Lia:");
  assert.match(root.querySelector(".answer").textContent, /Ctrl \+ C/);
}));

test("Lia chat sends the learner's message with the right interaction_type and renders the reply as text", () => withDocument(async root => {
  const calls = [];
  const onAsk = async (lessonId, message, type) => {
    calls.push({ lessonId, message, type });
    return { response: attack };
  };
  show(root, ...helperView({ lessonId: 7, lessonTitle: "Ficheiros" }, { onAsk }));

  const input = root.querySelector(".chatbox input");
  const sendButton = root.querySelector(".chatbox button");
  input.value = "Não percebo a diferença";
  sendButton.click();
  await new Promise(setImmediate);

  assert.deepEqual(calls[0], { lessonId: 7, message: "Não percebo a diferença", type: "help_request" });
  assert.equal(root.querySelector(".lia-log img"), null);
  assert.match(root.querySelector(".lia-log").textContent, /<img/);
  assert.equal(input.value, "");
  assert.equal(input.disabled, false);
}));

test("Lia chat surfaces a friendly error and re-enables the input without breaking the interface", () => withDocument(async root => {
  const onAsk = async () => { throw new Error("A Lia está temporariamente indisponível."); };
  show(root, ...helperView({ lessonId: null }, { onAsk }));

  const input = root.querySelector(".chatbox input");
  const sendButton = root.querySelector(".chatbox button");
  input.value = "Olá";
  sendButton.click();
  await new Promise(setImmediate);

  assert.match(root.querySelector(".form-message").textContent, /temporariamente indisponível/);
  assert.equal(input.disabled, false);
  assert.equal(sendButton.disabled, false);
}));

test("Lia's quick-action buttons send the expected interaction_type", () => withDocument(async root => {
  const calls = [];
  const onAsk = async (lessonId, message, type) => { calls.push(type); return { response: "ok" }; };
  show(root, ...helperView({ lessonId: 1 }, { onAsk }));

  const [, tutorQuickQuestions] = root.querySelectorAll(".quick-questions");
  const buttons = tutorQuickQuestions.querySelectorAll("button");
  buttons[buttons.length - 1].click(); // "Guia-me passo a passo"
  await new Promise(setImmediate);

  assert.equal(calls[0], "hint");
}));
