/**
 * Updating a hosted client after a deploy (src/update.ts): the pure rules. What would break: a tab reloading under a
 * player who is typing or has an unsaved form open, a tab never reloading although nobody is using it, a reload loop
 * when the newest build is not live yet, a dev-server or freshly uploaded build reloading itself for nothing, and an
 * old client's rejected call showing a raw error instead of updating.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";
import {
  UPDATE_TIMING as T, assessBuild, decideUpdate, incompatibility, mayReload, readBuildMeta, updateTarget, type Safety, type SiteVersion,
} from "../src/update.ts";

const site = (build: string): SiteVersion => ({ build, deployedAt: 1 });

test("assessBuild: current when the live build, outdated only when deployed here before, else unknown", () => {
  assert.equal(assessBuild("B", site("B"), true), "current");
  assert.equal(assessBuild("A", site("B"), true), "outdated");
  // Uploaded but not yet recorded (the moment between upload and record), or a build never deployed here: no action.
  assert.equal(assessBuild("C", site("B"), false), "unknown");
  assert.equal(assessBuild("C", site("B"), undefined), "unknown");
  // A dev server has no build id; nothing recorded yet.
  assert.equal(assessBuild(null, site("B"), true), "unknown");
  assert.equal(assessBuild("A", null, true), "unknown");
});

test("updateTarget: an outdated build targets the live one; an incompatible call is urgent; a current build waits for the next", () => {
  assert.deepEqual(updateTarget("A", site("B"), true, null), { target: "B", urgent: false });
  assert.deepEqual(updateTarget("A", site("B"), true, "shape"), { target: "B", urgent: true });
  assert.deepEqual(updateTarget("A", site("B"), true, "client-outdated"), { target: "B", urgent: true });
  // The functions went out before the static site: nothing newer to load yet.
  assert.equal(updateTarget("B", site("B"), true, "client-outdated"), null);
  // A validation error from a build the server does not know as old is not evidence of an old client.
  assert.equal(updateTarget("C", site("B"), false, "shape"), null);
  assert.equal(updateTarget("C", site("B"), false, null), null);
  // The server says this client is too old, but its build was never recorded: reload once to whatever is live.
  assert.deepEqual(updateTarget("C", site("B"), false, "client-outdated"), { target: "incompatible:C", urgent: true });
  assert.equal(updateTarget(null, site("B"), false, "client-outdated"), null, "a dev server is never reloaded");
});

const NOW = 1_000_000;
const calm: Safety = { now: NOW, hidden: false, lastInputAt: NOW - 10_000, lastKeyAt: 0, editing: false, draftOpen: false, unsaved: false, busy: false, urgent: false, countdownSince: null };

test("decideUpdate: a visible, untouched page counts down, then reloads", () => {
  assert.deepEqual(decideUpdate(calm), { action: "countdown", remainingMs: T.countdownMs });
  assert.deepEqual(decideUpdate({ ...calm, countdownSince: NOW - 2_000 }), { action: "countdown", remainingMs: T.countdownMs - 2_000 });
  assert.deepEqual(decideUpdate({ ...calm, countdownSince: NOW - T.countdownMs }), { action: "reload" });
});

test("decideUpdate: any input during the countdown starts it again, so a player clicking or dragging is never cut off", () => {
  assert.deepEqual(decideUpdate({ ...calm, countdownSince: NOW - T.countdownMs, lastInputAt: NOW - 1_000 }), { action: "countdown", remainingMs: T.countdownMs - 1_000 });
  assert.deepEqual(decideUpdate({ ...calm, countdownSince: NOW - 4_000, lastInputAt: NOW }), { action: "countdown", remainingMs: T.countdownMs });
});

test("decideUpdate: never while a request is in flight, however safe otherwise", () => {
  for (const s of [{ hidden: true }, { lastInputAt: 0 }, { urgent: true }, { countdownSince: 0 }]) {
    assert.deepEqual(decideUpdate({ ...calm, ...s, busy: true }), { action: "wait", reason: "busy" });
  }
});

test("decideUpdate: an open draft or a focused field waits while the player is there", () => {
  assert.deepEqual(decideUpdate({ ...calm, draftOpen: true }), { action: "wait", reason: "draft" });
  assert.deepEqual(decideUpdate({ ...calm, editing: true, countdownSince: NOW - T.countdownMs }), { action: "wait", reason: "draft" });
});

test("decideUpdate: a hidden or idle tab reloads at once, a persisted draft notwithstanding", () => {
  assert.deepEqual(decideUpdate({ ...calm, draftOpen: true, editing: true, hidden: true }), { action: "reload" });
  assert.deepEqual(decideUpdate({ ...calm, draftOpen: true, lastInputAt: NOW - T.idleMs }), { action: "reload" });
  assert.deepEqual(decideUpdate({ ...calm, draftOpen: true, lastInputAt: NOW - T.idleMs + 1 }), { action: "wait", reason: "draft" });
});

test("decideUpdate: input nobody persists blocks every automatic reload", () => {
  for (const s of [{ hidden: true }, { lastInputAt: 0 }, { urgent: true }, { countdownSince: 0 }]) {
    assert.deepEqual(decideUpdate({ ...calm, ...s, unsaved: true }), { action: "wait", reason: "unsaved" });
  }
});

test("decideUpdate: an incompatible client reloads now (drafts are persisted), unless the player is mid-keystroke", () => {
  assert.deepEqual(decideUpdate({ ...calm, urgent: true, draftOpen: true, editing: true, lastKeyAt: NOW - T.typingMs }), { action: "reload" });
  assert.deepEqual(decideUpdate({ ...calm, urgent: true, draftOpen: true, editing: true, lastKeyAt: NOW - 100 }), { action: "wait", reason: "draft" });
});

test("mayReload: one automatic reload per target per retry window, so a page whose new build is not served yet never loops", () => {
  assert.equal(mayReload(null, "B", NOW), true);
  assert.equal(mayReload({ target: "B", at: NOW - 1_000 }, "B", NOW), false);
  assert.equal(mayReload({ target: "B", at: NOW - T.retryMs }, "B", NOW), true);
  assert.equal(mayReload({ target: "A", at: NOW - 1_000 }, "B", NOW), true, "a newer target is a new attempt");
});

test("incompatibility: the CLIENT_OUTDATED code, or the shape errors an old client's call gets from a newer server", () => {
  assert.equal(incompatibility(new ConvexError({ code: "CLIENT_OUTDATED", message: "old" })), "client-outdated");
  assert.equal(incompatibility(new Error("[CONVEX M(assistant:send)] [Request ID: 1] Server Error\nArgumentValidationError: Object contains extra field `x` that is not in the validator.")), "shape");
  assert.equal(incompatibility(new Error("[CONVEX Q(old:gone)] [Request ID: 1] Server Error\nCould not find public function for 'old:gone'. Did you forget to run `npx convex dev`?")), "shape");
  assert.equal(incompatibility(new ConvexError({ code: "CONFLICT", message: "That conversation belongs to an earlier game" })), null);
  assert.equal(incompatibility(new Error("network down")), null);
  assert.equal(incompatibility(undefined), null);
});

test("readBuildMeta: the build id Vite wrote into index.html, else null", () => {
  assert.equal(readBuildMeta(`<head>\n<meta name="code-gods-build" content="0123abcd">\n</head>`), "0123abcd");
  assert.equal(readBuildMeta(`<head><meta name="viewport" content="x"></head>`), null);
});
