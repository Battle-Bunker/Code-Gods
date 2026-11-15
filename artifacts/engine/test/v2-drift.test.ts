/**
 * Parameter drift (convex/v2/drift.ts; the coordinator's trial, call 18), live: a room set to drift every 10 world
 * seconds, with Ada dealt a family that has a parameter grid. At 10 s her rule's parameters are redrawn (family and
 * tie-breaker kept), her rule document and card say so, the record has a `drift` event, and every stored value agrees
 * with the new rules.
 *
 * What would break: a drift that never happens, changes the family, leaves values computed under the old rule, or
 * is missing from the record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";
import { VALUE_INDEX as VALUE_RECORDS } from "../convex/v2/values.gen.ts";
import { familyOf } from "../convex/v2/deal.ts";

test("every driftSeconds, a seat's parameters are redrawn; the rule, the values and the record follow", { timeout: 180_000 }, async () => {
  const [ada] = await humans("Drift Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Drift room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  assert.equal((await perform(ada!, "room.settings", { overrides: { driftSeconds: 10 } }, { roomId })).ok, true);
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  assert.equal((await ada!.query("v2/games:header", { gameId })).driftSeconds, 10);
  // A line-q family with several parameter values (its grid) that is not a ladder (a ladder keeps its params), for Ada.
  const counts = new Map<string, number>();
  for (const r of VALUE_RECORDS) if (r.variant === "line-q" && !familyOf(r.family).keepsParams) counts.set(`${r.family}|${r.tieBreaker}`, (counts.get(`${r.family}|${r.tieBreaker}`) ?? 0) + 1);
  const [pick] = [...counts].find(([, n]) => n >= 3)!;
  const rec = VALUE_RECORDS.find(r => r.variant === "line-q" && `${r.family}|${r.tieBreaker}` === pick)!;
  await admin.mutation("v2/testing:setRule", { gameId, userId: ada!.userId, ruleKey: rec.ruleKey });
  const before = await ada!.query("v2/play:myRule", { gameId });
  assert.deepEqual([before.ruleKey, before.drifts, before.driftedAt, before.keepsParams], [rec.ruleKey, 0, null, false]);
  // A ladder family's seat is never redrawn, and its rule view says so (the app hides the redraw countdown).
  const ladder = VALUE_RECORDS.find(r => r.variant === "line-q" && familyOf(r.family).keepsParams)!;
  await admin.mutation("v2/testing:setRule", { gameId, userId: ada!.userId, ruleKey: ladder.ruleKey });
  assert.equal((await ada!.query("v2/play:myRule", { gameId })).keepsParams, true);
  await admin.mutation("v2/testing:setRule", { gameId, userId: ada!.userId, ruleKey: rec.ruleKey });

  await perform(ada!, "game.startWorldNow", {}, { gameId });
  // The beginner game pays to read: Ada (no agents) knows the objects as told at their births.
  const me = (await ada!.query("v2/games:header", { gameId })).me;
  // (The world starts once every sandbox is warm: on a cold engine that can take a while.)
  let known: any[] = [];
  for (let i = 0; (known = await admin.query("v2/testing:knowledgeOf", { gameId, memberId: me })).length < 3; i++) {
    assert.ok(i < 240, "Ada knows the starting objects");
    await new Promise(r => setTimeout(r, 500));
  }
  const knownBefore = new Map(known.map((k: any) => [k.objectId, k]));
  // A redraw may keep the value (drift.ts), so wait for the first drift that changes it: with a grid of n ≥ 3 values,
  // six drifts all keeping it has chance at most 3^-6.
  for (let i = 0; (await ada!.query("v2/play:myRule", { gameId })).drifts === 0; i++) {
    assert.ok(i < 300 && (await admin.query("v2/testing:clock", { gameId })).worldSeconds < 63, "a drift changes the value within six drifts");
    await new Promise(r => setTimeout(r, 500));
  }
  const after = await ada!.query("v2/play:myRule", { gameId });
  assert.ok(after.drifts >= 1);
  assert.ok(after.driftedAt % 10 < 3, `drifted at ${after.driftedAt}, on a drift tick`);
  assert.deepEqual([after.family, after.tieBreaker], [before.family, before.tieBreaker], "never the family or tie-breaker");
  // The rule before the redraw, so a notice "changed from … to …" survives a reload (W5).
  assert.ok(after.previous && after.previous.card.length > 0, "the previous rule is kept");
  if (after.drifts === 1) assert.deepEqual([after.previous.params, after.previous.card], [before.params, before.card]);
  assert.notEqual(after.ruleKey, before.ruleKey);

  const events = await admin.query("v2/testing:events", { gameId, after: -1 });
  // Staggered (one seat per event): Ada's redraw is an event of its own.
  const drift = events.find((e: any) => e.kind === "drift" && e.data.seats.some((s: any) => s.ruleKey === after.ruleKey));
  assert.ok(drift && drift.data.seats.length === 1, "the record has the redraw, one seat at a time");
  const drifts = events.filter((e: any) => e.kind === "drift");
  assert.ok(drifts.every((e: any) => e.data.seats.length === 1), "never two seats at once");
  assert.ok(events.some((e: any) => e.kind === "values" && e.seq > drift.seq), "and the objects' values under the new rules");
  // The record's size (coordinator, 15 Nov: the act events were 95% of a game's writes, 3.3 KB of each the transcript):
  // a skipped act keeps no transcript; an act that moved or failed keeps it (it can be re-run from its seed anyway).
  const acts = events.filter((e: any) => e.kind === "act");
  assert.ok(acts.some((e: any) => e.data.outcome === "skipped"), "the game has skipped acts");
  for (const e of acts) {
    if (e.data.outcome === "skipped") assert.equal(e.data.transcript, undefined, `act ${e.data.n}: a skip stores no transcript`);
    else assert.ok(Array.isArray(e.data.transcript), `act ${e.data.n} (${e.data.outcome}): keeps its transcript`);
  }
  await perform(ada!, "game.pause", {}, { gameId });
  // Her knowledge shows her own bits under the new rule on the states she knows, the others' sum as told, nothing
  // learnt anew (the coordinator's follow-up to #723).
  for (const k of await admin.query("v2/testing:knowledgeOf", { gameId, memberId: me })) {
    const was = knownBefore.get(k.objectId) as any;
    if (!was || was.version !== k.version) continue;   // a birth after the snapshot
    const own = await admin.query("v2/testing:ownBitsAt", { gameId, memberId: me, state: k.state });
    assert.ok(Math.abs(k.rarityBits - own) < 1e-9, `own bits under the new rule: ${k.rarityBits} vs ${own}`);
    assert.deepEqual([k.want, k.learnedAt], [was.want, was.learnedAt], "the others' sum as told, nothing learnt anew");
    assert.ok(Math.abs(k.points - k.rarityBits * Math.max(0, k.want)) < 1e-9);
  }
  const { rows, stale } = await admin.query("v2/testing:staleValues", { gameId });
  assert.ok(rows > 0 && stale === 0, `every stored value agrees with the current rules: ${stale} of ${rows} stale`);
  await perform(ada!, "game.end", {}, { gameId });
});
