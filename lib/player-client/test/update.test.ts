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

const site = (build: string, ...older: string[]): SiteVersion => ({ build, deployedAt: 1, recent: [build, ...older] });

test("assessBuild: current when the latest build, outdated only when an earlier recorded build, else unknown", () => {
  assert.equal(assessBuild("B", site("B", "A")), "current");
  assert.equal(assessBuild("A", site("B", "A")), "outdated");
  // Uploaded but not yet recorded (the moment between upload and record), or a build never deployed here: no action.
  assert.equal(assessBuild("C", site("B", "A")), "unknown");
  // A dev server has no build id; nothing recorded yet.
  assert.equal(assessBuild(null, site("B", "A")), "unknown");
  assert.equal(assessBuild("A", null), "unknown");
  // A rollback to A records A again: a tab on B is now behind.
  assert.equal(assessBuild("B", site("A", "B", "A")), "outdated");
});

test("updateTarget: an outdated build targets the latest; an incompatible call is urgent; a current build waits for the next", () => {
  assert.deepEqual(updateTarget("A", site("B", "A"), null), { target: "B", urgent: false });
  assert.deepEqual(updateTarget("A", site("B", "A"), "shape"), { target: "B", urgent: true });
  assert.deepEqual(updateTarget("A", site("B", "A"), "client-outdated"), { target: "B", urgent: true });
  // The functions went out before the static site: nothing newer to load yet.
  assert.equal(updateTarget("B", site("B", "A"), "client-outdated"), null);
  // A validation error from a build the server does not know as old is not evidence of an old client.
  assert.equal(updateTarget("C", site("B", "A"), "shape"), null);
  assert.equal(updateTarget("C", site("B", "A"), null), null);
  // The server says this client is too old, but its build was never recorded: reload once to the live page.
  assert.deepEqual(updateTarget("C", site("B", "A"), "client-outdated"), { target: "incompatible:C", urgent: true });
  assert.equal(updateTarget(null, site("B"), "client-outdated"), null, "a dev server is never reloaded");
});

const NOW = 1_000_000;
const calm: Safety = { now: NOW, hidden: false, lastInputAt: NOW - 5_000, lastKeyAt: 0, editing: false, draftOpen: false, unsaved: false, urgent: false, countdownSince: null };

test("decideUpdate: a visible, untouched page counts down, then reloads", () => {
  assert.deepEqual(decideUpdate(calm), { action: "countdown", remainingMs: T.countdownMs });
  assert.deepEqual(decideUpdate({ ...calm, countdownSince: NOW - 2_000 }), { action: "countdown", remainingMs: T.countdownMs - 2_000 });
  assert.deepEqual(decideUpdate({ ...calm, countdownSince: NOW - T.countdownMs }), { action: "reload" });
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

test("bundleBuildId: follows every emitted byte and name, ignores index.html and key order", async () => {
  const { bundleBuildId } = await import("../src/vite-build-id.ts");
  const js = { type: "chunk" as const, fileName: "assets/index-1.js", code: "console.log(1)" };
  const css = { type: "asset" as const, fileName: "assets/index-2.css", source: new Uint8Array([98, 111]) };
  const html = { type: "asset" as const, fileName: "index.html", source: "<html>" };
  const id = bundleBuildId({ [js.fileName]: js, [css.fileName]: css, [html.fileName]: html });
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(bundleBuildId({ [html.fileName]: { ...html, source: "<html lang=en>" }, [css.fileName]: css, [js.fileName]: js }), id);
  assert.notEqual(bundleBuildId({ [js.fileName]: { ...js, code: "console.log(2)" }, [css.fileName]: css }), id);
  assert.notEqual(bundleBuildId({ "assets/index-3.js": js, [css.fileName]: css }), id);
});
