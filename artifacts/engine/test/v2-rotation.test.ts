/**
 * Rotation across a room's games and running totals per seat (integration plan §1, M3) on the live local backend: the
 * second game with the same seats passes the first game's rules one seat along, `game.rotation` previews it, and
 * `v2/rooms:round` sums each seat's net over the round's games.
 *
 * What would break: a repeat game dealt afresh mid-round; a round total that is not the sum of its games' standings.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";

let host: Human, roomId: string;
const play = async () => {
  const gameId = (await perform(host!, "game.start", {}, { roomId })).result.gameId;
  await perform(host!, "game.startWorldNow", {}, { gameId });
  await new Promise(r => setTimeout(r, 3000));
  await perform(host!, "game.end", {}, { gameId });
  return gameId as string;
};

before(async () => {
  [host] = await humans("Rotation Host");
  ({ roomId } = (await perform(host!, "room.create", { name: "Rotation room" })).result);
  await perform(host!, "room.setSpectator", { spectator: true }, { roomId });
  await perform(host!, "seats.fillPracticePartners", {}, { roomId });
});

test("the second game passes the rules one seat along, and the round sums each seat's net", { timeout: 120_000 }, async () => {
  assert.equal(await host!.query("v2/rooms:round", { roomId }), null);
  const first = await play();
  const preview = await perform(host!, "game.rotation", {}, { roomId }, "query");
  assert.equal(preview.result.seats.length, 3, "mid-round: the next deal is known");
  const second = await play();
  const [g1, g2] = [await admin.query("v2/testing:header", { gameId: first }), await admin.query("v2/testing:header", { gameId: second })];
  assert.deepEqual(g2.rotation, { round: 2, of: 3 });
  const keyOf = (g: any, memberId: string) => g.artefacts.find((a: any) => a.memberId === memberId).ruleKey;
  const seats = g1.roster.map((r: any) => r.memberId);
  seats.forEach((m: string, k: number) => assert.equal(keyOf(g2, m), keyOf(g1, seats[(k + 2) % 3]), "seat k holds seat k−1's rule"));
  assert.deepEqual(preview.result.seats.map((s: any) => s.family), g2.roster.map((r: any) => g2.artefacts.find((a: any) => a.memberId === r.memberId).ruleKey.split("/")[2]));

  const round = await host!.query("v2/rooms:round", { roomId });
  assert.deepEqual([round.round, round.of, round.games.map((g: any) => g.gameId)], [2, 3, [second, first]]);
  const net = async (gameId: string, m: string) => (await host!.query("v2/games:standings", { gameId })).rows.find((r: any) => r.memberId === m).net;
  for (const t of round.totals) assert.ok(Math.abs(t.net - (await net(first, t.memberId)) - (await net(second, t.memberId))) < 1e-9);
});

// The grid too (baseline-1 item 1: the old app's grid game rotated the rules round the seats after each game).
for (const preset of ["lines-beginner", "grids-beginner"]) test(`${preset}: a human with practice partners: three games rotate every rule round every seat, numbered, with running totals; the fourth deals afresh`, { timeout: 240_000 }, async () => {
  // Playtest round 9: a practice room's games 2 and 3 were fresh deals, each "Game 1 of 3", with no totals.
  const [alice] = await humans("Rotation Alice");
  const room = (await perform(alice!, "room.create", { name: "Practice rotation", preset })).result.roomId;
  await perform(alice!, "seats.fillPracticePartners", {}, { roomId: room });
  const playIn = async () => {
    const gameId = (await perform(alice!, "game.start", {}, { roomId: room })).result.gameId;
    await perform(alice!, "game.startWorldNow", {}, { gameId });
    await new Promise(r => setTimeout(r, 2000));
    await perform(alice!, "game.end", {}, { gameId });
    return await admin.query("v2/testing:header", { gameId: gameId as string });
  };
  const games: any[] = [];
  for (let i = 0; i < 3; i++) games.push(await playIn());
  const seats = games[0]!.roster.map((r: any) => r.memberId);
  const keyOf = (g: any, m: string) => g.artefacts.find((a: any) => a.memberId === m).ruleKey;
  assert.equal(new Set(seats.map((m: string) => keyOf(games[0], m))).size, 3, "three distinct rules");
  for (const [n, g] of games.entries()) {
    if (n > 0) assert.deepEqual(g.rotation, { round: n + 1, of: 3 }, `game ${n + 1} is round ${n + 1} of 3`);
    seats.forEach((m: string, k: number) => assert.equal(keyOf(g, m), keyOf(games[0], seats[(k + 3 - n) % 3]), `game ${n + 1}: the rules moved ${n} seat(s) on`));
  }
  for (const m of seats) assert.equal(new Set(games.map(g => keyOf(g, m))).size, 3, "each seat held each rule once");
  const round = await alice!.query("v2/rooms:round", { roomId: room });
  assert.deepEqual([round.round, round.of, round.games.length], [3, 3, 3]);
  const fourth = await playIn();
  assert.equal(fourth.rotation, undefined, "a finished rotation: the next game deals afresh");
});
