/**
 * Disclosure noise on the others' sums (v1's rule, restored: docs/public-log-design.md §5.2 on archive/engine-v1;
 * convex/v2/disclose.ts). In a live game two humans and a practice partner play; while live, every others' sum a player
 * reads is the exact sum plus the noise of the object's state, one draw for everyone (so each player's own bits plus
 * the others' sum shown is the same salience for both), points shown are own × max(0, others shown), and the standings
 * are the disclosed totals. After the end every read is exact.
 *
 * What would break: a live read that discloses an exact others' sum, or a number built on one (points, totals, a sort,
 * the act log), or an ended game that still shows noise.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";

const page = { numItems: 50, cursor: null };
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test("while live every others' sum is the exact one plus its state's noise, the same draw for everyone; after the end exact", { timeout: 240_000 }, async () => {
  const [ada, bo] = await humans("Noise Ada", "Noise Bo");
  const { roomId } = (await perform(ada!, "room.create", { name: "Noise room" })).result;
  await perform(bo!, "room.join", { code: (await ada!.query("v2/rooms:get", { roomId })).code }, {});
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  // The beginner presets have no noise (v1's Annotated basics, peerNoiseBits 0): this room asks for v1's default.
  await perform(ada!, "room.settings", { overrides: { peerNoiseBits: 8 } }, { roomId });
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  await new Promise(r => setTimeout(r, 12_000));   // a scoreboard (every 10 world seconds) and some moves

  const ids = (await ada!.query("v2/play:objectIds", { gameId, sort: "born", paginationOpts: page })).page.map((r: any) => r.objectId);
  assert.ok(ids.length >= 10);
  let noisy = 0;
  for (const objectId of ids) {
    const [a, b] = [await ada!.query("v2/play:object", { objectId }), await bo!.query("v2/play:object", { objectId })];
    const [ea, eb] = [await admin.query("v2/testing:valueOf", { objectId, userId: ada!.userId }), await admin.query("v2/testing:valueOf", { objectId, userId: bo!.userId })];
    if (a.version !== b.version || a.value.version !== ea.version || b.value.version !== eb.version) continue;   // moved between the reads
    const [na, nb] = [a.value.want - ea.want, b.value.want - eb.want];
    assert.ok(close(na, nb), `one draw for everyone at a state: ${na} vs ${nb}`);
    assert.ok(close(a.value.rarityBits + a.value.want, b.value.rarityBits + b.value.want), "own + others shown is the same salience for both");
    assert.ok(close(a.value.points, a.value.rarityBits * Math.max(0, a.value.want)), "points shown follow the shown sum");
    assert.ok(close(a.value.rarityBits, ea.rarityBits), "a player's own bits are exact");
    if (Math.abs(na) > 1e-6) noisy++;
  }
  assert.ok(noisy >= ids.length / 2, `the others' sums are disclosed with noise (${noisy} of ${ids.length})`);

  // The sort on the others' sum follows the disclosed values, not the exact ones.
  const byWant = (await ada!.query("v2/play:objectIds", { gameId, sort: "want", paginationOpts: page })).page.map((r: any) => r.objectId);
  const shownWant = new Map<string, number>();
  for (const id of byWant) shownWant.set(id, (await ada!.query("v2/play:object", { objectId: id })).value.want);
  const ws = byWant.map((id: string) => shownWant.get(id)!);
  const sortedish = ws.filter((w: number, i: number) => i === 0 || w <= ws[i - 1]! + 1e-6).length;
  assert.ok(sortedish >= ws.length - 3, `sorted by the shown sums, newest-first moves aside: ${ws.map((w: number) => w.toFixed(1)).join(" ")}`);

  // Standings: the disclosed totals while live.
  const live = await ada!.query("v2/games:standings", { gameId });
  // Published exact (the coordinator's call 15): the live standings are the exact totals the scoreboard recorded.
  const record = await admin.query("v2/testing:events", { gameId, after: -1 });
  const published = record.filter((e: any) => e.kind === "tick").at(-1)?.data;
  if (published && Math.abs(published.worldSeconds - live.worldSeconds) < 1e-9)
    for (const r of live.rows) assert.ok(close(r.total, published.standings.find((s: any) => s.memberId === r.memberId).total), "the published standings are the exact record's");

  // Live anonymity (v1's public log): another player's move carries no mover, agent, calls or cost; tugs name nobody.
  const liveMoves = (await ada!.query("v2/play:moves", { gameId, paginationOpts: { numItems: 50, cursor: null } })).page;
  const theirs = liveMoves.filter((m: any) => !m.mine);
  assert.ok(theirs.length > 0, "another player's moves concerned Ada");
  for (const m of theirs) assert.deepEqual([m.by, m.agentId, m.calls, m.charge], [null, null, [], null], "unattributed while live");
  for (const m of liveMoves.filter((x: any) => x.mine)) assert.ok(m.by && m.calls.length > 0, "Ada's own moves keep their calls");
  for (const t of await ada!.query("v2/play:tugs", { gameId })) assert.deepEqual(t.others, [], "a live tug names nobody");
  const listed = await perform(ada!, "moves.list", { limit: 50 }, { gameId }, "query");
  for (const m of listed.result.page.filter((x: any) => !x.mine)) assert.deepEqual([m.agentId, m.calls, m.charge], [null, [], null]);

  assert.equal((await perform(ada!, "game.end", {}, { gameId })).ok, true);
  const ended = (await ada!.query("v2/play:moves", { gameId, paginationOpts: { numItems: 50, cursor: null } })).page.filter((m: any) => !m.mine);
  assert.ok(ended.length > 0 && ended.every((m: any) => m.by && m.calls.length > 0), "after the end every move names its mover and calls");
  for (const objectId of ids.slice(0, 8)) {
    const a = await ada!.query("v2/play:object", { objectId });
    const ea = await admin.query("v2/testing:valueOf", { objectId, userId: ada!.userId });
    assert.ok(close(a.value.want, ea.want) && close(a.value.points, ea.points), "after the end the values are exact");
  }
  const final = await ada!.query("v2/games:standings", { gameId });
  const exact = (await admin.query("v2/testing:totalsOf", { gameId })).exact;
  for (const r of final.rows) assert.ok(close(r.total, exact[r.memberId] ?? 0, 1e-6), "the final standings are exact");
  // The scatter goes back to the exact sums (scheduled at the end).
  for (let i = 0; ; i++) {
    const d = await ada!.query("v2/play:digest", { gameId });
    const a = await ada!.query("v2/play:object", { objectId: ids[0] });
    const at = 3 * (a.number - 1);
    if (close(d.packed[at + 2], a.value.want)) break;
    assert.ok(i < 40, "the scatter is exact after the end");
    await new Promise(r => setTimeout(r, 250));
  }
});
