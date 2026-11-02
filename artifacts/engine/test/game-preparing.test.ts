/**
 * The two-half game start (docs/analytic-calibration/architecture.md §3.4) on a shape with no shipped tables,
 * Int(0,2147483647): what would break is a start refused for want of tables, a game that never begins, a failing
 * table that hangs the room instead of saying so, or a preparing state that leaks the deal. The deal is steered with
 * excludedFamilies: digit-devotee is analytic for every params (instant), smooth-operator has three sampled tables.
 * Nothing here waits for a real computation: the keys a test needs not computed are claimed first by the test (as a
 * computation in flight elsewhere would be), so the room waits on them; test/calibration-ondemand.test.ts runs the
 * real fan-out end to end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { UNIFORM_PRIOR, canonicalSupport, context, familiesFor, firstUseSeconds, paramsKey, priorKey, tableKey } from "@workspace/game-utilities";
import { admin, api, gods, internal, rejects, roomWith, touch, waitFor } from "./game-helpers.ts";

const typeArgs = { min: 0, max: 2147483647 };
const inst = instantiate("Int", typeArgs);
const only = (...ids: string[]) => familiesFor("Int", "reward").map(f => f.id).filter(id => !ids.includes(id));
const settingsFor = (...allowed: string[]) => ({ objectType: "Int", typeArgs, languages: ["typescript"], excludedFamilies: only(...allowed), halfLifeSeconds: 100000 });
const keysOf = (familyId: string, on = inst) => canonicalSupport(familiesFor("Int", "reward").find(f => f.id === familyId)!, context(on))
  .map(p => ({ key: tableKey(familyId, p, on), paramsKey: paramsKey(p), params: p }));
/** Another range nobody ships: the rate-limit test computes there, so its actions never land on this file's other keys. */
const quotaArgs = { min: 0, max: 2147483646 };
const quotaInst = instantiate("Int", quotaArgs);

async function room(label: string, ...allowed: string[]) {
  const members = await gods(`${label} Owner`, `${label} Ada`, `${label} Bo`);
  await touch(members[0]);
  const { roomId } = await roomWith(members, settingsFor(...allowed));
  return { members, host: members[0], roomId };
}

test("analytic-only draws on a shape with no shipped file start at once, with nothing computed", async () => {
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
  const { host, roomId } = await room("Analytic", "digit-devotee");
  const started = await host.c.action(api.owner.start, { roomId, requestId: crypto.randomUUID() });
  assert.ok(started.gameId, "a game, not a preparation");
  const r = await host.c.query(api.rooms.get, { room: roomId });
  assert.equal(r.preparing, null);
  assert.equal(r.activeGame.phase, "planning");
  assert.equal(await admin.mutation(internal.calibration.cache.forget, { instance: inst.key }), 0, "no table was computed or claimed");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});

test("a shipped shape starts from the warm file without claiming anything", async () => {
  const shipped = { min: 0, max: 9999 };
  await admin.mutation(internal.calibration.cache.forget, { instance: instantiate("Int", shipped).key });
  const members = await gods("Warm Owner", "Warm Ada", "Warm Bo");
  await touch(members[0]);
  const { roomId } = await roomWith(members, { objectType: "Int", typeArgs: shipped, languages: ["typescript"], halfLifeSeconds: 100000 });
  const started = await members[0].c.action(api.owner.start, { roomId });
  assert.ok(started.gameId);
  assert.equal(await admin.mutation(internal.calibration.cache.forget, { instance: instantiate("Int", shipped).key }), 0);
  await members[0].c.mutation(api.rooms.endActiveGame, { roomId });
});

test("missing tables put the room in a visible preparing state; a failing table is retried with backoff, then reported to the owner", { timeout: 120_000 }, async () => {
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
  const keys = keysOf("smooth-operator");
  assert.equal(keys.length, 3);
  // Claimed elsewhere: the start waits on them instead of computing.
  for (const k of keys) {
    assert.equal(await admin.mutation(internal.calibration.cache.claim, { key: k.key, instance: inst.key, family: "smooth-operator", paramsKey: k.paramsKey, prior: priorKey(UNIFORM_PRIOR) }), "compute");
  }
  const { host, members, roomId } = await room("Prepare", "smooth-operator");
  const requestId = crypto.randomUUID();
  const first = await host.c.action(api.owner.start, { roomId, requestId });
  const estimate = firstUseSeconds(inst);
  assert.deepEqual([first.status, first.instance, first.ready, first.total, first.estimateSeconds], ["preparing", inst.key, 0, 3, estimate]);
  // Every table is one piece here (claimed as such): no parts count.
  assert.match(first.message, new RegExp(`^The game is preparing its rule tables: 0 of 3 ready \\(the first game on Int\\(0,2147483647\\) on this server; about ${estimate} s in all\\)\\. It starts by itself`));
  // The default dealer is the Aligned Lottery; with no synergy measured here it says it deals like the Divine Lottery.
  assert.deepEqual([first.dealtAs, /deals like the Divine Lottery/.test(first.note)], ["divine-lottery", true]);
  // Every member sees the progress, never the deal.
  const seen = (await members[1].c.query(api.rooms.get, { room: roomId })).preparing;
  assert.deepEqual(Object.keys(seen).sort(), ["dealtAs", "estimateSeconds", "instance", "ready", "startedAt", "total", ...(seen.dealerNote ? ["dealerNote"] : [])].sort());
  assert.deepEqual([seen.ready, seen.total, seen.instance], [0, 3, inst.key]);
  assert.equal((await members[1].c.query(api.rooms.get, { room: roomId })).activeGame, null);
  // A repeated start reports the same preparation; settings are frozen meanwhile.
  assert.equal((await host.c.action(api.owner.start, { roomId, requestId: crypto.randomUUID() })).status, "preparing");
  const revision = (await host.c.query(api.rooms.get, { room: roomId })).revision;
  assert.match(await rejects(host.c.action(api.owner.settings, { roomId, revision, settings: { startingObjectCount: 9 } })), /preparing/);

  // The computation of one key fails: retried (attempt 2, then 3) while the room waits; the third failure is reported.
  const failing = keys[0]!.key;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await admin.mutation(internal.calibration.cache.finished, { key: failing, error: `injected failure ${attempt}`, buildMs: 1 });
    const r = (await host.c.query(api.rooms.get, { room: roomId })).preparing;
    if (attempt < 3) assert.equal(r.error, undefined, `still waiting after failure ${attempt}`);
    else assert.match(r.error, /smooth-operator .* could not be prepared after 3 attempts \(injected failure 3\)\. Start again/);
  }
  const rows = await admin.mutation(internal.calibration.cache.getMany, { keys: [failing] });
  assert.equal(rows[0].status, "failed");
  // Settings unfreeze once it failed; the owner may end the failed preparation.
  assert.deepEqual(await host.c.mutation(api.rooms.endActiveGame, { roomId }), { cancelled: "preparing" });
  assert.equal((await host.c.query(api.rooms.get, { room: roomId })).preparing, null);
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
});

test("when the last awaited table lands the game begins by itself, with the prepared deal and the planning clock starting then", { timeout: 120_000 }, async () => {
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
  const keys = keysOf("smooth-operator");
  for (const k of keys) await admin.mutation(internal.calibration.cache.claim, { key: k.key, instance: inst.key, family: "smooth-operator", paramsKey: k.paramsKey, prior: priorKey(UNIFORM_PRIOR) });
  const { host, roomId } = await room("Land", "smooth-operator");
  const requestId = crypto.randomUUID();
  assert.equal((await host.c.action(api.owner.start, { roomId, requestId })).status, "preparing");
  // Land the tables as the compute actions would: a real table per key (the test computes them in its own process).
  const { budgetFor, buildTable, tableJson } = await import("@workspace/game-utilities/estimator");
  const support = canonicalSupport(familiesFor("Int", "reward").find(f => f.id === "smooth-operator")!, context(inst));
  for (const [i, p] of support.entries()) {
    const t = buildTable("smooth-operator", p, inst, budgetFor("Int")).table;
    assert.equal(t.key, keys[i]!.key);
    const landedAt = Date.now();
    await admin.mutation(internal.calibration.cache.finished, { key: t.key, table: tableJson(t), buildMs: 1 });
    const r = await host.c.query(api.rooms.get, { room: roomId });
    // (≥: a retry the previous test scheduled for the same key may land it first.)
    if (i < support.length - 1) assert.ok(r.preparing.ready >= i + 1, "progress advances per landed table");
    else {
      const game = await waitFor(async () => (await host.c.query(api.rooms.get, { room: roomId })).activeGame, "the prepared game starts", 60_000);
      assert.equal(game.phase, "planning");
      const g = await admin.query(internal.testing.rawGame, { gameId: game.id });
      assert.ok(g.game.planningEndsAt >= landedAt + 0.9 * g.game.settings.planningSeconds * 1000, "the planning clock starts when the tables are ready");
      assert.deepEqual(g.deities.map((d: { utility: { familyId: string } }) => d.utility.familyId), ["smooth-operator", "smooth-operator", "smooth-operator"]);
      assert.equal((await host.c.query(api.rooms.get, { room: roomId })).preparing, null);
      // The same requestId now reports the game.
      assert.equal((await host.c.action(api.owner.start, { roomId, requestId })).gameId, game.id);
    }
  }
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
});

test("new-shape computation is rate limited per owner: an empty bucket or two rooms already preparing refuse the start, claiming nothing", { timeout: 120_000 }, async () => {
  await admin.mutation(internal.calibration.cache.forget, { instance: quotaInst.key });
  const members = await gods("Quota Owner", "Quota Ada", "Quota Bo");
  await touch(members[0]);
  const [owner] = members;
  const smooth = keysOf("smooth-operator", quotaInst);
  // A room whose deal needs new computation (smooth-operator's three cheap tables).
  const { roomId: c } = await roomWith(members, { ...settingsFor("smooth-operator"), typeArgs: quotaArgs });
  await admin.mutation(internal.calibration.cache.setQuota, { roomId: c, tokens: 0, rooms: [] });
  const empty = await rejects(owner.c.action(api.owner.start, { roomId: c, requestId: crypto.randomUUID() }));
  assert.match(empty, /This game needs \d+ new rule-table computations, and this server allows each owner about 60 a minute \(0 available now\).*Try again in about \d+ s, or choose a shape whose tables are ready/);
  assert.deepEqual(await admin.mutation(internal.calibration.cache.getMany, { keys: smooth.map(k => k.key) }), [], "nothing was claimed");
  assert.equal((await owner.c.query(api.rooms.get, { room: c })).preparing, null);

  // Two of the owner's rooms preparing (waiting on keys claimed elsewhere, so they cost nothing themselves).
  for (const k of keysOf("smooth-operator")) await admin.mutation(internal.calibration.cache.claim, { key: k.key, instance: inst.key, family: "smooth-operator", paramsKey: k.paramsKey, prior: priorKey(UNIFORM_PRIOR) });
  const others: string[] = [];
  for (let i = 0; i < 2; i++) {
    const { roomId } = await roomWith(members, settingsFor("smooth-operator"));
    assert.equal((await owner.c.action(api.owner.start, { roomId, requestId: crypto.randomUUID() })).status, "preparing");
    others.push(roomId);
  }
  await admin.mutation(internal.calibration.cache.setQuota, { roomId: c, tokens: 200, rooms: others });
  const busy = await rejects(owner.c.action(api.owner.start, { roomId: c, requestId: crypto.randomUUID() }));
  assert.match(busy, /2 of your rooms are already preparing rule tables for a new shape; this server prepares at most 2 at a time per owner/);
  assert.deepEqual(await admin.mutation(internal.calibration.cache.getMany, { keys: smooth.map(k => k.key) }), []);
  // Once one of them ends its preparation, the start is admitted (and charged): the room prepares.
  await owner.c.mutation(api.rooms.endActiveGame, { roomId: others[0] });
  const admitted = await owner.c.action(api.owner.start, { roomId: c, requestId: crypto.randomUUID() });
  assert.equal(admitted.status, "preparing");
  for (const roomId of [others[1], c]) await owner.c.mutation(api.rooms.endActiveGame, { roomId });
  await admin.mutation(internal.calibration.cache.forget, { instance: quotaInst.key });
});

test("a split table: each piece is progress, a failed piece is retried alone, the merge writes the table the pieces make anywhere, then the game begins", { timeout: 180_000 }, async () => {
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
  // smooth-operator's third table (the first is the one an earlier test's retries may still compute) is claimed under a
  // 3-piece plan, the other two as single actions; nothing is scheduled: this test lands pieces 0 and 2 and the two
  // tables, the engine retries piece 1.
  const all = keysOf("smooth-operator"), k = all[2]!;
  for (const x of all) {
    await admin.mutation(internal.calibration.cache.claim, { key: x.key, instance: inst.key, family: "smooth-operator", paramsKey: x.paramsKey, prior: priorKey(UNIFORM_PRIOR), ...(x === k ? { pieces: 3 } : {}) });
  }
  const { host, members, roomId } = await room("Split", "smooth-operator");
  const requestId = crypto.randomUUID();
  const first = await host.c.action(api.owner.start, { roomId, requestId });
  // (An earlier test's retry may still land smooth-operator's first table, before the start or during this test.)
  const early = first.ready, total = 5 - early;
  assert.ok(early === 0 || (early === 1 && k !== all[0]));
  assert.deepEqual([first.status, first.total], ["preparing", 3]);
  assert.match(first.message, new RegExp(`${early} of 3 ready, 0 of ${total} parts computed`));
  const view = async () => (await members[1].c.query(api.rooms.get, { room: roomId })).preparing;
  assert.deepEqual((await view()).pieces, { done: 0, total });

  const { budgetFor, buildReplicate, buildTable, mergeReplicates, tableJson } = await import("@workspace/game-utilities/estimator");
  const params = k.params, plan = { replicates: 3 }, budget = budgetFor("Int");
  const reps = [0, 1, 2].map(r => buildReplicate("smooth-operator", params, inst, budget, plan, r));
  const land = (index: number) => admin.mutation(internal.calibration.cache.pieceFinished, { key: k.key, index, pieces: 3, result: JSON.stringify(reps[index]), buildMs: 1 });
  assert.equal(await land(0), true);
  const done = async (pieces: number) => { const v = await view(); assert.ok(v.pieces.total === total && v.pieces.done >= pieces && v.pieces.done <= pieces + 1 - early, JSON.stringify(v.pieces)); };
  await done(1);
  // Piece 1 fails: only it is retried (after retryDelayMs(1) = 5 s, as a real piece action); piece 0 stays as it was.
  await admin.mutation(internal.calibration.cache.pieceFinished, { key: k.key, index: 1, pieces: 3, error: "injected piece failure", buildMs: 1 });
  assert.equal((await view()).error, undefined, "a piece's first failure is retried, not reported");
  assert.equal(await land(2), true);
  await done(2);
  const merged = await waitFor(async () => {
    const [row] = await admin.mutation(internal.calibration.cache.getMany, { keys: [k.key] });
    return row?.status === "ready" ? row : undefined;
  }, "the retried piece lands and the merge writes the table", 120_000, 500);
  // The engine's piece 1 and its merge give the bytes this process gives: a split table depends on the key and the plan only.
  assert.equal(merged.table, tableJson(mergeReplicates("smooth-operator", params, inst, budget, plan, reps)));
  assert.deepEqual(JSON.parse(merged.table).estimator.split, { replicates: 3 });
  assert.equal(merged.attempts, 1, "the key itself was never restarted");
  const left = await admin.query(internal.calibration.cache.readyPieces, { key: k.key });
  assert.deepEqual(left.results, [], "the piece rows are dropped once the table is written");
  assert.ok((await view()).ready >= 1);
  await done(3);
  // The two single-action tables land: a piece each, then the game.
  for (const x of all.slice(0, 2)) {
    if ((await admin.mutation(internal.calibration.cache.getMany, { keys: [x.key] }))[0]?.status === "ready") continue;
    await admin.mutation(internal.calibration.cache.finished, { key: x.key, table: tableJson(buildTable("smooth-operator", x.params, inst, budget).table), buildMs: 1 });
  }
  const game = await waitFor(async () => (await host.c.query(api.rooms.get, { room: roomId })).activeGame, "the prepared game starts", 60_000);
  assert.equal(game.phase, "planning");
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
});
