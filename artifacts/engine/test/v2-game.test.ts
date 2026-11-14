/**
 * Milestone M1's acceptance (integration plan §5.2), on the live local backend: a room of three practice partners on
 * `Lines · beginner`, planning 5 s and 60 world seconds. Every partner summons its rule's Simple starter (TypeScript
 * for one, Python for two), each makes committed acts, the standings are not zero and the game ends by itself. Then the
 * record replays (spec §9.2–§9.3): folding the stored events gives the final standings exactly, and re-executing every
 * act from its recorded inputs in a local sandbox gives the same act.
 *
 * What would break: an agent never acting or never committing; values or points diverging from the record; an act
 * whose outcome depends on anything the record does not hold (a replay that cannot reproduce the game).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { runAct, type ActRecord } from "@workspace/v2-agents";
import { lineType, lineZ } from "@workspace/v2-linear";
import { createSandbox, type Language, type Sandbox } from "@workspace/v2-sandbox";
import { admin, httpJwt, humans, perform, SITE_, type Human } from "./v2-helpers.ts";

let host: Human, roomId: string, gameId: string;
const events: any[] = [];

before(async () => {
  [host] = await humans("M1 Host");
  ({ roomId } = (await perform(host!, "room.create", { name: "M1 room" })).result);
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
});

test("no agent owes more than its capacity (the credit rule)", async () => {
  for (const a of await admin.query("v2/testing:agentsOf", { gameId })) assert.ok(a.energy >= -a.capacity - 1e-6, `${a.agentId}: ${a.energy} < -${a.capacity}`);
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
  for (const e of acts) {
    const d = e.data, key = `${d.agentId}:${d.program.version}`;
    if (!sources.has(key)) sources.set(key, (await admin.query("v2/testing:program", { agentId: d.agentId, version: d.program.version })).source);
    const language = d.program.language as Language;
    if (!sandboxes.has(language)) sandboxes.set(language, createSandbox({ language, execution: "inline" }));
    const rule = rules.get(d.memberId) as any;
    const { record } = await runAct(await sandboxes.get(language)!, {
      type: lineType, variant: lineZ, state: lineType.decode(d.before),
      rule: { family: rule.family, params: rule.params, tieBreaker: rule.tieBreaker },
      program: { language, source: sources.get(key)! }, seed: d.seed, energy: d.energy, object: d.number - 1, liveObjects: d.liveObjects,
    });
    const same = (r: ActRecord | any) => ({ outcome: r.outcome, after: r.after, charge: r.charge, calls: r.calls.map((c: any) => [c.mutator, c.site, c.args]), readBits: r.readBits });
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
  const [outsider] = await humans("M1 Outsider");
  assert.equal((await fetch(url, { headers: { authorization: `Bearer ${await httpJwt(outsider!.userId)}` } })).status, 403);
  const file = await (await fetch(url, { headers: { authorization: `Bearer ${await httpJwt(host!.userId)}` } })).json();
  assert.equal(file.version, 1);
  assert.deepEqual(file.events.map((e: any) => e.seq), events.map(e => e.seq), "every event, in order");
  assert.equal(file.rules.length, 3, "after the end every player's rule is open");
});
