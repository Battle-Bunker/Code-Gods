/**
 * Action confirmations for sandboxed panels (src/frame/action-policy.ts): which commands need the player's
 * confirmation, and when a "let it act without asking" grant stops counting.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { decide, initialPolicy, policyReducer, type PanelInfo, type PolicyState } from "../src/frame/action-policy.ts";

const panel = (over: Partial<PanelInfo> = {}): PanelInfo => ({ key: "stored:tool", currentVersion: 3, lastForeignVersion: 0, ...over });
const run = (state: PolicyState, ...events: Parameters<typeof policyReducer>[1][]) => events.reduce(policyReducer, state);

test("chat, summon, replace, destroy and pause ask; check and ready do not", () => {
  const s = initialPolicy();
  for (const type of ["chat.send", "agent.summon", "agent.replace", "agent.destroy", "game.pause"] as const) assert.equal(decide(s, panel(), type), "confirm", type);
  for (const type of ["agent.check", "game.ready"] as const) assert.equal(decide(s, panel(), type), "allow", type);
});

test("a confirmation request is pending until confirmed or declined, one at a time in order", () => {
  let s = run(initialPolicy(),
    { type: "request", id: "a", panel: panel(), command: { op: "chat.send", args: { text: "hi" } } },
    { type: "request", id: "b", panel: panel(), command: { op: "game.pause", args: {} } });
  assert.deepEqual(s.pending.map(p => p.id), ["a", "b"]);
  s = run(s, { type: "decline", id: "a" });
  assert.deepEqual(s.pending.map(p => p.id), ["b"]);
  assert.deepEqual(s.settled.at(-1), { id: "a", approved: false });
  s = run(s, { type: "confirm", id: "b" });
  assert.deepEqual(s.pending, []);
  assert.deepEqual(s.settled.at(-1), { id: "b", approved: true });
  assert.equal(decide(s, panel(), "chat.send"), "confirm", "a plain confirmation grants nothing");
});

test("'let it act' grants the current version; browser edits keep it, a non-browser author's version voids it", () => {
  let s = run(initialPolicy(), { type: "request", id: "a", panel: panel(), command: { op: "chat.send", args: { text: "x" } } },
    { type: "confirm", id: "a", alwaysAllow: true });
  assert.equal(decide(s, panel(), "agent.summon"), "allow");
  // The player edits it in the browser (v4, lastForeign still 0): still granted.
  assert.equal(decide(s, panel({ currentVersion: 4 }), "chat.send"), "allow");
  // An agent writes v5: the grant no longer counts, and reconciling with the panel list drops it.
  const agentWrote = panel({ currentVersion: 5, lastForeignVersion: 5 });
  assert.equal(decide(s, agentWrote, "chat.send"), "confirm");
  s = run(s, { type: "panels", panels: [agentWrote] });
  assert.deepEqual(s.grants, {});
  assert.equal(decide(s, panel({ currentVersion: 6, lastForeignVersion: 5 }), "chat.send"), "confirm", "a later browser edit does not revive it");
});

test("a grant made after an agent's version counts; grants are per panel; revoke and removal drop them", () => {
  let s = run(initialPolicy(), { type: "grant", panel: panel({ currentVersion: 5, lastForeignVersion: 5 }) });
  assert.equal(decide(s, panel({ currentVersion: 5, lastForeignVersion: 5 }), "chat.send"), "allow");
  assert.equal(decide(s, panel({ key: "stored:other" }), "chat.send"), "confirm");
  s = run(s, { type: "revoke", key: "stored:tool" });
  assert.equal(decide(s, panel({ currentVersion: 5, lastForeignVersion: 5 }), "chat.send"), "confirm");
  s = run(s, { type: "grant", panel: panel() }, { type: "panels", panels: [] });
  assert.deepEqual(s.grants, {}, "a removed panel's grant goes too");
});

test("confirming or declining an unknown request changes nothing", () => {
  const s = initialPolicy();
  assert.equal(policyReducer(s, { type: "confirm", id: "nope" }), s);
  assert.equal(policyReducer(s, { type: "decline", id: "nope" }), s);
});
