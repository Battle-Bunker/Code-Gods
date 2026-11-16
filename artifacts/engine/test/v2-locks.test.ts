/**
 * Locks (docs/engine-v2/locks.md), live, behind the room setting `locks`. An agent that finds no lock on a line locks a
 * floor under its y-intercept; on an odd line it then tries a move that breaks the floor (refused: "breaks lock #k"),
 * on an even line it drains the lock and makes the same move in one act (committed, the lock ended "drained"). Locks
 * nobody drains decay and end ("decayed"). The public list never names who made a lock, and every act that saw locks
 * re-executes exactly from its record.
 *
 * What would break: the setting not reaching the tick or the commit; the commit not checking calls against locks or
 * not applying drains first; upkeep never ending a lock; a lock's maker disclosed; a lock act that replay cannot redo.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { lockInfo, runAct, type ActRecord } from "@workspace/v2-agents";
import { parsePredicate, type Predicate } from "@workspace/v2-core";
import { createSandbox, type Sandbox } from "@workspace/v2-sandbox";
import { typeOf, variantOf } from "../convex/v2/world.ts";
import { admin, humans, perform } from "./v2-helpers.ts";

const SOURCE = `function agent(offer) {
  const ls = offer.locks();
  const c = whole(look(offer, "si").c);
  if (ls.length === 0) { offer.lock("si.c >= " + (c - 1), 0.02); return null; }
  if (offer.object % 2 === 0) offer.drain(ls[0].lock, 1000);
  return [move("si.shift", { k: -2 })];
}`;

let sandbox: Promise<Sandbox> | null = null;
after(async () => { if (sandbox) (await sandbox).close(); });

test("locks live: made, a breaking move refused, drained and moved in one act, decayed; unattributed; re-executed exactly", { timeout: 300_000 }, async () => {
  const [ada] = await humans("Locks Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Locks room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  // Locks open with 0.02 energy, so an undrained one decays within a minute even at the smallest I (upkeep: I / 240 a second).
  const set = await perform(ada!, "room.settings", { overrides: { locks: true } }, { roomId });
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
  // A lock is made on what the line met: the floor, its information content and fee, the energy put in.
  const made = d.made[0];
  assert.match(made.predicate, /^si\.c >= -?\d+$/);
  assert.ok(made.info > 0 && made.fee === made.info && made.amount === 0.02 && Math.abs(made.rate - made.info / started.settings.economy.fullChargeSeconds) < 1e-12, JSON.stringify(made));
  // Refused on an odd line, drained and moved on an even one.
  assert.ok(d.refused.every(a => a.number % 2 === 1), "only odd lines refuse");
  assert.ok(d.drainedAndMoved.every(a => a.number % 2 === 0 && a.lockSpend > 0));

  // The public list: live locks with words, never who made them.
  const objects = [...new Set(events.filter(e => e.kind === "lock" && e.data.op === "create").map(e => e.data.objectId))];
  let listed: any[] = [];
  for (const objectId of objects) listed = listed.concat(await ada!.query("v2/locks:ofObject", { gameId, objectId }));
  for (const l of listed) {
    assert.deepEqual(Object.keys(l).sort(), ["createdAt", "endsAt", "energy", "info", "n", "predicate", "rate", "settledAt", "words"]);
    assert.match(l.words, /^the y-intercept is at least -?\d+$/);
  }

  await perform(ada!, "game.end", {}, { gameId });

  // Every act of Ada's agent that saw locks re-executes exactly from its record (the locks it saw are in its inputs).
  const type = typeOf(started.variant), variant = variantOf(started.variant);
  const player = started.players.find((p: any) => p.memberId === me);
  const acts = events.filter(e => e.kind === "act" && e.data.memberId === me && e.data.input?.lockSeen && e.data.charged === undefined).map(e => e.data);
  assert.ok(acts.length >= 3, `${acts.length} lock acts`);
  sandbox ??= createSandbox({ language: "typescript", execution: "inline" });
  const info = lockInfo(type, variant);
  for (const a of acts) {
    const seenLocks = a.input.lockSeen;
    const { lockSeen: _seen, ...input } = a.input;
    const { record }: { record: ActRecord } = await runAct(await sandbox, {
      type, variant, state: type.decode(a.before), rule: { family: player.family, params: player.params, tieBreaker: player.tieBreaker },
      program: { language: "typescript", source: SOURCE }, seed: a.seed, energy: a.energy, object: a.number, liveObjects: a.liveObjects,
      ...input,
      locks: {
        world: seenLocks.world, nextLock: seenLocks.nextLock, fullChargeSeconds: started.settings.economy.fullChargeSeconds, info,
        live: seenLocks.live.map((l: any) => ({ ...l, text: l.predicate, predicate: parsePredicate(type, l.predicate) as Predicate })),
      },
    });
    const same = (r: any) => ({ outcome: r.outcome, after: r.after, calls: r.calls.map((c: any) => [c.mutator, c.args]), locks: r.locks ?? [], reason: r.reason ?? null });
    assert.deepEqual(same(record), same(a), `act ${a.n}`);
  }
});
