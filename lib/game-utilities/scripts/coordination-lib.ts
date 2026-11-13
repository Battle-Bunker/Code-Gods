/**
 * Coordination incentives: a faithful offline model of one game, a zoo of policies, and the policy game's equilibria.
 * Rationale, tables and conclusions: docs/coordination-incentives.md. Runner: scripts/coordination.ts.
 *
 * What is real: the object type (spawns, one-cell writes), the dealt rules (family evaluators), their shipped calibration
 * tables (bits), game-core's energy (settleAgentEnergy, pickByEnergy, the 4 Hz cap, chargeAct, changeCost), the read
 * price (READ_PRICE) and the setup's settings (power, rates, duration, spawns). The loop copies the engine tick
 * (artifacts/engine/convex/engine/tick.ts): interactionRateHz opportunities per world second, evenly spaced; each picks
 * an object uniformly, then one eligible agent (positive energy, not offered one in the last 1/4 s) with probability
 * proportional to its energy; the act is applied at once (the engine's waves apply strictly in opportunity order);
 * a skip pays its reads; a change pays reads + W + βW². There are no turns and no seats in that loop.
 *
 * What is modelled: an agent is a native function equal to a small agent program (its one-cell search), not a
 * sandboxed run; a policy that needs the other gods' rules gets them exactly after `learnSeconds` (before that it plays
 * greedy); the futility memo is left out (these policies skip instead of failing).
 *
 * The rule variants under study are fields of `Econ`, all off by default (= the rules on develop).
 */
import { changeCost, CHANGE_READ_RATIO, type GridValue, type Rng } from "@workspace/game-types";
import { actCredit, affordable, energyCapacity, offerReadBits, pickByEnergy, chargeAct, settleAgentEnergy, type AgentAccount } from "../../game-core/src/energy.ts";
import { poissonIntervalSeconds } from "../../game-core/src/index.ts";
import { compareOrdinals, type Ordinal } from "../src/index.ts";
import { apply, type Move, type Rule, type Space } from "./rule-difficulty-lib.ts";

// ------------------------------------------------------------------------------------------------
// payoff
// ------------------------------------------------------------------------------------------------

/**
 * How a god's payoff on an object combines the other gods' bits (candidate rules, docs §5):
 *   sum   own × Σ others                         (develop: game-core payoff)
 *   min   own × (P − 1) × the smallest other     (an object pays only when everybody else values it)
 *   geo   own × (P − 1) × the geometric mean of the others
 * All three agree when the others' bits are equal, and with two gods.
 */
export type Aggregate = "sum" | "min" | "geo";

/** Each god's payoff on one object from the gods' net bits (no defence goals: bits ≥ 0). */
export function payoffs(bits: readonly number[], aggregate: Aggregate = "sum"): number[] {
  const P = bits.length;
  return bits.map((own, i) => {
    let sum = 0, min = Infinity, logSum = 0;
    for (let j = 0; j < P; j++) if (j !== i) { sum += bits[j]; min = Math.min(min, bits[j]); logSum += Math.log(Math.max(bits[j], 0)); }
    const care = aggregate === "sum" ? Math.max(0, sum) : aggregate === "min" ? (P - 1) * Math.max(0, min) : (P - 1) * Math.exp(logSum / (P - 1));
    return care > 0 ? own * care : 0;
  });
}
const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);

// ------------------------------------------------------------------------------------------------
// the economy
// ------------------------------------------------------------------------------------------------

export interface Econ {
  /** The game's settings that matter here (a seed setup's, or overrides). */
  readonly powerPerSecond: number;
  readonly interactionRateHz: number;
  readonly durationSeconds: number;
  readonly startingObjectCount: number;
  readonly spawnRateHz: number;
  /** κ: bits read per energy bit (game-types CHANGE_READ_RATIO). */
  readonly kappa: number;
  /** Agents per god, each with an equal share of the god's whole power. */
  readonly agentsPerGod: number;
  /** settings.fullChargeSeconds: an agent stores at most this many seconds of its income (undefined: no capacity). */
  readonly capacitySeconds?: number;
  /** Distance pricing (docs/mutation-cost-design.md): a write of digit a→b costs W = log2(cells) + 1.585·|a − b|. */
  readonly distancePricing: boolean;
  /** Candidate rule "breaking costs extra": each bit of salience (Σ every god's bits) a change destroys adds this many bits to its work W. 0 = develop. */
  readonly erasure: number;
  /**
   * σ (bits) of the disclosure noise on the salience the erasure charge is computed from: 0 charges on the exact
   * salience; the engine's live disclosure adds a fixed N(0, σ²) per value (settings.peerNoiseBits, 8 by default).
   */
  readonly erasureNoiseBits: number;
  readonly aggregate: Aggregate;
  /** settings.peerNoiseBits: σ of the fixed noise on the others' sum a god (and the commit clause) sees per value. */
  readonly peerNoiseBits: number;
  /** What decides the game: the payoff at the end (develop) or its average over the game's time. */
  readonly scoring: "final" | "integral";
  /** World seconds before a policy that uses the other gods' rules knows them (it plays greedy until then). */
  readonly learnSeconds: number;
  /**
   * An agent is offered at most this many opportunities per world second (develop until #283: 4). Undefined: no cap,
   * as on develop since the selection rules of 11 Nov 2026 (docs/energy-model.md §7).
   */
  readonly agentCapHz?: number;
  /** Every offer is itself a read of which live object the agent was given (game-core offerReadBits, §7.1). */
  readonly offerReads: boolean;
  /** One-cell writes a searching agent tries per act (a random sample; ≥ every move = exhaustive). */
  readonly candidates: number;
  /**
   * The debt bound (docs/energy-model.md §7.2, 13 Nov 2026): a change that would leave the agent owing more than its
   * capacity does not commit, and the act pays its reads only. Without a capacity there is no bound.
   */
  readonly debtBound: boolean;
}
export const DEVELOP_ECON = { kappa: CHANGE_READ_RATIO, agentsPerGod: 1, distancePricing: false, erasure: 0, erasureNoiseBits: 0, aggregate: "sum", peerNoiseBits: 8, scoring: "final", learnSeconds: 0, candidates: 24, offerReads: true, debtBound: true } as const;

/** The work W (bits) of one write and its erasure surcharge; the charge is changeCost(W). */
export function writeWork(sp: Space, econ: Pick<Econ, "distancePricing" | "erasure">, from: number, to: number, salienceBefore: number, salienceAfter: number): number {
  const cell = Math.log2(sp.cells);
  const base = econ.distancePricing ? cell + Math.log2(3) * Math.abs(from - to) : cell + 2 * Math.log2(sp.S);
  return base + econ.erasure * Math.max(0, salienceBefore - salienceAfter);
}

// ------------------------------------------------------------------------------------------------
// policies
// ------------------------------------------------------------------------------------------------

export const POLICIES = ["random", "greedy", "clause", "considerate", "payoff", "cooperator", "defender", "deny", "hoarder", "sniper"] as const;
export type Policy = typeof POLICIES[number];

/** What a policy needs to know, which sets its program's size (summon price) and what it reads. */
export const POLICY_INFO: Readonly<Record<Policy, { readonly reads: boolean; readonly othersRules: boolean; readonly kid: string }>> = {
  random: { reads: false, othersRules: false, kid: "Writes a random digit in a random cell, without looking." },
  greedy: { reads: true, othersRules: false, kid: "Makes the one-cell change that most raises its own rule; skips when none does." },
  clause: { reads: true, othersRules: false, kid: "Greedy on its own rule, with the commit clause: the engine keeps the change only if it raises its points as it sees them." },
  considerate: { reads: true, othersRules: true, kid: "Greedy on its own rule, but never makes a change that lowers another god's bits." },
  payoff: { reads: true, othersRules: true, kid: "Makes the change that most raises its own points (own bits × the others' bits); skips when none does." },
  cooperator: { reads: true, othersRules: true, kid: "Makes the change that most raises everybody's points together, among those that do not lower its own." },
  defender: { reads: true, othersRules: true, kid: "Repairs its own bits first; when they cannot rise, raises the others' bits without lowering its own." },
  deny: { reads: true, othersRules: true, kid: "Makes the change that most raises its own points minus the others' average points (the spoiler)." },
  hoarder: { reads: true, othersRules: true, kid: "Like payoff, but acts only on changes worth much more than they cost, and saves energy otherwise." },
  sniper: { reads: false, othersRules: true, kid: "Does nothing and saves energy until the last seconds, then plays deny as fast as it can." },
};

export interface Tuning {
  /**
   * Each policy's summon price in bits (its program's description length). A god saves its whole power from the start,
   * on top of `startingEnergy`, and its agents exist (and earn) only once the price is paid. Absent: free.
   */
  readonly summonBits?: Partial<Record<Policy, number>>;
  readonly startingEnergy?: number;
  /** hoarder: the least points gained per energy bit spent. */
  readonly hoarderThreshold: number;
  /** sniper: world seconds before the end at which it starts acting. */
  readonly sniperSeconds: number;
}
export const DEFAULT_TUNING: Tuning = { hoarderThreshold: 2, sniperSeconds: 30 };

export interface Obj { grid: GridValue; ords: Ordinal[]; bits: number[]; pay: number[] }
export interface ActView {
  readonly god: number;
  readonly object: Obj;
  readonly rules: readonly Rule[];
  readonly sp: Space;
  readonly econ: Econ;
  readonly tuning: Tuning;
  /** Whether the policy knows the other gods' rules yet. */
  readonly informed: boolean;
  /** World seconds left. */
  readonly remaining: number;
  readonly rng: Rng;
}
export interface Decision {
  /** null: a skip. */
  readonly move: Move | null;
  /** Bits of the object the act read. */
  readonly readBits: number;
  /** The object after the move, scored (present with a move). */
  readonly after?: { grid: GridValue; ords: Ordinal[]; bits: number[]; pay: number[] };
}

const EPS = 1e-9;

/** One act of `policy`: the decision an equivalent agent program returns on this object. */
export function decide(policy: Policy, v: ActView): Decision {
  const { sp, object: o, rules, god: i, econ, rng } = v;
  const P = rules.length, fullRead = sp.cells * (Math.log2(sp.S) + (sp.C > 1 ? Math.log2(sp.C) : 0));
  const score = (grid: GridValue, only?: number) => {
    const ords = rules.map((r, j) => (only === undefined || only === j ? r.score(grid) : o.ords[j]));
    const bits = ords.map((x, j) => (only === undefined || only === j ? rules[j].bits(x) : o.bits[j]));
    return { grid, ords, bits, pay: payoffs(bits, econ.aggregate) };
  };
  if (policy === "random") {
    // A uniformly random digit in a uniformly random cell; the digit already there changes nothing (a failed act, free).
    const cell = rng.int(sp.cells), value = rng.int(sp.S), move: Move = { cell, layer: 0, value };
    if (value === o.grid.sym[cell]) return { move: null, readBits: 0 };
    return { move, readBits: 0, after: score(apply(o.grid, move)) };
  }
  let p: Policy = policy;
  if (p === "sniper") {
    if (v.remaining > v.tuning.sniperSeconds) return { move: null, readBits: 0 };
    p = "deny";
  }
  if (POLICY_INFO[p].othersRules && !v.informed) p = "greedy";
  // The candidate moves: every one-cell write, or a random sample of them.
  const all = sp.cells * (sp.S - 1);
  const pickMove = (k: number): Move => { const cell = Math.floor(k / (sp.S - 1)), value = (o.grid.sym[cell] + 1 + k % (sp.S - 1)) % sp.S; return { cell, layer: 0, value }; };
  const ks = econ.candidates >= all ? Array.from({ length: all }, (_, k) => k) : Array.from({ length: econ.candidates }, () => rng.int(all));
  const others = (pay: readonly number[]) => (sum(pay) - pay[i]) / Math.max(1, P - 1);
  let best: Decision["after"] | undefined, bestMove: Move | null = null, bestKey = -Infinity, bestOrd: Ordinal = o.ords[i];
  for (const k of ks) {
    const move = pickMove(k), grid = apply(o.grid, move);
    if (p === "greedy" || p === "clause") {
      // Its own rule only, compared as ordinals (what a program holding the card's source does).
      const ord = rules[i].score(grid);
      if (compareOrdinals(ord, bestOrd) > 0) { bestOrd = ord; bestMove = move; best = undefined; }
      continue;
    }
    const s = score(grid), dOwn = s.bits[i] - o.bits[i], dPay = s.pay[i] - o.pay[i];
    let key = -Infinity;
    if (p === "considerate") {
      if (dOwn > EPS && s.bits.every((b, j) => j === i || b >= o.bits[j] - EPS)) key = dOwn;
    } else if (p === "payoff") {
      if (dPay > EPS) key = dPay;
    } else if (p === "hoarder") {
      const cost = changeCost(writeWork(sp, econ, o.grid.sym[move.cell], move.value, sum(o.bits), sum(s.bits)));
      if (dPay >= v.tuning.hoarderThreshold * cost) key = dPay / cost;
    } else if (p === "cooperator") {
      const dAll = sum(s.pay) - sum(o.pay);
      if (dAll > EPS && dPay >= -EPS) key = dAll;
    } else if (p === "defender") {
      // Own bits first (lexicographically ahead); else the others' bits, own unchanged.
      const dOthers = sum(s.bits) - s.bits[i] - (sum(o.bits) - o.bits[i]);
      if (dOwn > EPS) key = 1e6 + dPay;
      else if (Math.abs(dOwn) <= EPS && dOthers > EPS && o.bits[i] > EPS) key = dOthers;
    } else if (p === "deny") {
      const d = dPay - (others(s.pay) - others(o.pay));
      if (d > EPS) key = d;
    }
    if (key > bestKey) { bestKey = key; best = s; bestMove = move; }
  }
  if (!bestMove) return { move: null, readBits: fullRead };
  if (policy === "clause") {
    // The commit clause (engine lib/world.ts commitRaises): own bits exact, the others' sum with each value's noise.
    const after = score(apply(o.grid, bestMove));
    const seen = (bits: readonly number[], grid: GridValue) => { const peers = sum(bits) - bits[i] + econ.peerNoiseBits * valueNoise(grid); return peers > 0 ? bits[i] * peers : 0; };
    if (!(seen(after.bits, after.grid) - seen(o.bits, o.grid) > 0)) return { move: null, readBits: fullRead };
    return { move: bestMove, readBits: fullRead, after };
  }
  return { move: bestMove, readBits: fullRead, after: best ?? score(apply(o.grid, bestMove)) };
}

// ------------------------------------------------------------------------------------------------
// one game
// ------------------------------------------------------------------------------------------------

export interface GameResult {
  /** Each god's total payoff at the end, and averaged over the game's time. */
  readonly final: number[];
  readonly average: number[];
  /** What decides the game under econ.scoring. */
  readonly score: number[];
  readonly acts: number[];
  readonly changes: number[];
  readonly skips: number[];
  /** Changes the debt bound refused. */
  readonly refused: number[];
  readonly readSpent: number[];
  readonly changeSpent: number[];
  /** Salience bits each god's changes destroyed, and created. */
  readonly destroyed: number[];
  readonly created: number[];
  /** Each god's mean own bits per object at the end. */
  readonly ownBits: number[];
  readonly opportunities: number;
  /** Opportunities nobody could take (no agent with energy and off the cap). */
  readonly idle: number;
  readonly objects: number;
}

/** A value's disclosure noise: a fixed standard normal per board (the engine keys it by the game and the value). */
export function valueNoise(g: GridValue): number {
  let h = 2166136261;
  for (const s of g.sym) h = Math.imul(h ^ (s + 1), 16777619) >>> 0;
  const r = (k: number) => { let t = (h + k * 0x6d2b79f5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296; };
  return Math.sqrt(-2 * Math.log(r(1))) * Math.cos(2 * Math.PI * r(2));
}

/** Uniform in (0, 1) from an Rng. */
const uniform = (rng: Rng) => (rng.int(2 ** 30) + 0.5) / 2 ** 30;

export function playGame(rules: readonly Rule[], policies: readonly Policy[], sp: Space, econ: Econ, seed: Rng, tuning: Tuning = DEFAULT_TUNING): GameResult {
  const P = rules.length, T = econ.durationSeconds, u = () => uniform(seed);
  const zero = () => new Array<number>(P).fill(0);
  const keyOf = (g: GridValue) => g.sym.join("");
  const taken = new Set<string>();
  const objects: Obj[] = [];
  const totals = zero();
  const spawn = () => {
    let grid = sp.spawn(seed);
    while (taken.has(keyOf(grid))) grid = sp.spawn(seed);
    taken.add(keyOf(grid));
    const ords = rules.map(r => r.score(grid)), bits = ords.map((x, j) => rules[j].bits(x)), pay = payoffs(bits, econ.aggregate);
    objects.push({ grid, ords, bits, pay });
    pay.forEach((x, g) => (totals[g] += x));
  };
  for (let k = 0; k < econ.startingObjectCount; k++) spawn();
  const income = econ.powerPerSecond / econ.agentsPerGod, cap = energyCapacity(income, econ.capacitySeconds);
  const agents = Array.from({ length: P * econ.agentsPerGod }, (_, a) => ({ god: a % P, account: { balance: 0, settledWorldSeconds: 0 } as AgentAccount, last: undefined as number | undefined }));
  // When each god's agents exist: once its saved power (and starting energy) has paid the policy's summon price.
  const bornAt = policies.map(p => Math.max(0, ((tuning.summonBits?.[p] ?? 0) - (tuning.startingEnergy ?? 0)) / Math.max(1e-9, econ.powerPerSecond)));
  for (const a of agents) a.account = { balance: 0, settledWorldSeconds: Math.min(T, bornAt[a.god]) };
  const settle = (a: typeof agents[number], t: number) => {
    if (t <= a.account.settledWorldSeconds) return;
    a.account = settleAgentEnergy(a.account, t, income, cap);
  };
  const r: GameResult = { final: zero(), average: zero(), score: zero(), acts: zero(), changes: zero(), skips: zero(), refused: zero(), readSpent: zero(), changeSpent: zero(),
    destroyed: zero(), created: zero(), ownBits: zero(), opportunities: 0, idle: 0, objects: 0 };
  const integral = zero();
  let nextSpawn = econ.spawnRateHz > 0 ? poissonIntervalSeconds(econ.spawnRateHz, u()) : Infinity, last = 0;
  const count = Math.floor(econ.interactionRateHz * T);
  for (let k = 1; k <= count; k++) {
    const t = k / econ.interactionRateHz;
    for (let g = 0; g < P; g++) integral[g] += totals[g] * (t - last);
    last = t;
    while (nextSpawn <= t) { spawn(); nextSpawn += poissonIntervalSeconds(econ.spawnRateHz, u()); }
    (r as { opportunities: number }).opportunities++;
    if (!objects.length) continue;
    const o = objects[Math.min(objects.length - 1, Math.floor(u() * objects.length))];
    for (const a of agents) settle(a, t);
    const gap = econ.agentCapHz ? 1 / econ.agentCapHz - 1e-9 : 0;
    const agent = pickByEnergy(agents.filter(a => a.account.balance > 0 && (a.last === undefined || t - a.last >= gap)), a => a.account.balance, u);
    if (!agent) { (r as { idle: number }).idle++; continue; }
    agent.last = t;
    const g = agent.god;
    const d = decide(policies[g], { god: g, object: o, rules, sp, econ, tuning, informed: t >= econ.learnSeconds, remaining: T - t, rng: seed });
    const read = (d.readBits + (econ.offerReads ? offerReadBits(objects.length) : 0)) / econ.kappa;
    r.acts[g]++; r.readSpent[g] += read;
    if (!d.move || !d.after || taken.has(keyOf(d.after.grid))) {
      // A skip, or a collision with another object's value: reads only.
      if (!d.move) r.skips[g]++;
      agent.account = chargeAct(agent.account, read);
      continue;
    }
    const sBefore = sum(o.bits), sAfter = sum(d.after.bits);
    const noisy = econ.erasure > 0 && econ.erasureNoiseBits > 0;
    const change = changeCost(writeWork(sp, econ, o.grid.sym[d.move.cell], d.move.value,
      sBefore + (noisy ? econ.erasureNoiseBits * valueNoise(o.grid) : 0), sAfter + (noisy ? econ.erasureNoiseBits * valueNoise(d.after.grid) : 0)));
    if (econ.debtBound && Number.isFinite(cap) && !affordable(agent.account.balance, read + change, actCredit(cap))) {
      // Refused (§7.2): the agent would owe more than it can hold. It pays its reads, like any change that does not commit.
      r.refused[g]++;
      agent.account = chargeAct(agent.account, read);
      continue;
    }
    agent.account = chargeAct(agent.account, read + change);
    r.changes[g]++; r.changeSpent[g] += change;
    if (sAfter < sBefore) r.destroyed[g] += sBefore - sAfter; else r.created[g] += sAfter - sBefore;
    taken.delete(keyOf(o.grid)); taken.add(keyOf(d.after.grid));
    for (let j = 0; j < P; j++) totals[j] += d.after.pay[j] - o.pay[j];
    o.grid = d.after.grid; o.ords = d.after.ords; o.bits = d.after.bits; o.pay = d.after.pay;
  }
  for (let g = 0; g < P; g++) integral[g] += totals[g] * (T - last);
  for (let g = 0; g < P; g++) {
    // Recomputed from the objects (the running totals only drive the average).
    r.final[g] = sum(objects.map(o => o.pay[g]));
    r.average[g] = integral[g] / T;
    r.score[g] = econ.scoring === "final" ? r.final[g] : r.average[g];
    r.ownBits[g] = sum(objects.map(o => o.bits[g])) / Math.max(1, objects.length);
  }
  (r as { objects: number }).objects = objects.length;
  return r;
}

// ------------------------------------------------------------------------------------------------
// tables and the policy game
// ------------------------------------------------------------------------------------------------

export interface TableStats {
  readonly policies: readonly Policy[];
  readonly games: number;
  /** Per seat: mean score, win share (ties split), and the score as a share of the table's mean score (1 = average). */
  readonly score: number[];
  readonly win: number[];
  readonly relative: number[];
  /** Mean rank (1 = first; equal scores share the mean of their places). */
  readonly rank: number[];
  /** Σ over gods of the mean score. */
  readonly welfare: number;
  readonly actsPerSecond: number[];
  readonly skipShare: number[];
  readonly readShare: number;
  readonly destroyedPerChange: number[];
  readonly ownBits: number[];
  readonly idleShare: number;
}

/** Win shares of one game: 1 to the top score, split between equal tops (relative 1e-9, as game-core rankTotals). */
export function winShares(score: readonly number[]): number[] {
  const top = Math.max(...score), tops = score.map(x => Math.abs(x - top) <= 1e-9 * Math.max(1, Math.abs(top)));
  const n = tops.filter(Boolean).length;
  return tops.map(t => (t ? 1 / n : 0));
}

/** Ranks of one game: 1 for the top score; equal scores (relative 1e-9) share the mean of their places. */
export function ranksOf(score: readonly number[]): number[] {
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return score.map(x => score.filter(y => y > x && !same(x, y)).length + (score.filter(y => same(x, y)).length + 1) / 2);
}

export function summarise(policies: readonly Policy[], results: readonly GameResult[], durationSeconds: number): TableStats {
  const P = policies.length, n = results.length, mean = (f: (r: GameResult) => number) => sum(results.map(f)) / n;
  const per = (f: (r: GameResult, g: number) => number) => Array.from({ length: P }, (_, g) => mean(r => f(r, g)));
  const score = per((r, g) => r.score[g]), welfare = sum(score);
  return {
    policies, games: n, score, welfare,
    win: per((r, g) => winShares(r.score)[g]),
    relative: per((r, g) => { const m = sum(r.score) / P; return m > 0 ? r.score[g] / m : 1; }),
    rank: per((r, g) => ranksOf(r.score)[g]),
    actsPerSecond: per((r, g) => r.acts[g] / durationSeconds),
    skipShare: per((r, g) => (r.acts[g] ? r.skips[g] / r.acts[g] : 0)),
    readShare: mean(r => sum(r.readSpent) / Math.max(1e-9, sum(r.readSpent) + sum(r.changeSpent))),
    destroyedPerChange: per((r, g) => (r.changes[g] ? r.destroyed[g] / r.changes[g] : 0)),
    ownBits: per((r, g) => r.ownBits[g]),
    idleShare: mean(r => r.idle / Math.max(1, r.opportunities)),
  };
}

/** A profile of the symmetric policy game: how many of the P gods play each policy (a multiset), as a sorted key. */
export const profileKey = (policies: readonly Policy[]) => [...policies].sort().join("+");

/** Every multiset of `players` policies from `set`. */
export function profiles(set: readonly Policy[], players: number): Policy[][] {
  const out: Policy[][] = [];
  const rec = (from: number, acc: Policy[]) => {
    if (acc.length === players) { out.push(acc); return; }
    for (let k = from; k < set.length; k++) rec(k, [...acc, set[k]]);
  };
  rec(0, []);
  return out;
}

/** What one god playing `policy` gets in a profile, by `metric` (the mean over the seats that play it). */
export type Metric = "win" | "score" | "relative" | "rank";
export function valueIn(stats: TableStats, policy: Policy, metric: Metric): number {
  const seats = stats.policies.map((p, g) => (p === policy ? g : -1)).filter(g => g >= 0);
  return sum(seats.map(g => stats[metric][g])) / seats.length;
}

export interface Deviation { readonly from: Policy; readonly to: Policy; readonly gain: number }
/**
 * The pure equilibria of the symmetric policy game: a profile where no god gains more than `tolerance` (in the
 * metric's own units) by switching to another policy of `set`, the others staying. `table` maps profileKey → stats.
 * Returns every profile with its best deviation (gain ≤ tolerance ⇒ an equilibrium).
 */
export function equilibria(set: readonly Policy[], players: number, table: ReadonlyMap<string, TableStats>, metric: Metric, tolerance: number) {
  return profiles(set, players).map(profile => {
    const here = table.get(profileKey(profile))!;
    let best: Deviation | null = null;
    for (const from of new Set(profile)) for (const to of set) {
      if (to === from) continue;
      const moved = [...profile]; moved[moved.indexOf(from)] = to;
      const there = table.get(profileKey(moved));
      if (!there) continue;
      const gain = valueIn(there, to, metric) - valueIn(here, from, metric);
      if (!best || gain > best.gain) best = { from, to, gain };
    }
    return { profile, stats: here, best, equilibrium: !best || best.gain <= tolerance };
  });
}
