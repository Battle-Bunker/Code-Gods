/**
 * What the viewer can do (src/core/affordances.ts), the one source every panel reads before it renders a control.
 * What would break: a read-only replay (or a read-only credential) still showing Edit a copy, Destroy, Summon, the chat
 * box; an ended game still offering Destroy; a disabled control with no reason; a replay seen
 * as another god labelling that god's agents as "yours".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { deriveAffordances, ownerPhrase, type AffordanceContext } from "../src/core/affordances.ts";

const live: AffordanceContext = { replay: false, permission: "act", phase: "running", seated: true, hasObservation: true, unknownOutcome: false, busy: false };
const MUTATING = ["editCode", "validate", "summon", "destroy", "allocatePower", "chat", "roomStep"] as const;

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
  for (const action of MUTATING) {
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
  assert.ok(!a.can.validate.ok && !a.can.validate.hidden && /validated/.test(a.can.validate.reason));
  assert.deepEqual(a.can.editCode, { ok: true }, "the code can be kept for the next game");
  assert.deepEqual(a.can.chat, { ok: true }, "room chat continues after a game");
});

test("transient states disable (never hide) and say why: busy, unknown outcome, no observation, sandbox warming, spectating", () => {
  const busy = deriveAffordances({ ...live, busy: true });
  assert.ok(!busy.can.destroy.ok && !busy.can.destroy.hidden && /running/.test(busy.can.destroy.reason));
  assert.deepEqual(busy.can.chat, { ok: true }, "typing in chat goes on while a command runs");
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

test("look: only in a paid-observation game, only seated; off with the price and the balance when unaffordable", () => {
  assert.ok(!deriveAffordances(live).can.look.ok && (deriveAffordances(live).can.look as { hidden: boolean }).hidden, "free looking: no Look control at all");
  const paid = { ...live, look: { price: 1.66, energy: 5 } };
  assert.deepEqual(deriveAffordances(paid).can.look, { ok: true });
  for (const hidden of [{ ...paid, seated: false }, { ...paid, replay: true }, { ...paid, permission: "read" as const }]) {
    const c = deriveAffordances(hidden).can.look;
    assert.ok(!c.ok && c.hidden);
  }
  const poor = deriveAffordances({ ...paid, look: { price: 1.66, energy: 0.4 } }).can.look;
  assert.ok(!poor.ok && !poor.hidden);
  assert.equal(!poor.ok && poor.reason, "A look costs 1.66 energy; you have 0.40");
  for (const phase of ["lobby", "ended"] as const) {
    const c = deriveAffordances({ ...paid, phase }).can.look;
    assert.ok(!c.ok && !c.hidden && c.reason.length > 0, `${phase}: visible, off, with a reason`);
  }
  const busy = deriveAffordances({ ...paid, busy: true }).can.look;
  assert.ok(!busy.ok && !busy.hidden && /running/.test(busy.reason));
  assert.deepEqual(deriveAffordances({ ...paid, phase: "paused" }).can.look, { ok: true }, "a pause is a good moment to look");
});

test("a replay seen as another god names that god; seen as yourself it says you", () => {
  assert.equal(ownerPhrase(null), "your");
  assert.equal(ownerPhrase("Opcode Owl"), "Opcode Owl's");
  assert.equal(ownerPhrase("Ross"), "Ross'");
});
