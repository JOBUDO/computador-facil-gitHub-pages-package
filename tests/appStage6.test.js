import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

test("Stage 6: a learner_mastery database failure degrades to the sequential fallback instead of blocking the whole app", async () => {
  const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://example.test/computador-facil/" });
  for (const name of ["document", "window", "location", "history", "localStorage"]) {
    globalThis[name] = dom.window[name];
  }
  dom.window.scrollTo = () => {};
  try {
    await import("../site/app.js");
    const response = data => ({ ok: true, status: 200, json: async () => data });
    globalThis.fetch = async url => {
      if (url.includes("/auth/v1/token")) return response({ access_token: "test-token", user: { id: "user-1", email: "ana@example.com" } });
      if (url.includes("/profiles")) return response([{ full_name: "Ana", learning_goal: "Começar do zero" }]);
      if (url.includes("/subscriptions")) return response([{ status: "active", access_ends_at: "2100-01-01T00:00:00Z" }]);
      if (url.includes("/lessons")) return response([{ id: 1, title: "Rato", icon: "🖱", level: "Iniciante", duration_minutes: 10 }]);
      if (url.includes("/lesson_progress")) return response([]);
      if (url.includes("/learner_mastery")) return { ok: false, status: 500, json: async () => ({ message: "boom" }) };
      throw new Error(`Unexpected request: ${url}`);
    };
    dom.window.document.querySelector("#loginTab").click();
    dom.window.document.querySelector("#authEmail").value = "ana@example.com";
    dom.window.document.querySelector("#authPassword").value = "password123";
    dom.window.document.querySelector("#authForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise(setImmediate);
    // The account still loads and shows the plain sequential recommendation, not an error screen.
    assert.equal(dom.window.document.querySelector(".continue-card h3").textContent, "Rato");
    assert.match(dom.window.document.querySelector("#app").textContent, /PRÓXIMA AULA RECOMENDADA/);
  } finally {
    for (const name of ["document", "window", "location", "history", "localStorage", "fetch"]) delete globalThis[name];
    dom.window.close();
  }
});
