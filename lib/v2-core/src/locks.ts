/**
 * Locks (docs/engine-v2/locks.md): a predicate on an object, defended with energy. A predicate is a program (owner
 * decision 48: "Predicates should just be programs with the same degrees of freedom as agents and the same complexity
 * scoring rules in terms of information read and program description length"): there is no predicate language here.
 * This module is the lock arithmetic and the order of an act under locks; running a program is the caller's
 * (`PredicateRunner`: lib/v2-agents runs it in the agent sandbox), so everything here is pure and synchronous.
 */
import type { Call, Invalid, ObjectType, Price, Variant } from "./contracts.ts";
import { applyCall } from "./walk.ts";

/** At most this many live locks on one object (the move check stays a few documents and a few program runs). */
export const LOCKS_PER_OBJECT = 8;
/** At most this many lock changes in one act. */
export const LOCK_OPS_PER_ACT = 8;
/** A predicate program's source, in characters (an agent's may be 16 KiB; a predicate runs on every call that meets it). */
export const MAX_LOCK_SOURCE = 1024;
/** The author's one-line description of what the program checks, in characters. */
export const MAX_LOCK_WORDS = 120;
/**
 * Distinct (lock, state) checks one act may ask for, its quotes included: past it a check counts as not met, so an
 * agent that prices hundreds of plans on a locked object is told so instead of running hundreds of programs.
 */
export const LOCK_CHECKS_PER_ACT = 64;

export type LockLanguage = "typescript" | "python";

/** A lock's predicate: a program defining `predicate(offer)`, returning true or false, and its author's description. */
export interface LockProgram {
  readonly language: LockLanguage;
  readonly source: string;
  /** What it checks, in the author's own words (never verified: the program is the predicate). */
  readonly words: string;
}

/**
 * One run of a predicate program on a state. `ok: false` is a program that failed there (it threw, ran past its limit,
 * read past its host calls, used randomness or returned something that is not true or false).
 */
export type PredicateRun =
  | { readonly ok: true; readonly holds: boolean; readonly readBits: number }
  | { readonly ok: false; readonly error: string };
/** Runs a predicate program on a state: deterministic, a function of the program and the state alone. */
export type PredicateRunner<S> = (program: LockProgram, state: S) => PredicateRun;

/**
 * The room's two lock prices (settings, tuned by play): energy per bit of a predicate's complexity to create a lock,
 * and energy per bit per world second to sustain it.
 */
export interface LockRates {
  readonly createPerBit: number;
  readonly upkeepPerBit: number;
}

const bad = (invalid: string): Invalid => ({ invalid });

/** A program as sent by a guest or a person, shape-checked; or why not. */
export function lockProgram(x: unknown): LockProgram | Invalid {
  const p = x as Partial<LockProgram> | null;
  if (typeof p !== "object" || p === null) return bad("a lock needs a predicate program");
  if (p.language !== "typescript" && p.language !== "python") return bad("a predicate program is in typescript or python");
  if (typeof p.source !== "string" || !p.source.trim()) return bad("a lock needs a predicate program defining predicate(offer)");
  if (p.source.length > MAX_LOCK_SOURCE) return bad(`a predicate program is at most ${MAX_LOCK_SOURCE} characters`);
  const words = typeof p.words === "string" ? p.words.replace(/\s+/g, " ").trim() : "";
  if (!words) return bad("a lock needs a one-line description of what its program checks");
  if (words.length > MAX_LOCK_WORDS) return bad(`a lock's description is at most ${MAX_LOCK_WORDS} characters`);
  return { language: p.language, source: p.source, words };
}

// ---------------------------------------------------------------- lock arithmetic

/** The energy burned to create a lock of `bits` complexity (its opening amount is on top). */
export const lockFee = (bits: number, rates: LockRates): number => rates.createPerBit * bits;
/** Upkeep, energy per world second, drawn from the lock's own energy. */
export const lockRate = (bits: number, rates: LockRates): number => rates.upkeepPerBit * bits;

export interface LockEnergy {
  readonly energy: number;
  readonly settledAt: number;
  readonly rate: number;
}
/** What a lock holds at world second `world` (upkeep settled lazily; never below 0). */
export const lockEnergyAt = (l: LockEnergy, world: number): number => Math.max(0, l.energy - l.rate * Math.max(0, world - l.settledAt));
/** The world second a lock's energy reaches 0 (Infinity with no upkeep). */
export const lockEndsAt = (l: LockEnergy): number => (l.rate > 0 ? l.settledAt + l.energy / l.rate : Infinity);

/** A live lock as an act sees it. */
export interface ActLock extends LockEnergy {
  readonly n: number;
  readonly program: LockProgram;
  /** Its complexity, fixed when it was made: the program's description length plus what it read on the state it was made on. */
  readonly programBits: number;
  readonly readBits: number;
  readonly bits: number;
}

/** What an act asks of the locks, as the guest sends it. */
export type LockOpWire =
  | { readonly op: "fund"; readonly lock: number; readonly amount: number }
  | { readonly op: "drain"; readonly lock: number; readonly amount: number }
  | { readonly op: "create"; readonly program: LockProgram; readonly amount: number };

/** A lock change as applied: drains clipped to what the lock held, creates with their number, complexity and prices. */
export type LockOpDone =
  | { readonly op: "fund" | "drain"; readonly lock: number; readonly amount: number; readonly spend: number }
  | { readonly op: "create"; readonly lock: number; readonly program: LockProgram; readonly programBits: number; readonly readBits: number; readonly bits: number;
      readonly fee: number; readonly amount: number; readonly rate: number; readonly spend: number };

const amountOk = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0 && x <= 1e9;
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * The lock changes before the calls (funds and drains), in order: the locks after them, settled at `world` and with any
 * drained to zero gone, and each change as applied. Or why not.
 */
export function applyLockChanges(locks: readonly ActLock[], ops: readonly LockOpWire[], world: number):
  { readonly locks: ActLock[]; readonly done: LockOpDone[] } | Invalid {
  let live: ActLock[] = locks.map(l => ({ ...l, energy: lockEnergyAt(l, world), settledAt: world })).filter(l => l.energy > 0);
  const done: LockOpDone[] = [];
  for (const o of ops) {
    if (o.op === "create") continue;
    if (!amountOk(o.amount)) return bad("an amount of energy is a positive number");
    const l = live.find(x => x.n === o.lock);
    if (!l) return bad(`there is no live lock #${o.lock} on this object`);
    if (o.op === "fund") {
      live = live.map(x => (x === l ? { ...x, energy: x.energy + o.amount } : x));
      done.push({ op: "fund", lock: l.n, amount: o.amount, spend: o.amount });
    } else {
      const take = Math.min(o.amount, l.energy);
      live = live.map(x => (x === l ? { ...x, energy: x.energy - take } : x)).filter(x => x.energy > 1e-12);
      done.push({ op: "drain", lock: l.n, amount: take, spend: take });
    }
  }
  return { locks: live, done };
}

/**
 * Whether a state passes the live locks: null, or why the first lock it fails forbids it. A program that fails on the
 * state counts as not met (docs/engine-v2/locks.md §4: a crash can never free an object, and it cannot trap one either,
 * because draining a lock runs no program).
 */
export function lockRefusal<S>(locks: readonly ActLock[], state: S, run: PredicateRunner<S>): Invalid | null {
  for (const l of [...locks].sort((a, b) => a.n - b.n)) {
    const r = run(l.program, state);
    if (r.ok && r.holds) continue;
    const held = `holding ${round2(l.energy)}: drain it first`;
    return bad(r.ok ? `breaks lock #${l.n} (${l.program.words}), ${held}`
      : `breaks lock #${l.n} (${l.program.words}): its program failed on that state, which counts as not met (${r.error.slice(0, 160)}); ${held}`);
  }
  return null;
}

/**
 * A runner for one act: each distinct (program, state) is run once, and at most `LOCK_CHECKS_PER_ACT` of them; past
 * that a check fails (so the move is refused), which is the same on every machine because it counts the checks asked
 * for, not the programs run.
 */
export function actRunner<S>(type: ObjectType<S>, run: PredicateRunner<S>, cap = LOCK_CHECKS_PER_ACT): PredicateRunner<S> {
  const seen = new Map<string, PredicateRun>();
  return (program, state) => {
    const key = `${program.language}\0${program.source}\0${type.encode(state)}`;
    const hit = seen.get(key);
    if (hit) return hit;
    if (seen.size >= cap) return { ok: false, error: `this act has asked for more than ${cap} lock checks` };
    const r = run(program, state);
    seen.set(key, r);
    return r;
  };
}

export interface LockedActInput<S> {
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly state: S;
  readonly calls: readonly Call[];
  readonly ops: readonly LockOpWire[];
  /** The object's live locks (any not yet settled are settled at `world`). */
  readonly locks: readonly ActLock[];
  readonly world: number;
  /** The number the next new lock takes on this object. */
  readonly nextLock: number;
  readonly rates: LockRates;
  readonly run: PredicateRunner<S>;
  /** A program's description length in bits (lib/v2-agents `summonBits`: what prices an agent's program). */
  readonly programBits: (program: LockProgram) => number;
}
export interface LockedActResult<S> {
  readonly result: S;
  readonly prices: readonly Price[];
  readonly total: number;
  readonly done: readonly LockOpDone[];
  /** The live locks after the act, settled at `world` (new ones included). */
  readonly locks: readonly ActLock[];
  /** The numbers of the locks the calls were checked against (those left after the act's funds and drains). */
  readonly checked: readonly number[];
  /** Energy the lock changes cost the actor (funds, drains, fees and opening amounts), on top of the act's charge. */
  readonly spend: number;
}

/**
 * One act under locks (docs/engine-v2/locks.md §4): funds and drains first, then the calls in order, each result
 * checked against the locks left, then the new locks, each of whose programs must run and return true on the state the
 * calls reached. Atomic: any failure is the act's reason and nothing changes.
 */
export function lockedAct<S>(input: LockedActInput<S>): LockedActResult<S> | Invalid {
  const { type, ops, run } = input;
  if (ops.length > LOCK_OPS_PER_ACT) return bad(`at most ${LOCK_OPS_PER_ACT} lock changes in one act`);
  const changed = applyLockChanges(input.locks, ops, input.world);
  if ("invalid" in changed) return changed;
  let s = input.state;
  const prices: Price[] = [];
  for (const c of input.calls) {
    const a = applyCall(type, input.variant, s, c);
    if ("invalid" in a) return a;
    const why = lockRefusal(changed.locks, a.result, run);
    if (why) return why;
    s = a.result;
    prices.push(a.price);
  }
  const live = [...changed.locks], done = [...changed.done];
  let next = input.nextLock;
  for (const o of ops) {
    if (o.op !== "create") continue;
    if (!amountOk(o.amount)) return bad("a new lock's opening amount is a positive number");
    if (live.length >= LOCKS_PER_OBJECT) return bad(`an object holds at most ${LOCKS_PER_OBJECT} live locks`);
    const program = lockProgram(o.program);
    if ("invalid" in program) return program;
    const r = run(program, s);
    if (!r.ok) return bad(`the lock's program failed on this object, so it cannot be locked with it: ${r.error.slice(0, 200)}`);
    if (!r.holds) return bad(`the object does not meet the lock's program (${program.words}), so it cannot be locked to it`);
    const programBits = input.programBits(program), bits = programBits + r.readBits;
    const fee = lockFee(bits, input.rates), rate = lockRate(bits, input.rates);
    const n = next++;
    live.push({ n, program, programBits, readBits: r.readBits, bits, energy: o.amount, settledAt: input.world, rate });
    done.push({ op: "create", lock: n, program, programBits, readBits: r.readBits, bits, fee, amount: o.amount, rate, spend: fee + o.amount });
  }
  return { result: s, prices, total: prices.reduce((t, p) => t + p.total, 0), done, locks: live, checked: changed.locks.map(l => l.n),
    spend: done.reduce((t, d) => t + d.spend, 0) };
}

/**
 * An act's applied lock changes, applied again to the object's live locks as they are at `world` (the server's commit,
 * and the tick's running view): no program runs. Drains are clipped again; new locks keep the complexity and prices the
 * act measured and take the next free numbers. With `checked` (the act moved the object, and its calls were checked
 * against these locks), any other lock live after the act's own changes refuses it: a lock made or refilled since the
 * act looked was never asked.
 */
export function commitLocks(input: { readonly locks: readonly ActLock[]; readonly done: readonly LockOpDone[]; readonly checked: readonly number[] | null;
  readonly world: number; readonly nextLock: number }):
  { readonly locks: ActLock[]; readonly done: LockOpDone[]; readonly spend: number } | Invalid {
  const ops: LockOpWire[] = input.done.flatMap(d => (d.op === "create" ? [] : [{ op: d.op, lock: d.lock, amount: d.amount }]));
  const changed = applyLockChanges(input.locks, ops, input.world);
  if ("invalid" in changed) return changed;
  if (input.checked) {
    const unasked = changed.locks.find(l => !input.checked!.includes(l.n));
    if (unasked) return bad(`lock #${unasked.n} (${unasked.program.words}) was made or refilled on this object after the act looked`);
  }
  const live = [...changed.locks], done = [...changed.done];
  let next = input.nextLock;
  for (const d of input.done) {
    if (d.op !== "create") continue;
    if (live.length >= LOCKS_PER_OBJECT) return bad(`an object holds at most ${LOCKS_PER_OBJECT} live locks`);
    const n = next++;
    live.push({ n, program: d.program, programBits: d.programBits, readBits: d.readBits, bits: d.bits, energy: d.amount, settledAt: input.world, rate: d.rate });
    done.push({ ...d, lock: n });
  }
  return { locks: live, done, spend: done.reduce((t, d) => t + d.spend, 0) };
}
