import { payoffs, random, sampleDomain } from "./model.ts";
import type { ObjectValue, Manifest, Deity } from "./model.ts";

export const SCREEN_VERSION = "bounded-payoff-screen-v1";
export const MARGIN = 1e-5;
const SAMPLE_COUNT = 128;
export interface State {
  object: ObjectValue;
  values: number[];
  payoffs: number[];
}
export interface Witness {
  before: State;
  after: State;
  deltaValues: number[];
  deltaPayoffs: number[];
  winners: number[];
  losers: number[];
}
export interface PairWitness {
  pair: [number, number];
  cooperation: Witness;
  conflict: Witness;
  candidateTransitions: number;
  cooperativeTransitions: number;
  conflictingTransitions: number;
}
export interface Baseline {
  name: string;
  output: ObjectValue;
  payoffs: number[];
  gainOverIdentity: number[];
}
export interface ScreeningReport {
  screenVersion: typeof SCREEN_VERSION;
  accepted: boolean;
  rejections: string[];
  warnings: string[];
  candidateCount: number;
  /** Int covers every reachable residue; string is a bounded search, never a proof. */
  coverage: "exhaustive-residues" | "bounded-string-candidates";
  pairs: PairWitness[];
  coalitions: Witness[];
  commonValueMaximizers: ObjectValue[];
  commonPayoffMaximizers: ObjectValue[];
  distribution: {
    name: "uniform-integers" | "uniform-capped-ASCII-ranks";
    sampleCount: number;
    meanValues: number[];
    identityPayoffs: number[];
    nearZeroFraction: number[];
    nearOneFraction: number[];
    nearZeroPayoffFraction: number[];
    valueRanges: [number, number][];
    payoffRanges: [number, number][];
    firstPairTiedValueFraction: number;
    localMoves: TransitionStats;
    cleanupMoves: TransitionStats;
    /** First god's constant to each other god's best constant, weighted by samples. */
    constantSwitches: TransitionStats;
  };
  constants: Baseline[];
}
export interface TransitionStats {
  count: number;
  cooperativePairFraction: number;
  conflictingPairFraction: number;
  mixedCoalitionFraction: number;
}

function state(gods: readonly Deity[], object: ObjectValue): State {
  const values = gods.map(g => g.evaluate(object));
  return { object, values, payoffs: payoffs(values) };
}
function transition(before: State, after: State): Witness {
  const deltaPayoffs = after.payoffs.map((x, i) => x - before.payoffs[i]);
  return {
    before, after, deltaValues: after.values.map((x, i) => x - before.values[i]),
    deltaPayoffs,
    winners: deltaPayoffs.flatMap((d, i) => d > MARGIN ? [i] : []),
    losers: deltaPayoffs.flatMap((d, i) => d < -MARGIN ? [i] : []),
  };
}
function statistics(transitions: Witness[]): TransitionStats {
  const n = transitions.length;
  return {
    count: n,
    cooperativePairFraction: n ? transitions.filter(w => w.deltaPayoffs[0] > MARGIN && w.deltaPayoffs[1] > MARGIN).length / n : 0,
    conflictingPairFraction: n ? transitions.filter(w =>
      (w.deltaPayoffs[0] > MARGIN && w.deltaPayoffs[1] < -MARGIN) ||
      (w.deltaPayoffs[1] > MARGIN && w.deltaPayoffs[0] < -MARGIN)).length / n : 0,
    mixedCoalitionFraction: n ? transitions.filter(w => w.winners.length >= 2 && w.losers.length >= 1).length / n : 0,
  };
}
function mean(states: State[], key: "values" | "payoffs"): number[] {
  return states[0][key].map((_, i) => states.reduce((sum, s) => sum + s[key][i], 0) / states.length);
}
function candidates(manifest: Manifest): ObjectValue[] {
  const d = manifest.domain;
  const first = manifest.preferences[0];
  if (d.objectType === "Int" && first.kind === "cyclic-well") {
    // Prefer readable representatives near zero when possible, but honor custom bounds.
    const start = Math.max(d.intMin, Math.min(0, d.intMax - first.period + 1));
    return Array.from({ length: first.period }, (_, i) => start + i);
  }
  if (d.objectType !== "string" || first.kind !== "edit-well") throw new Error("Mismatched manifest");
  const second = manifest.preferences[1];
  if (second.kind !== "edit-well") throw new Error("Mismatched manifest");
  const a = first.prototype[0], b = second.prototype[0];
  // Deliberately fixed offline search bound. Live evaluation never enumerates strings.
  let layer = [""];
  const result = [""];
  for (let length = 1; length <= Math.min(6, d.stringMaxLength); length++) {
    layer = layer.flatMap(s => [s + a, s + b]);
    result.push(...layer);
  }
  result.push("\0", "\x7f", "\0".repeat(d.stringMaxLength));
  return [...new Set(result)];
}

/** Offline only. Fixed bounded search, separate from the hot evaluator path. */
export function screen(manifest: Manifest, gods: readonly Deity[]): ScreeningReport {
  const pool = candidates(manifest).map(x => state(gods, x));
  const rejections: string[] = [];
  const warnings = [
    "Legal constant-output agents remain strong; regional payoff conflict does not imply durable regional control.",
    "Margins are object-payoff deltas before private program costs, execution frequency, lifetime or energy.",
    "Seeded sampling is diagnostic, not a cryptographic spawn source or a proof of strategy quality.",
  ];
  const pairs: PairWitness[] = [];
  const coalitions = new Map<string, Witness>();
  for (let i = 0; i < gods.length; i++) {
    for (let j = i + 1; j < gods.length; j++) {
      if (pool.every(s => Math.abs(s.values[i] - s.values[j]) <= MARGIN)) rejections.push(`Indistinguishable gods ${i},${j}`);
      let cooperation: Witness | undefined;
      let conflict: Witness | undefined;
      let cooperativeTransitions = 0;
      let conflictingTransitions = 0;
      for (const before of pool) {
        for (const after of pool) {
          const di = after.payoffs[i] - before.payoffs[i];
          const dj = after.payoffs[j] - before.payoffs[j];
          if (di > MARGIN && dj > MARGIN) {
            cooperativeTransitions++;
            if (!cooperation) cooperation = transition(before, after);
          }
          if ((di > MARGIN && dj < -MARGIN) || (dj > MARGIN && di < -MARGIN)) {
            conflictingTransitions++;
            if (!conflict) conflict = transition(before, after);
          }
        }
      }
      if (cooperation && conflict) pairs.push({
        pair: [i, j], cooperation, conflict, candidateTransitions: pool.length ** 2,
        cooperativeTransitions, conflictingTransitions,
      });
    }
  }
  // Collect coalition witnesses independently of which pair appears first.
  for (const before of pool) {
    for (const after of pool) {
      const w = transition(before, after);
      if (w.winners.length >= 2 && w.losers.length) {
        const key = w.winners.join(",");
        if (!coalitions.has(key)) coalitions.set(key, w);
      }
    }
  }
  if (!pairs.some(p => p.pair[0] === 0 && p.pair[1] === 1)) rejections.push("No same-pair cooperation and conflict for gods 0,1");
  if (coalitions.size < 2) rejections.push("Fewer than two winning coalitions with a harmed outsider");
  const commonMaxima = (key: "values" | "payoffs") => {
    const maxima = gods.map((_, i) => Math.max(...pool.map(s => s[key][i])));
    return pool.filter(s => maxima.every((m, i) => Math.abs(m - s[key][i]) <= MARGIN)).map(s => s.object);
  };
  const commonValueMaximizers = commonMaxima("values");
  const commonPayoffMaximizers = commonMaxima("payoffs");
  if (commonValueMaximizers.length) rejections.push("Candidate common value optimum");
  if (commonPayoffMaximizers.length) rejections.push("Candidate common payoff optimum");
  const below = random((manifest.seed ^ 0xa511e9b3) >>> 0);
  const samples = Array.from({ length: SAMPLE_COUNT }, () => state(gods, sampleDomain(manifest.domain, below)));
  const identityPayoffs = mean(samples, "payoffs");
  const best = gods.map((_, i) => pool.reduce((a, b) => a.payoffs[i] >= b.payoffs[i] ? a : b));
  const constants: Baseline[] = best.map((s, i) => ({
    name: `best-screened-constant-for-god-${i + 1}`,
    output: s.object, payoffs: s.payoffs,
    gainOverIdentity: s.payoffs.map((p, j) => p - identityPayoffs[j]),
  }));
  const localMoves: Witness[] = [];
  const cleanupMoves: Witness[] = [];
  const constantSwitches: Witness[] = [];
  for (const s of samples) {
    const d = manifest.domain;
    const next = d.objectType === "Int"
      ? ((s.object as number) === d.intMax ? d.intMin : (s.object as number) + 1)
      : ((s.object as string).length ? (s.object as string).slice(1) : "\0");
    localMoves.push(transition(s, state(gods, next)));
    // A legal constant repair reaches a contested state from every spawn object.
    cleanupMoves.push(transition(s, best[2]));
    for (let i = 1; i < best.length; i++) constantSwitches.push(transition(best[0], best[i]));
  }
  const distribution: ScreeningReport["distribution"] = {
    name: manifest.domain.objectType === "Int" ? "uniform-integers" : "uniform-capped-ASCII-ranks",
    sampleCount: SAMPLE_COUNT, meanValues: mean(samples, "values"), identityPayoffs,
    nearZeroFraction: gods.map((_, i) => samples.filter(s => s.values[i] < 1e-6).length / SAMPLE_COUNT),
    nearOneFraction: gods.map((_, i) => samples.filter(s => s.values[i] > 1 - 1e-6).length / SAMPLE_COUNT),
    nearZeroPayoffFraction: gods.map((_, i) => samples.filter(s => s.payoffs[i] < 1e-6).length / SAMPLE_COUNT),
    valueRanges: gods.map((_, i) => [Math.min(...samples.map(s => s.values[i])), Math.max(...samples.map(s => s.values[i]))]),
    payoffRanges: gods.map((_, i) => [Math.min(...samples.map(s => s.payoffs[i])), Math.max(...samples.map(s => s.payoffs[i]))]),
    firstPairTiedValueFraction: samples.filter(s => Math.abs(s.values[0] - s.values[1]) <= MARGIN).length / SAMPLE_COUNT,
    localMoves: statistics(localMoves), cleanupMoves: statistics(cleanupMoves),
    constantSwitches: statistics(constantSwitches),
  };
  if (distribution.nearZeroFraction.some(p => p > 0.9)) warnings.push("Spawn values are near-zero for over 90% of samples; payoff saturation makes cleanup dominant.");
  if (distribution.nearZeroPayoffFraction.some(p => p > 0.9)) warnings.push("Spawn payoffs are below 1e-6 for over 90% of samples; payoff saturation is present even if values exceed that threshold.");
  if (distribution.nearOneFraction.some(p => p > 0.9)) warnings.push("Spawn values are near-one for over 90% of samples.");
  if (distribution.localMoves.conflictingPairFraction === 0) warnings.push("No local-move payoff conflict seen under the spawn distribution; do not claim common local political regions.");
  if (manifest.domain.objectType === "string") {
    warnings.push("ASCII-rank spawning strongly favors the maximum length and garbage cleanup; string optima screening is bounded, not exhaustive.");
  } else {
    warnings.push("Cyclic integer preferences ignore magnitude: period-separated integers tie exactly.");
  }
  return {
    screenVersion: SCREEN_VERSION, accepted: rejections.length === 0, rejections, warnings,
    candidateCount: pool.length,
    coverage: manifest.domain.objectType === "Int" ? "exhaustive-residues" : "bounded-string-candidates",
    pairs, coalitions: [...coalitions.values()], commonValueMaximizers, commonPayoffMaximizers,
    distribution, constants,
  };
}
