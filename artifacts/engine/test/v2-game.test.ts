/**
 * Milestones M1's and M4's acceptance (integration plan §5.2, §5.5), on the live local backend, once per object type: a
 * room of three practice partners on `Lines · beginner`, then on `Grids · beginner`, planning 5 s and 60 world seconds. Every partner summons its rule's Simple starter (TypeScript
 * for one, Python for two), each makes committed acts, the standings are not zero and the game ends by itself. Then the
 * record replays (spec §9.2–§9.3): folding the stored events gives the final standings exactly, and re-executing every
 * act from its recorded inputs in a local sandbox gives the same act.
 *
 * What would break: an agent never acting or never committing; values or points diverging from the record; an act
 * whose outcome depends on anything the record does not hold (a replay that cannot reproduce the game).
 */
import { VALUE_RECORDS } from "../convex/v2/values.gen.ts";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { runAct, type ActRecord } from "@workspace/v2-agents";
import { lineType, lineZ } from "@workspace/v2-linear";
import { gridType, grid4 } from "@workspace/v2-grid";
import type { ObjectType, Variant } from "@workspace/v2-core";
import { createSandbox, type Language, type Sandbox } from "@workspace/v2-sandbox";
import { admin, httpJwt, humans, perform, SITE_, type Human } from "./v2-helpers.ts";

/** A dealt rule's value function as the tick passes it to an agent (decision 23), from the bundle by ruleKey. */
function valueFn(ruleKey: string) {
  const r = VALUE_RECORDS.find(x => x.ruleKey === ruleKey);
  assert.ok(r, `a dealt rule has a value function: ${ruleKey}`);
  return { knots: r.knots, tail: r.tail };
}

function gameSuite(preset: string, type: ObjectType<any>, variant: Variant) {
describe(preset, () => {
let host: Human, roomId: string, gameId: string;
const events: any[] = [];

before(async () => {
  [host] = await humans(`${preset} host`);
  ({ roomId } = (await perform(host!, "room.create", { name: `${preset} room`, preset })).result);
  await perform(host!, "room.setSpectator", { spectator: true }, { roomId });
  assert.deepEqual((await perform(host!, "seats.fillPracticePartners", {}, { roomId })).result, { added: 3 });
  await perform(host!, "room.settings", { overrides: { planningSeconds: 5, worldSeconds: 60 } }, { roomId });
  const started = await perform(host!, "game.start", {}, { roomId });
  assert.equal(started.ok, true, JSON.stringify(started));
  gameId = started.result.gameId;
  const deadline = Date.now() + 180_000;
  for (;;) {
    const h = await host!.query("v2/games:header", { gameId });
    if (h.phase === "ended") break;
    assert.ok(Date.now() < deadline, `the game ends within 3 minutes (phase ${h.phase})`);
    await new Promise(r => setTimeout(r, 1000));
  }
  for (let last = -1; ;) {
    const page = await admin.query("v2/testing:events", { gameId, after: last });
    if (page.length === 0) break;
    events.push(...page);
    last = page.at(-1).seq;
  }
}, { timeout: 240_000 });

test("every partner summons its starter, in both languages, and makes committed acts", () => {
  const started = events[0];
  assert.equal(started.kind, "gameStarted");
  const partners = started.data.players.map((p: any) => p.memberId);
  assert.equal(partners.length, 3);
  const summons = events.filter(e => e.kind === "command" && e.data.kind === "summon");
  assert.deepEqual(summons.map(e => e.data.language).sort(), ["python", "python", "typescript"]);
  for (const m of partners) {
    const acts = events.filter(e => e.kind === "act" && e.data.memberId === m);
    assert.ok(acts.some(e => e.data.outcome === "committed"), `partner ${m} made a committed act (${acts.length} acts: ${[...new Set(acts.map(e => `${e.data.outcome}:${e.data.reason ?? ""}`))].join(", ")})`);
  }
});

test("the standings are not zero and the game ended on its own at 60 world seconds", async () => {
  const end = events.at(-1);
  assert.equal(end.kind, "gameEnded");
  assert.equal(end.data.worldSeconds, 60);
  assert.ok(end.data.standings.some((r: any) => r.total > 0), JSON.stringify(end.data.standings));
  const seqs = events.map(e => e.seq);
  assert.deepEqual(seqs, seqs.map((_, i) => i), "the record is dense from 0");
  assert.equal((await host!.query("v2/rooms:get", { roomId })).game, null, "the room is free for the next game");
  // The world clock follows the wall clock: the game ends when its 60 s are up, not later because ticks ran slow.
  const header = await host!.query("v2/games:header", { gameId });
  assert.ok(header.endedAt - header.startedAt <= 60_000 + 4_000, `ended ${(header.endedAt - header.startedAt) / 1000} s after the world started`);
});

test("no agent owes more than its capacity (the credit rule)", async () => {
  for (const a of await admin.query("v2/testing:agentsOf", { gameId })) assert.ok(a.energy >= -a.capacity - 1e-6, `${a.agentId}: ${a.energy} < -${a.capacity}`);
});

test("no two objects ever hold the same state (decision 24)", () => {
  const held = new Map<string, string>();   // objectId → state
  const clash = (objectId: string, state: string) => [...held].find(([id, s]) => id !== objectId && s === state)?.[0];
  let refused = 0;
  for (const e of events) {
    if (e.kind === "objectBorn") {
      assert.equal(clash(e.data.objectId, e.data.state), undefined, `object ${e.data.number} was born a duplicate`);
      held.set(e.data.objectId, e.data.state);
    }
    if (e.kind === "act" && e.data.outcome === "committed") {
      assert.equal(clash(e.data.objectId, e.data.after), undefined, `act ${e.data.n} moved line ${e.data.number} onto another's state`);
      held.set(e.data.objectId, e.data.after);
    }
    if (e.kind === "act" && /already in that state/.test(e.data.reason ?? "")) {
      refused++;
      // Refused like an invalid call: the line stays, and the agent pays its reads only, not the change.
      assert.equal(e.data.outcome, "failed");
      assert.equal(e.data.after, e.data.before);
      assert.ok(e.data.charged < e.data.charge, `act ${e.data.n} paid ${e.data.charged} of ${e.data.charge}`);
    }
  }
  console.log(`# moves refused as duplicates: ${refused}`);
});

test("the tugs-of-war the tick folded are the act log's", async () => {
  const { moves, tugs } = await admin.query("v2/testing:movesAndTugs", { gameId });
  const want = new Map<string, any>();
  for (const m of [...moves].sort((a: any, b: any) => a.seq - b.seq)) {
    const k = `${m.memberId}:${m.objectId}`, t = want.get(k) ?? { moves: 0, flips: 0, mySpend: 0, others: [] as string[], from: m.worldSeconds, best: null as any };
    if (t.moves > 0 && m.mine !== t.lastMine) t.flips++;
    t.moves++; t.lastMine = m.mine; t.mySpend += m.mine ? m.charge : 0; t.to = m.worldSeconds;
    if (!m.mine && !t.others.includes(m.by)) t.others.push(m.by);
    if (!t.best || m.points > t.best.points) t.best = { state: m.stateAfter, points: m.points };
    want.set(k, t);
  }
  assert.equal(tugs.length, want.size, "one row per (player, line) with moves");
  for (const t of tugs) {
    const w = want.get(`${t.memberId}:${t.objectId}`);
    assert.ok(w, `a tug row with moves behind it: ${t.number}`);
    assert.deepEqual({ moves: t.moves, flips: t.flips, others: t.others, from: t.from, to: t.to, best: t.best }, { moves: w.moves, flips: w.flips, others: w.others, from: w.from, to: w.to, best: w.best });
    assert.ok(Math.abs(t.mySpend - w.mySpend) < 1e-6);
  }
});

test("folding the record gives the final standings exactly", () => {
  const rarity = new Map<string, Map<string, number>>();   // object → member → bits
  for (const e of events) if (e.kind === "values") rarity.set(e.data.objectId, new Map(e.data.values.map((x: any) => [x.memberId, x.rarityBits])));
  const totals = new Map<string, number>();
  for (const byMember of rarity.values()) {
    const sum = [...byMember.values()].reduce((a, b) => a + b, 0);
    for (const [m, n] of byMember) totals.set(m, (totals.get(m) ?? 0) + n * (sum - n));
  }
  for (const row of events.at(-1).data.standings) assert.ok(Math.abs(row.total - (totals.get(row.memberId) ?? 0)) < 1e-6, `${row.memberId}: ${row.total} vs folded ${totals.get(row.memberId)}`);
});

const sandboxes = new Map<Language, Promise<Sandbox>>();
after(async () => { for (const s of sandboxes.values()) (await s).close(); });

test("re-executing every act from its recorded inputs gives the same act", { timeout: 120_000 }, async () => {
  const rules = new Map(events[0].data.players.map((p: any) => [p.memberId, p]));
  const sources = new Map<string, string>();
  // Acts the commit overrode (a stale state, an unaffordable change) carry `charged`; the rest are the agent's own record.
  const acts = events.filter(e => e.kind === "act" && e.data.charged === undefined);
  assert.ok(acts.length > 10, `enough acts to mean something (${acts.length})`);
  assert.ok(acts.some(e => e.data.input?.value && Array.isArray(e.data.input.history)), "agents are told their owner's stake in the object, and it is recorded");
  // The moves that concerned their owner on the line (the value row's `recent`), oldest first, at most 8.
  const told = acts.filter(e => e.data.input?.history?.length);
  assert.ok(told.length > 0, "agents are told the moves on a line that concerned their owner");
  for (const e of told) {
    const h = e.data.input.history;
    assert.ok(h.length <= 8 && h.every((m: any) => typeof m.mine === "boolean" && Number.isFinite(m.pointsBefore) && Number.isFinite(m.pointsAfter)), JSON.stringify(h));
  }
  for (const e of acts) {
    const d = e.data, key = `${d.agentId}:${d.program.version}`;
    if (!sources.has(key)) sources.set(key, (await admin.query("v2/testing:program", { agentId: d.agentId, version: d.program.version })).source);
    const language = d.program.language as Language;
    if (!sandboxes.has(language)) sandboxes.set(language, createSandbox({ language, execution: "inline" }));
    const rule = rules.get(d.memberId) as any;
    const { record } = await runAct(await sandboxes.get(language)!, {
      type, variant, state: type.decode(d.before),
      rule: { family: rule.family, params: rule.params, tieBreaker: rule.tieBreaker },
      program: { language, source: sources.get(key)! }, seed: d.seed, energy: d.energy, object: d.number, liveObjects: d.liveObjects,
      // What the agent was told of its owner's stake (recorded), and the dealt rule's value function (from the bundle).
      ...(d.input ?? {}), values: valueFn(rule.ruleKey),
      // The other seats' rules and value functions (their othersAfter), in seat order, from the bundle.
      others: [...rules.values()].filter((p: any) => p.memberId !== d.memberId).map((p: any) => ({ rule: { family: p.family, params: p.params, tieBreaker: p.tieBreaker }, values: valueFn(p.ruleKey) })),
    });
    const same = (r: ActRecord | any) => ({ outcome: r.outcome, after: r.after, charge: r.charge, calls: r.calls.map((c: any) => [c.mutator, c.site, c.args]), readBits: r.readBits, notes: r.notes ?? [] });
    assert.deepEqual(same(record), same(d), `act ${d.n}`);
  }
});

test("the stored replay: built once at the end, served only to a member with a JWT, and it is the record", { timeout: 60_000 }, async () => {
  for (let i = 0; !(await host!.query("v2/replays:stored", { gameId })).stored; i++) {
    assert.ok(i < 100, "the replay file is built");
    await new Promise(r => setTimeout(r, 300));
  }
  const url = `${SITE_}/api/v2/replay/${gameId}`;
  assert.equal((await fetch(url)).status, 401, "sign-in is required");
  const [outsider] = await humans(`${preset} outsider`);
  assert.equal((await fetch(url, { headers: { authorization: `Bearer ${await httpJwt(outsider!.userId)}` } })).status, 403);
  const file = await (await fetch(url, { headers: { authorization: `Bearer ${await httpJwt(host!.userId)}` } })).json();
  assert.equal(file.version, 1);
  assert.deepEqual(file.events.map((e: any) => e.seq), events.map(e => e.seq), "every event, in order");
  assert.equal(file.rules.length, 3, "after the end every player's rule is open");
});
});
}

gameSuite("lines-beginner", lineType, lineZ);
// Decision 23: a game deals only rules with a value function. Grids play end to end here once their value functions are
// in values.gen.ts; until then the server withholds the preset, and this says so.
if (VALUE_RECORDS.some(r => r.variant === grid4.id)) gameSuite("grids-beginner", gridType, grid4);
else test("grids-beginner is withheld until grid value functions land", async () => {
  const [h] = await humans("grids withheld");
  const out = await perform(h!, "room.create", { name: "grids", preset: "grids-beginner" }).catch((e: any) => e.data);
  assert.match(out.error.message, /not playable yet/);
  assert.ok(!(await h!.query("v2/setups:presets", {})).some((p: any) => p.id === "grids-beginner"), "not listed");
});
