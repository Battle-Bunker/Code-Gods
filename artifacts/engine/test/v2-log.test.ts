/**
 * The public log (v1's, restored: docs/public-log-design.md §1–§2 on archive/engine-v1). Every birth and every move of
 * the game is public to every seated player as it happens: the object, its state before and after, its version and
 * world time, and the viewer's own bits and the others' summed bits after it (with the disclosure noise while live).
 * While live nothing in it says who made another player's move (no mover, agent, calls or cost); a player's own moves
 * keep them; an ended game shows everything, exact. A room member who is not seated sees the rows without bits.
 *
 * What would break: a player not seeing a move that did not concern them; a live row that attributes another player's
 * move or discloses an exact others' sum; a row whose bits are not the viewer's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

const page = { numItems: 50, cursor: null };
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test("every seated player reads every move, unattributed while live, with their own bits and the disclosed others' sum", { timeout: 240_000 }, async () => {
  const [ada, bo, cy] = await humans("Log Ada", "Log Bo", "Log Cy");
  const { roomId } = (await perform(ada!, "room.create", { name: "Log room" })).result;
  const code = (await ada!.query("v2/rooms:get", { roomId })).code;
  await perform(bo!, "room.join", { code }, {});
  await perform(cy!, "room.join", { code }, {});
  await perform(cy!, "room.setSpectator", { spectator: true }, { roomId });
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  await new Promise(r => setTimeout(r, 10_000));
  await perform(ada!, "game.pause", {}, { gameId });   // a still board, so both read the same rows

  const [a, b] = [(await ada!.query("v2/play:log", { gameId, paginationOpts: page })).page, (await bo!.query("v2/play:log", { gameId, paginationOpts: page })).page];
  assert.deepEqual(a.map((r: any) => r.seq), b.map((r: any) => r.seq), "both players read the same rows: every move, theirs or not");
  assert.ok(a.some((r: any) => r.kind === "move") && a.some((r: any) => r.kind === "born"));
  const moves = a.filter((r: any) => r.kind === "move");
  assert.ok(moves.some((r: any) => !r.mine), "Ada sees moves that are not hers");
  for (const [k, r] of a.entries()) {
    const s = b[k];
    if (!r.mine) assert.deepEqual([r.by, r.agentId, r.calls, r.charge], [null, null, null, null], `row ${r.seq}: another player's move is unattributed while live`);
    else assert.ok(r.by && r.calls?.length && r.charge !== null, "Ada's own moves keep their mover, calls and cost");
    assert.ok(close(r.own + r.others, s.own + s.others), "one salience for both: own + others shown is the same");
    assert.ok(close(r.points, r.own * Math.max(0, r.others)));
  }
  // The newest row of an object is its current state: the bits there are the viewer's, as play:object gives them.
  const seen = new Set<string>();
  for (const r of a) {
    if (seen.has(r.objectId)) continue;
    seen.add(r.objectId);
    const o = await ada!.query("v2/play:object", { objectId: r.objectId });
    if (o.version !== r.version) continue;
    assert.ok(close(r.own, o.value.rarityBits) && close(r.others, o.value.want), `row ${r.seq} is Ada's value now`);
  }
  const watcher = (await cy!.query("v2/play:log", { gameId, paginationOpts: page })).page;
  assert.equal(watcher.length, a.length);
  assert.ok(watcher.every((r: any) => r.own === null && r.others === null && r.points === null), "a member watching sees no bits");

  await perform(ada!, "game.end", {}, { gameId });
  const ended = (await ada!.query("v2/play:log", { gameId, paginationOpts: page })).page;
  for (const r of ended.filter((x: any) => x.kind === "move")) assert.ok(r.by && r.calls?.length, "after the end every move names its mover and calls");
  for (const r of ended) {
    if (seen.has(`exact:${r.objectId}`)) continue;
    seen.add(`exact:${r.objectId}`);
    const o = await ada!.query("v2/play:object", { objectId: r.objectId });
    if (o.version === r.version) assert.ok(close(r.others, o.value.want), "exact after the end");
  }
});

// The board at a moment (v1's get_board_at; owner-decisions call 36): built from the caller's own view of the log, so
// it shows what the log shows them, object by object, at that time: what would break is a board at "now" that is not
// the log's newest row of each object, or a board that discloses more than the caller's log row does.
test("game.boardAt: every object as the caller's log shows it at a time; nothing more than the log discloses", { timeout: 240_000 }, async () => {
  const [ada, bo] = await humans("Board Ada", "Board Bo");
  const { roomId } = (await perform(ada!, "room.create", { name: "Board room" })).result;
  const code = (await ada!.query("v2/rooms:get", { roomId })).code;
  await perform(bo!, "room.join", { code }, {});
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  await new Promise(r => setTimeout(r, 8_000));
  await perform(ada!, "game.pause", {}, { gameId });
  const log = (await ada!.query("v2/play:log", { gameId, paginationOpts: { numItems: 400, cursor: null } })).page;
  const newest = new Map<string, any>();
  for (const r of log) if (!newest.has(r.objectId)) newest.set(r.objectId, r);
  const now = (await perform(ada!, "game.boardAt", { world: 1e6 }, { gameId }, "action")).result;
  assert.equal(now.objects.length, newest.size, "every object born so far");
  for (const o of now.objects) {
    const r = newest.get(o.objectId)!;
    assert.deepEqual([o.state, o.own, o.others, o.points], [r.state, r.own, r.others, r.points], `object ${o.number}: as the log's newest row`);
  }
  // At the start only the starting objects, in their first states.
  const start = (await perform(ada!, "game.boardAt", { world: 0 }, { gameId }, "action")).result;
  const born0 = log.filter((r: any) => r.worldSeconds <= 0);
  assert.equal(start.objects.length, new Set(born0.map((r: any) => r.objectId)).size);
  // Bo's board is Bo's own view (his bits), not Ada's.
  const bos = (await perform(bo!, "game.boardAt", { world: 1e6 }, { gameId }, "action")).result;
  assert.deepEqual(bos.objects.map((o: any) => o.state), now.objects.map((o: any) => o.state));
  assert.ok(bos.objects.some((o: any, k: number) => o.own !== now.objects[k].own), "each player's own bits");
  await perform(ada!, "game.end", {}, { gameId });
});

// Fitting the others' rules (v1's fit_utility_mixture; owner-decisions call 36): refused where it would find them too
// easily (no noise), offered on a lines game at noise σ 8, where it reads the caller's own log and keeps their own
// family out of every guess.
test("rule.fit: refused without noise; on lines at σ 8 a posterior over the others' rules", { timeout: 240_000 }, async () => {
  const [ada] = await humans("Fit Ada");
  const quiet = (await perform(ada!, "room.create", { name: "Fit quiet" })).result.roomId;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId: quiet });
  const g0 = (await perform(ada!, "game.start", {}, { roomId: quiet })).result.gameId;
  const refused = await perform(ada!, "rule.fit", {}, { gameId: g0 }, "action");
  assert.equal(refused.ok, false);
  assert.match(refused.error.message, /±8 bits/);
  await perform(ada!, "game.end", {}, { gameId: g0 });
  const roomId = (await perform(ada!, "room.create", { name: "Fit noisy", preset: "lines-lenses" })).result.roomId;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  await new Promise(r => setTimeout(r, 6_000));
  const fit = (await perform(ada!, "rule.fit", { top: 3 }, { gameId }, "action")).result;
  const mine = (await perform(ada!, "rule.explain", {}, { gameId }, "query")).result.family;
  assert.equal(fit.sigma, 8);
  assert.ok(fit.observations > 0 && fit.hypotheses.length > 0 && fit.hypotheses.length <= 3);
  assert.ok(fit.hypotheses.every((h: any) => h.rules.every((r: any) => r.family !== mine)), "never the caller's own family");
  await perform(ada!, "game.end", {}, { gameId });
});
