import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { accountView, coursesView, helperView, homeView, lessonView, noticeView, paywallView, show } from "../site/views.js";

function withDocument(run) {
  const dom = new JSDOM("<!doctype html><main id='app'></main>");
  globalThis.document = dom.window.document;
  try {
    return run(dom.window.document.querySelector("#app"));
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
