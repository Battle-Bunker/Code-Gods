/** The viewer's affordance context from the page's subscriptions: the page, the principal and the facts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { refusal, AFFORDANCES } from "@workspace/v2-affordances";
import { affordanceContext } from "../src/core/affordance-context.ts";

const room = (o: { me?: boolean; owner?: boolean; spectator?: boolean } = {}) => ({
  preset: "lines-beginner", bidding: null,
  members: [{ memberId: "m1", name: "Ada", kind: "human", spectator: !!o.spectator, owner: !!o.owner, me: o.me ?? true }],
}) as never;

test("home, room and a game's phase are the contexts; the principal follows the room's members", () => {
  assert.equal(affordanceContext({ signedIn: false, admin: false }).context, "signedOut");
  assert.equal(affordanceContext({ signedIn: true, admin: false }).context, "home");
  const r = affordanceContext({ signedIn: true, admin: false, room: room({ owner: true }) });
  assert.equal(r.context, "room");
  assert.deepEqual(r.principal, { signedIn: true, member: true, seated: true, owner: true, admin: false });
  assert.deepEqual(r.room, { players: 1, minPlayers: 3, bidOpen: false });
  const g = affordanceContext({ signedIn: true, admin: false, room: room(), header: { phase: "live", me: null } as never });
  assert.equal(g.context, "live");
  assert.equal(g.principal.seated, false, "a member without a seat in the game watches it");
});

test("the directory's own checks run on it: a lone owner cannot start, a member cannot change settings", () => {
  const owner = affordanceContext({ signedIn: true, admin: false, room: room({ owner: true }) });
  assert.ok(refusal(AFFORDANCES["game.start"], owner), "three players are needed");
  assert.equal(refusal(AFFORDANCES["seats.fillPracticePartners"], owner), null);
  const member = affordanceContext({ signedIn: true, admin: false, room: room() });
  assert.ok(refusal(AFFORDANCES["room.settings"], member));
});
