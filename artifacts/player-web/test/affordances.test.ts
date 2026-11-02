/**
 * What the viewer can do (src/core/affordances.ts), the one source every panel reads before it renders a control.
 * What would break: a read-only replay (or a read-only credential) still showing Edit a copy, Destroy, Summon, the chat
 * box or an assistant approval; an ended game still offering Destroy; a disabled control with no reason; a replay seen
 * as another god labelling that god's agents as "yours".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { deriveAffordances, ownerPhrase, type AffordanceContext } from "../src/core/affordances.ts";

const live: AffordanceContext = { replay: false, permission: "act", phase: "running", seated: true, hasObservation: true, unknownOutcome: false, busy: false };
const MUTATING = ["editCode", "validate", "summon", "destroy", "chat", "approve", "roomStep"] as const;

test("a read-only replay hides every mutating control, with the replay as the reason", () => {
  for (const phase of ["planning", "running", "paused", "ended"] as const) {
    const a = deriveAffordances({ ...live, replay: true, phase });
    assert.equal(a.readOnly, true);
    for (const action of MUTATING) {
      const c = a.can[action];
      assert.equal(c.ok, false, `${action} at ${phase}`);
      assert.equal(!c.ok && c.hidden, true, `${action} is hidden, not just disabled, at ${phase}`);
      assert.match(!c.ok ? c.reason : "", /replay/i);
    }
  }
});

test("a read-only credential hides the same controls, saying the connection is read-only", () => {
  const a = deriveAffordances({ ...live, permission: "read" });
  assert.equal(a.readOnly, true);
  for (const action of MUTATING.filter(x => x !== "approve")) {
    const c = a.can[action];
    assert.ok(!c.ok && c.hidden, action);
    assert.match(!c.ok ? c.reason : "", /read-only/);
  }
});

test("live and seated while the world runs: everything is offered", () => {
  const a = deriveAffordances(live);
  assert.equal(a.readOnly, false);
  assert.equal(a.readOnlyReason, null);
  for (const action of MUTATING) assert.deepEqual(a.can[action], { ok: true }, action);
});

test("after the end of a live game: Destroy goes; Validate and Summon stay visible but off, saying why; code and chat stay", () => {
  const a = deriveAffordances({ ...live, phase: "ended" });
  assert.ok(!a.can.destroy.ok && a.can.destroy.hidden);
  assert.ok(!a.can.summon.ok && !a.can.summon.hidden && /over/.test(a.can.summon.reason));
  assert.ok(!a.can.validate.ok && !a.can.validate.hidden);
  assert.deepEqual(a.can.editCode, { ok: true }, "the code can be kept for the next game");
  assert.deepEqual(a.can.chat, { ok: true }, "room chat continues after a game");
});

test("transient states disable (never hide) and say why: busy, unknown outcome, no observation, sandbox warming, spectating", () => {
  const busy = deriveAffordances({ ...live, busy: true });
  assert.ok(!busy.can.destroy.ok && !busy.can.destroy.hidden && /running/.test(busy.can.destroy.reason));
  const unknown = deriveAffordances({ ...live, unknownOutcome: true });
  assert.ok(!unknown.can.chat.ok && !unknown.can.chat.hidden && /unknown/.test(unknown.can.chat.reason));
  const loading = deriveAffordances({ ...live, hasObservation: false, phase: undefined });
  assert.ok(!loading.can.summon.ok && !loading.can.summon.hidden);
  const warming = deriveAffordances({ ...live, sandbox: { ready: false, text: "Agent sandbox warming up…" } });
  assert.ok(!warming.can.summon.ok && warming.can.summon.reason === "Agent sandbox warming up…");
  assert.deepEqual(warming.can.destroy, { ok: true }, "the sandbox only gates examining code");
  const watching = deriveAffordances({ ...live, seated: false });
  assert.ok(!watching.can.summon.ok && /next one/.test(watching.can.summon.reason));
  assert.ok(!watching.can.destroy.ok && watching.can.destroy.hidden, "a spectator has no agents to destroy");
});

test("in the lobby nothing can be summoned or destroyed yet, but the room's next step (start) can be taken", () => {
  const a = deriveAffordances({ ...live, phase: "lobby" });
  assert.ok(!a.can.summon.ok && !a.can.summon.hidden);
  assert.ok(!a.can.destroy.ok && a.can.destroy.hidden);
  assert.deepEqual(a.can.roomStep, { ok: true });
});

test("a replay seen as another god names that god; seen as yourself it says you", () => {
  assert.equal(ownerPhrase(null), "your");
  assert.equal(ownerPhrase("Opcode Owl"), "Opcode Owl's");
  assert.equal(ownerPhrase("Ross"), "Ross'");
});
