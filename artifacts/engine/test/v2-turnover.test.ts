/**
 * Line turnover (docs/engine-v2/retirement-design.md), behind the room settings `liveCap` and `birthSeconds` (off unless
 * set): a game with at most 2 live lines and a birth every 4 world seconds. When a birth would make 3 live, the oldest
 * live line retires first, in the same commit: its points stay in every total (banked), no agent is offered it again,
 * drift leaves it alone, and the record has a `retired` event before the birth's `objectBorn`.
 *
 * What would break: more live lines than the cap; a line other than the oldest retiring; a retired line's points
 * leaving the totals or changing; an act on a retired line; a retirement missing from the record.
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform, type Human } from "./v2-helpers.ts";
import { VALUE_INDEX as VALUE_RECORDS } from "../convex/v2/valuesIndex.gen.ts";
import { familyOf } from "../convex/v2/deal.ts";

const CAP = 2, BIRTH = 4, WORLD = 120;
let ada: Human, gameId: string, events: any[] = [];

async function allEvents(id: string) {
  const out: any[] = [];
  for (let last = -1; ;) {
    const page = await admin.query("v2/testing:events", { gameId: id, after: last });
    if (page.length === 0) return out;
    out.push(...page);
    last = page.at(-1).seq;
  }
}

before(async () => {
  [ada] = await humans("Turnover Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Turnover room", preset: "lines-beginner" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  const set = await perform(ada!, "room.settings", { overrides: { planningSeconds: 5, worldSeconds: WORLD, liveCap: CAP, birthSeconds: BIRTH, driftSeconds: 10 } }, { roomId });
  assert.equal(set.ok, true, JSON.stringify(set));
  await admin.mutation("v2/lobby:setTimeScale", { roomId, factor: 4 });
  const started = await perform(ada!, "game.start", {}, { roomId });
  assert.equal(started.ok, true, JSON.stringify(started));
  gameId = started.result.gameId;
  // A rule that drifts (a line-q family with a parameter grid, not a ladder) for Ada, so drift runs while lines retire.
  const counts = new Map<string, number>();
  for (const r of VALUE_RECORDS) if (r.variant === "line-q" && !familyOf(r.family).keepsParams) counts.set(`${r.family}|${r.tieBreaker}`, (counts.get(`${r.family}|${r.tieBreaker}`) ?? 0) + 1);
  const [pick] = [...counts].find(([, n]) => n >= 3)!;
  const rec = VALUE_RECORDS.find(r => r.variant === "line-q" && `${r.family}|${r.tieBreaker}` === pick)!;
  await admin.mutation("v2/testing:setRule", { gameId, userId: ada!.userId, ruleKey: rec.ruleKey });
  await perform(ada!, "game.startWorldNow", {}, { gameId });
  const deadline = Date.now() + 180_000;
  while ((await ada!.query("v2/games:header", { gameId })).phase !== "ended") {
    assert.ok(Date.now() < deadline, "the game ends within 3 minutes");
    await new Promise(r => setTimeout(r, 1000));
  }
  events = await allEvents(gameId);
}, { timeout: 240_000 });

test("the game's settings carry the turnover, and the header shows the cap", async () => {
  const s = await admin.query("v2/testing:settingsOf", { gameId });
  assert.deepEqual(s.turnover, { liveCap: CAP, retiredPoints: "banked", retiredHolds: true });
  assert.equal(s.regularBirths, true);
  assert.equal(s.economy.birthsPerSecond, 1 / BIRTH);
  assert.deepEqual((await ada.query("v2/games:header", { gameId })).turnover, { liveCap: CAP, banked: true, birthSeconds: BIRTH });
});

test("never more live lines than the cap; the oldest live line retires, before the birth that would pass the cap", () => {
  const live: number[] = [];
  let retirements = 0, started = false;
  for (const [i, e] of events.entries()) {
    if (e.kind === "retired") {
      retirements++;
      assert.equal(e.data.number, Math.min(...live), `seq ${e.seq}: the oldest live line retires`);
      live.splice(live.indexOf(e.data.number), 1);
      // In the commit of the birth it makes room for; or at the start, when there are more starting lines than the cap.
      const next = events.slice(i + 1).find((x: any) => ["objectBorn", "act", "tick", "phase"].includes(x.kind));
      assert.ok(next?.kind === "objectBorn" || (!started && (next?.kind === "phase" || next?.kind === "tick")), `seq ${e.seq}: followed by ${next?.kind}`);
    }
    if (e.kind === "objectBorn") live.push(e.data.number);
    if (e.kind === "phase" && e.data.phase === "live") started = true;
    if (started) assert.ok(live.length <= CAP, `seq ${e.seq}: ${live.length} live`);
  }
  // 3 starting lines (one retires at the start) and a birth every 4 s for 120 s: about 30 births, each retiring one.
  assert.ok(retirements >= 25, `${retirements} retirements`);
});

test("a retired line is never offered again, and drift leaves its values alone", () => {
  const retiredAt = new Map(events.filter(e => e.kind === "retired").map(e => [e.data.number, e.seq]));
  for (const e of events) {
    if (e.kind !== "act" && e.kind !== "values") continue;
    const at = retiredAt.get(e.data.number);
    assert.ok(at === undefined || e.seq < at, `${e.kind} on line ${e.data.number} at seq ${e.seq}, after it retired at ${at}`);
  }
  assert.ok(events.some(e => e.kind === "drift"), "the rules drifted while lines were retired");
});

test("a retired line's points are banked: unchanged since its retirement, and in every total", async () => {
  const t = await admin.query("v2/testing:turnoverOf", { gameId });
  const retired = events.filter(e => e.kind === "retired");
  assert.equal(t.retired.length, retired.length);
  for (const e of retired) {
    const row = t.retired.find((r: any) => r.number === e.data.number)!;
    assert.ok(row.retiredAt !== undefined);
    for (const p of e.data.points) assert.equal(row.points[p.memberId], p.points, `line ${e.data.number}: ${p.memberId}'s points as banked`);
  }
  // Every total is the sum of every line's points, retired and live.
  for (const [memberId, total] of Object.entries(t.totals as Record<string, number>)) {
    const sum = t.lines.reduce((a: number, l: any) => a + (l.points[memberId] ?? 0), 0);
    assert.ok(Math.abs(total - sum) < 1e-6, `${memberId}: total ${total}, lines ${sum}`);
  }
  assert.ok(t.live.length <= CAP && t.live.every((n: number) => !t.retired.some((r: any) => r.number === n)));
});

test("with retiredPoints \"dropped\" and retiredHolds false, a retired line leaves the totals and releases its state", { timeout: 240_000 }, async () => {
  const [bo] = await humans("Turnover Bo");
  const { roomId } = (await perform(bo!, "room.create", { name: "Turnover room 2", preset: "lines-beginner" })).result;
  await perform(bo!, "seats.fillPracticePartners", {}, { roomId });
  const set = await perform(bo!, "room.settings", { overrides: { planningSeconds: 5, worldSeconds: 30, liveCap: CAP, birthSeconds: BIRTH, retiredPoints: "dropped", retiredHolds: false } }, { roomId });
  assert.equal(set.ok, true, JSON.stringify(set));
  await admin.mutation("v2/lobby:setTimeScale", { roomId, factor: 4 });
  const id = (await perform(bo!, "game.start", {}, { roomId })).result.gameId;
  await perform(bo!, "game.startWorldNow", {}, { gameId: id });
  const deadline = Date.now() + 180_000;
  while ((await bo!.query("v2/games:header", { gameId: id })).phase !== "ended") {
    assert.ok(Date.now() < deadline, "the game ends within 3 minutes");
    await new Promise(r => setTimeout(r, 1000));
  }
  const t = await admin.query("v2/testing:turnoverOf", { gameId: id });
  assert.ok(t.retired.length >= 5, `${t.retired.length} retirements`);
  assert.ok(t.retired.every((l: any) => l.released), "every retired line released its state");
  assert.ok(t.lines.filter((l: any) => l.retiredAt === undefined).every((l: any) => !l.released));
  const retiredEvents = (await allEvents(id)).filter(e => e.kind === "retired");
  assert.ok(retiredEvents.every(e => e.data.banked === false));
  // Every total is the live lines' points alone.
  for (const [memberId, total] of Object.entries(t.totals as Record<string, number>)) {
    const sum = t.lines.filter((l: any) => l.retiredAt === undefined).reduce((a: number, l: any) => a + (l.points[memberId] ?? 0), 0);
    assert.ok(Math.abs(total - sum) < 1e-6, `${memberId}: total ${total}, live lines ${sum}`);
  }
});

test("the objects list shows the live lines; the retired list shows the retired ones, each with its banked points", async () => {
  const page = { numItems: 50, cursor: null };
  const t = await admin.query("v2/testing:turnoverOf", { gameId });
  const liveNumbers = t.lines.filter((l: any) => l.retiredAt === undefined).map((l: any) => l.number).sort((a: number, b: number) => a - b);
  const listed = (await ada.query("v2/play:objectIds", { gameId, sort: "born", paginationOpts: page })).page.map((r: any) => r.number);
  assert.deepEqual([...listed].sort((a, b) => a - b), liveNumbers, "the list is the live lines");
  const banked = (await ada.query("v2/play:banked", { gameId, paginationOpts: page })).page;
  assert.deepEqual(banked.map((r: any) => r.number).sort((a: number, b: number) => a - b), t.retired.map((l: any) => l.number).sort((a: number, b: number) => a - b), "the retired list is the retired lines");
  assert.ok(banked[0].number > banked.at(-1).number, "the latest retired first");
  const me = (await ada.query("v2/games:header", { gameId })).me;
  for (const r of banked.slice(0, 5)) {
    const o = await ada.query("v2/play:object", { objectId: r.objectId });
    const line = t.retired.find((l: any) => l.number === r.number);
    assert.equal(o.retiredAt, line.retiredAt);
    // Ended: exact; the points it banked for Ada.
    assert.equal(o.value.points, line.points[me], `line ${r.number}: banked points`);
    assert.equal(o.lookPrice, undefined, "no look on a retired line");
    // Its final state (the game is over: everything is open).
    assert.equal(o.state, events.find(e => e.kind === "retired" && e.data.number === r.number).data.state);
  }
  // A live line's object has no retirement.
  const first = (await ada.query("v2/play:objectIds", { gameId, sort: "born", paginationOpts: page })).page[0];
  assert.equal((await ada.query("v2/play:object", { objectId: first.objectId })).retiredAt, undefined);
});

