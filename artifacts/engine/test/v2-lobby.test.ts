/**
 * The v2 lobby (W3-3) on the live local backend: a room's seats and settings, practice partners, and the start, which
 * deals every seated member a converged rule and opens their account at the preset's starting energy.
 *
 * What would break: a start without enough players; a dealt rule without a converged artefact; a spectator dealt in;
 * another player's rule reaching a player; settings that the next game ignores.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { humans, perform, type Human } from "./v2-helpers.ts";

let ada: Human, bo: Human, cy: Human;
let roomId: string;

before(async () => {
  [ada, bo, cy] = await humans("Lobby Ada", "Lobby Bo", "Lobby Cy");
  const created = await perform(ada, "room.create", { name: "Lobby room" });
  ({ roomId } = created.result);
  await perform(bo, "room.join", { code: created.result.code });
  await perform(cy, "room.join", { code: created.result.code });
});

const room = () => ada.query("v2/rooms:get", { roomId });

test("seats: spectators, practice partners, removal, and the minimum to start", async () => {
  assert.deepEqual((await perform(cy, "room.setSpectator", { spectator: true }, { roomId })).ok, true);
  const tooFew = await perform(ada, "game.start", {}, { roomId });
  assert.equal(tooFew.error.code, "refused");
  assert.equal(tooFew.error.fix, "seats.fillPracticePartners");

  assert.equal((await perform(bo, "seats.fillPracticePartners", {}, { roomId })).error.code, "refused", "owner only");
  assert.deepEqual((await perform(ada, "seats.fillPracticePartners", {}, { roomId })).result, { added: 1 });
  assert.deepEqual((await perform(ada, "seats.fillPracticePartners", {}, { roomId })).result, { added: 0 }, "already enough");
  const partner = (await room()).members.find((m: any) => m.kind === "practice");
  assert.ok(partner);
  const notAi = (await room()).members.find((m: any) => m.kind === "human" && !m.me);
  try { await perform(ada, "seats.removeAi", { memberId: notAi.memberId }, { roomId }); assert.fail("a human is not removable"); } catch (e) {
    assert.equal((e as any).data?.error?.code, "failed");
  }
  assert.equal((await perform(ada, "seats.removeAi", { memberId: partner.memberId }, { roomId })).ok, true);
  assert.equal((await room()).members.filter((m: any) => m.kind === "practice").length, 0);
  await perform(ada, "seats.fillPracticePartners", {}, { roomId });
  const names = (await room()).members.map((m: any) => m.name);
  assert.equal(new Set(names).size, names.length, "a refill never repeats a name");
});

test("settings: an unknown preset is refused; overrides reach the next game", async () => {
  try { await perform(ada, "room.settings", { preset: "nope" }, { roomId }); assert.fail("unknown preset"); } catch (e) {
    assert.equal((e as any).data?.error?.code, "failed");
  }
  assert.equal((await perform(ada, "room.settings", { overrides: { planningSeconds: 30, startingEnergy: 150 } }, { roomId })).ok, true);
  assert.deepEqual((await room()).overrides, { planningSeconds: 30, startingEnergy: 150 });
  await perform(ada, "room.settings", { overrides: {} }, { roomId });
  assert.deepEqual((await room()).overrides, {}, "an empty override list restores the preset's values");
  await perform(ada, "room.settings", { overrides: { planningSeconds: 30, startingEnergy: 150 } }, { roomId });
});

test("the start deals every seated member a converged rule and opens their accounts", async () => {
  assert.deepEqual((await perform(ada, "game.rotation", {}, { roomId }, "query")).result, { seats: [] }, "a first game is dealt fresh");
  const started = await perform(ada, "game.start", {}, { roomId });
  assert.equal(started.ok, true, JSON.stringify(started));
  const { gameId } = started.result;
  const header = await ada.query("v2/games:header", { gameId });
  assert.equal(header.phase, "planning");
  assert.equal(header.planningSeconds, 30);
  assert.equal(header.roster.length, 3, "Ada, Bo and the practice partner; Cy watches");
  assert.ok(header.planningEndsAt > Date.now());
  assert.equal((await room()).game.gameId, gameId);

  for (const h of [ada, bo]) {
    const rule = await h.query("v2/play:myRule", { gameId });
    assert.ok(rule.ruleKey.includes(rule.family) && rule.tieBreaker, rule.ruleKey);
    assert.equal(rule.layers.length, 2);
    assert.ok(rule.ladder.at(-1).rarityBits > 0, "rarities from the artefact");
    const me = await h.query("v2/play:me", { gameId });
    assert.deepEqual([me.energy, me.agents, me.ready], [150, 0, false]);
  }
  assert.equal((await cy.query("v2/games:header", { gameId })).me, null, "the spectator is not dealt in");
  const explained = await perform(bo, "rule.explain", {}, { gameId }, "query");
  assert.equal(explained.result.wonByBid, null);
  assert.equal((await perform(ada, "game.start", {}, { roomId })).error.code, "refused", "one game at a time");
});

test("a preset with a bid phase is refused until the bid phase is built", async () => {
  const created = await perform(ada, "room.create", { name: "Bid room", preset: "lines-beginner-bidding" });
  const bidRoom = created.result.roomId;
  await perform(ada, "seats.fillPracticePartners", {}, { roomId: bidRoom });
  try { await perform(ada, "game.start", {}, { roomId: bidRoom }); assert.fail("refused"); } catch (e) {
    assert.match((e as any).data?.error?.message, /bid phase/);
  }
});
