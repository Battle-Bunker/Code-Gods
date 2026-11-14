/** The room's next step on v2 (ux-lessons 1.1–1.2): practice partners for a lone owner, Start once enough are in. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStep } from "../src/site/lib/next-step.ts";

const member = (name: string, o: { me?: boolean; owner?: boolean; spectator?: boolean; kind?: "human" | "practice" | "ai" } = {}) =>
  ({ memberId: name, name, kind: o.kind ?? "human", spectator: !!o.spectator, owner: !!o.owner, me: !!o.me });
const room = (members: ReturnType<typeof member>[], game: null | { phase: "planning" | "live" | "paused" | "ended" } = null) =>
  ({ members, game: game && { gameId: "g", number: 1, phase: game.phase }, bidding: null }) as never;

test("a lone owner is offered a practice game first, with the invite beside it", () => {
  const s = nextStep(room([member("Ada", { me: true, owner: true })]), 3);
  assert.equal(s.primary, "practice");
  assert.deepEqual(s.secondary, ["invite"]);
  assert.match(s.status, /A game needs three players\. Play a practice game against practice partners, or invite friends\./);
  assert.doesNotMatch(s.status, /not available/);
});

test("enough players: Start; a member waits for the owner; a visitor joins", () => {
  const three = [member("Ada", { me: true, owner: true }), member("P1", { kind: "practice" }), member("P2", { kind: "practice" })];
  assert.equal(nextStep(room(three), 3).primary, "start");
  const asBob = [member("Ada", { owner: true }), member("Bob", { me: true }), member("P1", { kind: "practice" })];
  assert.match(nextStep(room(asBob), 3).status, /Waiting for Ada to start the game\./);
  assert.equal(nextStep(room([member("Ada", { owner: true })]), 3).primary, "join");
});

test("a running game is opened, by players and watchers alike", () => {
  const s = nextStep(room([member("Ada", { me: true, owner: true })], { phase: "live" }), 3);
  assert.equal(s.primary, "openGame");
  assert.match(s.status, /You're playing in game 1\./);
  assert.match(nextStep(room([member("Ada", { me: true, spectator: true })], { phase: "planning" }), 3).status, /you're watching/);
});
