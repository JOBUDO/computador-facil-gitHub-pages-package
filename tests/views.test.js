import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { accountView, coursesView, helperView, homeView, lessonView, noticeView, paywallView, show } from "../site/views.js";

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
  const handlers = { onView: () => {}, onLesson: id => { selected = id; } };
  show(root, ...homeView({ first: attack, lessons: [lesson], done: [], percent: 0 }, handlers));
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector(".continue-card h3").textContent, attack);
  root.querySelector(".continue-card").click();
  assert.equal(selected, 1);

  show(root, ...coursesView({ profile: { learning_goal: attack }, lessons: [lesson], done: [], percent: 0 }, handlers));
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector(".section-title h2").textContent, `Plano: ${attack}`);
  assert.equal(root.querySelector(".course-card p").textContent, attack);
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
