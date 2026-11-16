/**
 * The v2 lobby (W3-3) on the live local backend: a room's seats and settings, practice partners, and the start, which
 * deals every seated member a converged rule and opens their account at the preset's starting energy.
 *
 * What would break: a start without enough players; a dealt rule without a converged artefact; a spectator dealt in;
 * another player's rule reaching a player; settings that the next game ignores.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

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
    // A line rule is one utility scored by energy (decision 50, energy.md): no tie-breaker and no value table.
    assert.ok(rule.ruleKey.includes(rule.family) && rule.tieBreaker === null, rule.ruleKey);
    assert.equal(rule.layers.length, 1);
    assert.equal(rule.value, null, "a dynamic rule has no value table");
    const me = await h.query("v2/playState:me", { gameId });
    assert.deepEqual([me.energy, me.agents, me.ready], [150, 0, false]);
  }
  assert.equal((await cy.query("v2/games:header", { gameId })).me, null, "the spectator is not dealt in");
  const explained = await perform(bo, "rule.explain", {}, { gameId }, "query");
  assert.equal(explained.result.wonByBid, null);
  assert.equal((await perform(ada, "game.start", {}, { roomId })).error.code, "refused", "one game at a time");
});

test("the setup picker: the server's own presets, and nothing else; a family's value curves", async () => {
  const [plain] = await humans("Lobby Plain");
  const presets = await plain!.query("v2/setups:presets", {});
  assert.ok(presets.some((p: any) => p.id === "lines-beginner" && p.families.length > 1), JSON.stringify(presets.map((p: any) => p.id)));
  assert.ok(presets.some((p: any) => p.bid), "the bidding preset says so");
  const created = await perform(plain!, "room.create", { name: "Plain room", preset: "lab-whatever" }).catch((e: any) => e.data);
  assert.match(created.error.message, /No preset/, "an id the server does not deploy is refused on the server");
  const room = (await perform(plain!, "room.create", { name: "Plain room" })).result.roomId;
  const changed = await perform(plain!, "room.settings", { preset: "test-anything" }, { roomId: room }).catch((e: any) => e.data);
  assert.match(changed.error.message, /No preset/);

  const rules = await plain!.query("v2/gallery:family", { preset: "lines-beginner", family: "power-hug" });
  assert.ok(rules.length > 0, "the family's dealable rules");
  // A dynamic rule has no value curve (energy.md): its card says what it wants.
  for (const r of rules) assert.ok(r.points.length === 0 && /power of/.test(r.card), r.card);
  assert.deepEqual(await plain!.query("v2/gallery:family", { preset: "nope", family: "power-hug" }), []);
});

test("at most eight players can play (v1's cap); the rest of the room watches", { timeout: 60_000 }, async () => {
  const many = await humans(...Array.from({ length: 9 }, (_, i) => `Cap ${i}`));
  const { roomId } = (await perform(many[0]!, "room.create", { name: "Cap room" })).result;
  const code = (await many[0]!.query("v2/rooms:get", { roomId })).code;
  for (const h of many.slice(1)) assert.equal((await perform(h!, "room.join", { code }, {})).ok, true);
  const refused = await perform(many[0]!, "game.start", {}, { roomId }).catch((e: any) => e.data);
  assert.equal(refused.ok, false);
  assert.match(refused.error.message, /At most 8 players/);
  await perform(many[8]!, "room.setSpectator", { spectator: true }, { roomId });
  const started = await perform(many[0]!, "game.start", {}, { roomId });
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal((await admin.query("v2/testing:header", { gameId: started.result.gameId })).roster.length, 8);
  await perform(many[0]!, "game.end", {}, { gameId: started.result.gameId });
});

test("seating: grid and line games record no seating (their rules lost it with their old families, 17 Nov), and no player read returns it", { timeout: 60_000 }, async () => {
  const [ada] = await humans("Seating Ada");
  for (const preset of ["grids-beginner", "lines-beginner"]) {
    const { roomId } = (await perform(ada!, "room.create", { name: `Seating ${preset}`, preset })).result;
    await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
    const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
    assert.equal((await admin.query("v2/testing:header", { gameId })).seating, undefined, `${preset}: no seating recorded`);
    assert.equal("seating" in (await ada!.query("v2/games:header", { gameId })), false, "players are not shown it");
    await perform(ada!, "game.end", {}, { gameId });
  }
});

test("the dealing trial's measurement: a game stores its table's unopposed directions, and no player read returns them", { timeout: 60_000 }, async () => {
  const [ada] = await humans("Trial Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Trial room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const stored = await admin.query("v2/testing:header", { gameId });
  assert.ok(Array.isArray(stored.unopposed), "measured at the deal (an empty list when the table has no unopposed direction)");
  for (const d of stored.unopposed) assert.ok(typeof d.direction === "string" && Array.isArray(d.rules) && ["weak", "strong"].includes(d.strength));
  const header = await ada!.query("v2/games:header", { gameId });
  assert.equal("unopposed" in header, false, "players are not shown it");
  // Step 2, logging only: what the policy would have dealt this table, beside the real deal. line-q's W table went with
  // the old line families (17 Nov), so the policy falls back to the lottery.
  const policy = stored.unopposedPolicy;
  assert.ok(policy && policy.wouldDeal.length === stored.roster.length && typeof policy.score === "number", JSON.stringify(policy));
  assert.ok(!policy.fallback || /none of|company|no W table/.test(policy.fallback), `the policy's fallback: ${policy.fallback}`);
  assert.equal("unopposedPolicy" in header, false, "players are not shown it either");
  await perform(ada!, "game.end", {}, { gameId });
});

test("a human's new practice game ends their unfinished one (playtest round 24: abandoned deals kept ~28 worlds running); a game with another human is left alone", { timeout: 90_000 }, async () => {
  const [ada, bo] = await humans("Abandon Ada", "Abandon Bo");
  const practice = async () => {
    const { roomId } = (await perform(ada!, "room.create", { name: "Practice" })).result;
    await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
    return (await perform(ada!, "game.start", {}, { roomId })).result.gameId as string;
  };
  // A game Ada shares with Bo: not hers alone, so never ended for her.
  const shared = await perform(ada!, "room.create", { name: "Shared" });
  await perform(bo!, "room.join", { code: shared.result.code });
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId: shared.result.roomId });
  const sharedGame = (await perform(ada!, "game.start", {}, { roomId: shared.result.roomId })).result.gameId as string;
  const first = await practice();
  await perform(ada!, "game.startWorldNow", {}, { gameId: first });
  const second = await practice();
  const phase = async (gameId: string) => (await ada!.query("v2/games:header", { gameId })).phase;
  // Ended in its own mutation just after the start (lobby.ts endAbandoned).
  const ended = async (gameId: string) => { for (let i = 0; i < 40 && await phase(gameId) !== "ended"; i++) await new Promise(r => setTimeout(r, 250)); return await phase(gameId); };
  assert.equal(await ended(first), "ended", "the abandoned practice game ends");
  assert.notEqual(await phase(second), "ended");
  assert.notEqual(await phase(sharedGame), "ended", "a game with another human is not hers to end");
  // Bo's own practice game is not touched by Ada's.
  const { roomId: boRoom } = (await perform(bo!, "room.create", { name: "Bo practice" })).result;
  await perform(bo!, "seats.fillPracticePartners", {}, { roomId: boRoom });
  const boGame = (await perform(bo!, "game.start", {}, { roomId: boRoom })).result.gameId as string;
  const third = await practice();
  assert.equal(await ended(second), "ended", "each new practice game ends the last");
  assert.notEqual((await bo!.query("v2/games:header", { gameId: boGame })).phase, "ended");
  for (const g of [sharedGame, third]) await perform(ada!, "game.end", {}, { gameId: g });
  await perform(bo!, "game.end", {}, { gameId: boGame });
});

test("a new practice game starts whatever state the human's old practice games are in (round 24 follow-up: a seeded game with no engine made game.start throw)", { timeout: 120_000 }, async () => {
  const [ada] = await humans("States Ada");
  const phase = async (gameId: string) => (await ada!.query("v2/games:header", { gameId })).phase;
  // Seeded practice games (no engine or clock rows, as the e2e fixtures make them) in every phase.
  const seeded: Record<string, string> = {};
  for (const p of ["planning", "live", "paused", "ended"] as const) {
    seeded[p] = (await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, practice: 2, phase: p })).gameId;
  }
  // Real practice games: one still in planning, one live.
  const practice = async () => {
    const { roomId } = (await perform(ada!, "room.create", { name: "Practice" })).result;
    await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
    const started = await perform(ada!, "game.start", {}, { roomId });
    assert.equal(started.ok, true, JSON.stringify(started));
    return started.result.gameId as string;
  };
  const planning = await practice();
  const live = await practice();
  await perform(ada!, "game.startWorldNow", {}, { gameId: live });
  const latest = await practice();
  assert.notEqual(await phase(latest), "ended");
  // The old ones end (in their own mutation, after the start).
  for (let i = 0; ; i++) {
    const phases = await Promise.all([...Object.values(seeded), planning, live].map(phase));
    if (phases.every(p => p === "ended")) break;
    assert.ok(i < 60, `every old practice game ends: ${phases}`);
    await new Promise(r => setTimeout(r, 500));
  }
  await perform(ada!, "game.end", {}, { gameId: latest });
});
