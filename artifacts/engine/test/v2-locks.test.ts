/**
 * Locks (docs/engine-v2/locks.md), live, behind the room setting `locks`. An agent that finds no lock on a line locks a
 * floor under its y-intercept with a predicate program; on an odd line it then tries a move that breaks the floor
 * (refused: "breaks lock #k"), on an even line it drains the lock and makes the same move in one act (committed, the
 * lock ended "drained"). Locks nobody drains decay and end ("decayed"). The public list shows the program, the energy
 * and the history as amounts and times, never who made or funded a lock, and every act that saw locks re-executes
 * exactly from its record (the programs joined from the locks' create events).
 *
 * What would break: the setting not reaching the tick or the commit; the commit not refusing a move no check asked;
 * drains not applied first; upkeep never ending a lock; a lock's maker disclosed; a lock act that replay cannot redo.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { predicateBits, predicateBoxes, predicateRunner, runAct, type ActRecord } from "@workspace/v2-agents";
import type { LockProgram } from "@workspace/v2-core";
import { createSandbox, type Sandbox } from "@workspace/v2-sandbox";
import { typeOf, variantOf } from "../convex/v2/world.ts";
import { admin, humans, perform } from "./v2-helpers.ts";

const SOURCE = `function agent(offer) {
  const ls = offer.locks();
  const c = whole(look(offer, "si").c);
  const floor = 'function predicate(offer) { return Q.cmp(look(offer, "si").c, Q.from("' + (c - 1) + '")) >= 0; }';
  if (ls.length === 0) { offer.lock(floor, 0.02, "the y-intercept is at least " + (c - 1)); return null; }
  if (offer.object % 2 === 0) offer.drain(ls[0].lock, 1000);
  return [move("si.shift", { k: -2 })];
}`;

let sandbox: Promise<Sandbox> | null = null;
after(async () => { if (sandbox) (await sandbox).close(); });

test("locks live: made, a breaking move refused, drained and moved in one act, decayed; unattributed; re-executed exactly", { timeout: 300_000 }, async () => {
  const [ada] = await humans("Locks Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Locks room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  // Locks open with 0.02 energy, so an undrained one decays within seconds (upkeep: bits × 0.005 / 240 a second).
  const set = await perform(ada!, "room.settings", { overrides: { locks: true, lockCreatePerBit: 0.005 } }, { roomId });
  assert.equal(set.ok, true, JSON.stringify(set));
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  const summoned = await perform(ada!, "agent.summon", { language: "typescript", source: SOURCE }, { gameId }, "action");
  assert.equal(summoned.ok, true, JSON.stringify(summoned));
  const me = (await ada!.query("v2/games:header", { gameId })).me;
  await perform(ada!, "game.startWorldNow", {}, { gameId });

  const seen = () => admin.query("v2/testing:events", { gameId, after: -1 }) as Promise<any[]>;
  const done = (es: any[]) => {
    const locks = es.filter(e => e.kind === "lock").map(e => e.data);
    const mine = es.filter(e => e.kind === "act" && e.data.memberId === me).map(e => e.data);
    return {
      made: locks.filter(l => l.op === "create"),
      refused: mine.filter(a => a.outcome === "failed" && /breaks lock #\d+/.test(a.reason ?? "")),
      drainedAndMoved: mine.filter(a => a.outcome === "committed" && a.locks?.some((d: any) => d.op === "drain")),
      endedDrained: locks.filter(l => l.op === "ended" && l.why === "drained"),
      decayed: locks.filter(l => l.op === "ended" && l.why === "decayed"),
    };
  };
  let events: any[] = [], d = done([]);
  for (let i = 0; !(d.made.length && d.refused.length && d.drainedAndMoved.length && d.endedDrained.length && d.decayed.length); i++) {
    assert.ok(i < 400, `every step happens: ${JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.length])))}`);
    await new Promise(r => setTimeout(r, 500));
    events = await seen();
    d = done(events);
  }

  const started = events.find(e => e.kind === "gameStarted").data;
  // A lock is a program made on what the line met; its complexity is the agent's measures, its fee and upkeep proportional.
  const made = d.made[0], rates = started.settings.lockRates;
  assert.match(made.program.words, /^the y-intercept is at least -?\d+$/);
  assert.equal(made.programBits, predicateBits(made.program));
  assert.ok(made.readBits > 0 && made.bits === made.programBits + made.readBits && made.amount === 0.02, JSON.stringify(made));
  assert.ok(Math.abs(made.fee - 0.005 * made.bits) < 1e-9 && Math.abs(made.rate - 0.005 / started.settings.economy.fullChargeSeconds * made.bits) < 1e-12, JSON.stringify({ made, rates }));
  // Refused on an odd line, drained and moved on an even one.
  assert.ok(d.refused.every(a => a.number % 2 === 1), "only odd lines refuse");
  assert.ok(d.drainedAndMoved.every(a => a.number % 2 === 0 && a.lockSpend > 0));

  // The public list: live locks with words, never who made them.
  const objects = [...new Set(events.filter(e => e.kind === "lock" && e.data.op === "create").map(e => e.data.objectId))];
  let listed: any[] = [];
  for (const objectId of objects) listed = listed.concat(await ada!.query("v2/locks:ofObject", { gameId, objectId }));
  for (const l of listed) {
    assert.deepEqual(Object.keys(l).sort(), ["added", "bits", "createdAt", "endsAt", "energy", "history", "language", "mine", "n", "programBits", "rate", "readBits", "settledAt", "source", "taken", "words"]);
    assert.match(l.words, /^the y-intercept is at least -?\d+$/);
    // The history is amounts and times; Ada's own entries are marked hers (her agent made them), and nobody is named.
    assert.ok(l.history.length >= 1 && l.history.every((h: any) => Object.keys(h).sort().join() === "amount,at,mine,op" && h.mine));
    assert.equal(l.mine.added, l.added);
  }

  await perform(ada!, "game.end", {}, { gameId });

  // Every act of Ada's agent that saw locks re-executes exactly from its record (the locks it saw are in its inputs).
  const type = typeOf(started.variant), variant = variantOf(started.variant);
  const player = started.players.find((p: any) => p.memberId === me);
  const acts = events.filter(e => e.kind === "act" && e.data.memberId === me && e.data.input?.lockSeen && e.data.charged === undefined).map(e => e.data);
  assert.ok(acts.length >= 3, `${acts.length} lock acts`);
  sandbox ??= createSandbox({ language: "typescript", execution: "inline" });
  const run = predicateRunner(type, variant, await predicateBoxes(["typescript"]));
  const programs = new Map<string, LockProgram>(events.filter(e => e.kind === "lock" && e.data.op === "create").map(e => [`${e.data.objectId}:${e.data.lock}`, e.data.program]));
  for (const a of acts) {
    const seenLocks = a.input.lockSeen;
    const { lockSeen: _seen, ...input } = a.input;
    const { record }: { record: ActRecord } = await runAct(await sandbox, {
      type, variant, state: type.decode(a.before), rule: { family: player.family, params: player.params, tieBreaker: player.tieBreaker },
      program: { language: "typescript", source: SOURCE }, seed: a.seed, energy: a.energy, object: a.number, liveObjects: a.liveObjects,
      ...input,
      locks: {
        world: seenLocks.world, nextLock: seenLocks.nextLock, rates, run, programBits: predicateBits,
        live: seenLocks.live.map((l: any) => ({ ...l, program: programs.get(`${a.objectId}:${l.n}`)! })),
      },
    });
    const same = (r: any) => ({ outcome: r.outcome, after: r.after, calls: r.calls.map((c: any) => [c.mutator, c.args]), locks: r.locks ?? [], reason: r.reason ?? null });
    assert.deepEqual(same(record), same(a), `act ${a.n}`);
  }
});

/**
 * By hand (the affordances, docs/engine-v2/locks.md §5, §7): with the setting off nothing shows; with it on a player
 * makes a lock from a ready-made predicate, another funds it, and the list shows each one what went in beyond their own
 * (amounts and times, never who); `lock.test` names the lock a change would break; a failing program makes no lock; a
 * drain to zero ends it.
 */
test("locks by hand: hidden when off; made, funded by another, listed with the history, tested, drained", { timeout: 300_000 }, async () => {
  const [ada, bo] = await humans("Hand Ada", "Hand Bo");
  const open = async (locks: boolean) => {
    const created = await perform(ada!, "room.create", { name: `Hand locks ${locks}` });
    const roomId = created.result.roomId;
    await perform(bo!, "room.join", { code: created.result.code });
    await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
    if (locks) assert.equal((await perform(ada!, "room.settings", { overrides: { locks: true, lockCreatePerBit: 0.01 } }, { roomId })).ok, true);
    const started = await perform(ada!, "game.start", {}, { roomId });
    assert.equal(started.ok, true, JSON.stringify(started));
    const { gameId } = started.result;
    const page = (await ada!.query("v2/play:objectIds", { gameId, sort: "born", paginationOpts: { numItems: 10, cursor: null } })).page;
    return { gameId, objectIds: page.map((o: any) => o.objectId) as string[] };
  };

  // Off: the header says so, and every lock operation is refused (hidden from the surfaces).
  const off = await open(false);
  assert.equal((await ada!.query("v2/games:header", { gameId: off.gameId })).locks, null);
  const refused = await perform(ada!, "lock.list", { objectId: off.objectIds[0] }, { gameId: off.gameId }, "query");
  assert.equal(refused.ok, false, JSON.stringify(refused));

  const on = await open(true);
  const scope = { gameId: on.gameId };
  assert.deepEqual((await ada!.query("v2/games:header", { gameId: on.gameId })).locks, { createPerBit: 0.01, upkeepPerBit: 0.01 / 240 });
  // A line with a y-intercept (not vertical).
  let objectId = "", c = 0;
  for (const id of on.objectIds) {
    const e = await perform(ada!, "object.element", { objectId: id, rep: "si", name: "c" }, scope, "query");
    const q = e.result?.value?.q ?? e.result?.value?.value;
    if (e.ok && typeof q === "string" && /^-?\d+$/.test(q)) { objectId = id; c = Number(q); break; }
  }
  assert.ok(objectId, "a line with a whole y-intercept");

  const checked = await perform(ada!, "lock.check", { objectId, ready: "floor", args: { reading: "si.c", floor: String(c - 3) }, language: "python" }, scope, "action");
  assert.equal(checked.result.meets, true, JSON.stringify(checked));
  const above = await perform(ada!, "lock.check", { objectId, ready: "floor", args: { reading: "si.c", floor: String(c + 1) }, language: "python" }, scope, "action");
  assert.equal(above.result.meets, false);
  assert.match(above.result.why, /does not meet/);
  const made = await perform(ada!, "lock.create", { objectId, amount: 5, ready: "floor", args: { reading: "si.c", floor: String(c - 3) }, language: "python" }, scope, "action");
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(made.result.lock, 1);
  assert.equal(made.result.bits, checked.result.bits);
  assert.ok(made.result.bits > 100 && Math.abs(made.result.fee - 0.01 * made.result.bits) < 1e-9 && Math.abs(made.result.spend - made.result.fee - 5) < 1e-9, JSON.stringify(made.result));
  const funded = await perform(bo!, "lock.fund", { objectId, lock: 1, amount: 7 }, scope, "action");
  assert.equal(funded.ok, true, JSON.stringify(funded));

  // Costly signalling: Ada sees 12 went in, 5 of it hers; the entries are amounts and times, hers marked, nobody named.
  const listed = (await perform(ada!, "lock.list", { objectId }, scope, "query")).result.locks;
  assert.equal(listed.length, 1);
  const l = listed[0];
  assert.equal(l.words, `the y-intercept is at least ${c - 3}`);
  assert.equal(l.language, "python");
  assert.match(l.source, /def predicate\(offer\)/);
  assert.equal(l.added, 12);
  assert.deepEqual(l.mine, { added: 5, taken: 0 });
  assert.deepEqual(l.history.map((h: any) => [h.op, h.amount, h.mine, "by" in h]), [["create", 5, true, false], ["fund", 7, false, false]]);
  assert.deepEqual((await perform(bo!, "lock.list", { objectId }, scope, "query")).result.locks[0].mine, { added: 7, taken: 0 });

  // The warning a composed move gets: which lock it would break.
  const breaks = await perform(ada!, "lock.test", { objectId, calls: [{ mutator: "si.shift", args: { k: "-10" } }] }, scope, "action");
  assert.deepEqual(breaks.result, { allowed: false, breaks: [{ lock: 1, words: `the y-intercept is at least ${c - 3}`, energy: 12 }] }, JSON.stringify(breaks));
  const fine = await perform(ada!, "lock.test", { objectId, calls: [{ mutator: "si.shift", args: { k: "1" } }] }, scope, "action");
  assert.deepEqual(fine.result, { allowed: true, breaks: [] });

  // A program that fails where the lock would be made makes no lock (and costs nothing).
  const broken = await perform(ada!, "lock.create", { objectId, amount: 1, language: "typescript", source: "function predicate(offer) { throw new Error('boom'); }", words: "always throws" }, scope, "action");
  assert.equal(broken.ok, false);
  assert.match(JSON.stringify(broken), /cannot be locked with it: .*boom/);

  // Bo drains it all: the lock ends, and the list is empty.
  const drained = await perform(bo!, "lock.drain", { objectId, lock: 1, amount: 100 }, scope, "action");
  assert.equal(drained.ok, true, JSON.stringify(drained));
  assert.equal(drained.result.spend, 12);
  assert.deepEqual((await perform(ada!, "lock.list", { objectId }, scope, "query")).result.locks, []);
});
