import assert from "node:assert/strict";
import test from "node:test";
import { firstName, hasAccess, progress } from "../site/model.js";

test("access requires an active entitlement with a future end date", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  assert.equal(hasAccess({ status: "active", access_ends_at: "2026-09-15T12:00:00Z" }, now), true);
  assert.equal(hasAccess({ status: "trialing", access_ends_at: "2026-09-15T12:00:00Z" }, now), true);
  assert.equal(hasAccess({ status: "canceled", access_ends_at: "2026-09-15T12:00:00Z" }, now), false);
  assert.equal(hasAccess({ status: "active", access_ends_at: "2026-09-13T12:00:00Z" }, now), false);
});

test("display name and progress tolerate empty data", () => {
  assert.equal(firstName(null, { email: "ana@example.com" }), "ana");
  assert.equal(firstName({ full_name: "  Beatriz Silva" }, null), "Beatriz");
  assert.equal(firstName(null, null), "Amigo");
  assert.equal(progress([], []), 0);
  assert.equal(progress([1], [{ id: 1 }, { id: 2 }]), 50);
});
