import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

test("module bootstraps the auth gate without creating global app state", async () => {
  const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "https://example.test/computador-facil/" });
  for (const name of ["document", "window", "location", "history", "localStorage"]) {
    globalThis[name] = dom.window[name];
  }
  dom.window.scrollTo = () => {};
  try {
    await import("../site/app.js");
    assert.equal(dom.window.document.querySelector("#authGate").classList.contains("hidden"), false);
    assert.equal(globalThis.session, undefined);
    dom.window.document.querySelector("#signupTab").click();
    assert.equal(dom.window.document.querySelector(".signup-only").classList.contains("hidden"), false);

    const attack = "<img src=x onerror=alert(1)>";
    const response = data => ({ ok: true, status: 200, json: async () => data });
    globalThis.fetch = async url => {
      if (url.includes("/auth/v1/token")) return response({ access_token: "test-token", user: { id: "user-1", email: "ana@example.com" } });
      if (url.includes("/profiles")) return response([{ full_name: "Ana", learning_goal: attack }]);
      if (url.includes("/subscriptions")) return response([{ status: "active", access_ends_at: "2100-01-01T00:00:00Z" }]);
      if (url.includes("/lessons")) return response([{ id: 1, title: attack, icon: attack, level: attack, duration_minutes: 10 }]);
      if (url.includes("/lesson_progress")) return response([]);
      throw new Error(`Unexpected request: ${url}`);
    };
    dom.window.document.querySelector("#loginTab").click();
    dom.window.document.querySelector("#authEmail").value = "ana@example.com";
    dom.window.document.querySelector("#authPassword").value = "password123";
    dom.window.document.querySelector("#authForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await new Promise(setImmediate);
    assert.equal(dom.window.document.querySelector(".continue-card h3").textContent, attack);
    assert.equal(dom.window.document.querySelector("#app img"), null);
  } finally {
    for (const name of ["document", "window", "location", "history", "localStorage", "fetch"]) delete globalThis[name];
    dom.window.close();
  }
});
