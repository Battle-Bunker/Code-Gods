/** The committed artefact per rule (spec §7.6) and the run-time lookup (§7.7). */
import { canonicalJson, hashHex, levelOf, objectLadder, ruleLayers, scoreFromWire, tieBreakerId, scoreToWire, Qn, type ObjectType, type RuleFamily, type Score, type TieBreaker, type Variant } from "@workspace/v2-core";
import { estimate, ruleKey, DEFAULT_CONFIG, type Estimate, type ValuationConfig } from "./estimate.ts";
import { evalCurve, fit, type Curve } from "./fit.ts";

export interface ArtefactRung {
  readonly score: readonly (string | null)[] | null;
  readonly label: string;
  /** The layer the rung belongs to (−1: the bottom rung). */
  readonly layer: number;
  /** On a joint ladder: the main level the rung sits at. */
  readonly main?: number;
  readonly bits: number;
  readonly error: number;
  readonly empty?: true;
}

export interface Artefact {
  /** 3: the dealable cap (coordinator's call (g)); 2: layered ladders (tieBreaker, rungs[].layer, primarySense). */
  readonly schema: 3;
  readonly ruleKey: string;
  readonly objectType: string;
  readonly objectTypeVersion: number;
  readonly variant: string;
  readonly variantHash: string;
  readonly family: string;
  readonly params: unknown;
  /** The dealt tie-breaker this artefact calibrates with the main layer ("none": the main layer alone). */
  readonly tieBreaker: string;
  readonly seed: string;
  readonly config: ValuationConfig;
  readonly status: Estimate["status"];
  readonly reasons: readonly string[];
  /** The rungs calibrated: the rule's ladder, or a prefix of it when its top rungs could not be reached (see reasons). */
  readonly rungs: readonly ArtefactRung[];
  /**
   * The dealt ladder's top (coordinator's call (g)): the last rung through which every rung met the error target. A
   * line above it scores as the cap, so a rule that misses only its rarest rungs is still dealt, capped.
   */
  readonly cap: number;
  /** Dealt: not too coarse or unreachable, and at least MIN_DEALABLE_RUNGS converged rungs up to the cap. */
  readonly dealable: boolean;
  /** The primary layer's sense: a curve's argument t is −score[0] for "min", score[0] for "max". */
  readonly primarySense: "min" | "max";
  readonly curve: (Curve & { readonly snapped: boolean }) | null;
  readonly diagnostics: {
    readonly reversibility: number;
    readonly mixingSteps: number;
    readonly steps: number;
    readonly samplesPerChain: number;
    readonly distinctLevels: readonly (number | null)[];
    /** Per rung, a state from the chain on that rung's upper set (wire). */
    readonly examples: readonly string[];
    readonly split: readonly number[];
    readonly direct: readonly (number | null)[];
    readonly levelMatrix: readonly (readonly number[])[];
    /** Per rung: [drift of the chain's rate into the next rung between the halves of its samples, in standard errors]. */
    readonly drift: readonly (readonly [number, number | null] | null)[];
    /** Every rung up to this one is within the error target. */
    readonly convergedThrough: number;
  };
  readonly contentHash: string;
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** The head of docs/engine-v2/too-hard-backlog.md: its rows are the rules that are not dealable. */
export const BACKLOG_HEAD = "# Too-hard backlog (spec §7.5)\n\nRules that are not dealt: too coarse, unreachable, or with fewer than " +
  "6 rungs converged to the error target (coordinator's call (g); a rule that misses only its rarest rungs is dealt with " +
  "its ladder capped instead). `pnpm --filter @workspace/v2-valuation calibrate -- --write` regenerates the rows of " +
  "the rules it calibrates; `recap` regenerates the whole file from the committed artefacts.\n\n" +
  "| Family | Params | Tie-breaker | Variant | Status | Why |\n|---|---|---|---|---|---|\n";

/** A rule is too hard (backlogged, never dealt) when fewer rungs than this converge (coordinator's call (g)). */
export const MIN_DEALABLE_RUNGS = 6;

/**
 * The cap and whether the rule is dealt (call (g)), from an artefact's stored figures alone: the last rung r such that
 * every non-empty rung 1 … r has a finite value within max(targetRelError · bits, absFloorBits); dealable when the rule
 * is neither too coarse nor unreachable and at least MIN_DEALABLE_RUNGS non-empty rungs lie at or below the cap.
 */
export function capOf(a: { readonly status: string; readonly rungs: readonly { bits: number | null; error: number | null; empty?: true }[]; readonly config: ValuationConfig }): { cap: number; dealable: boolean; converged: number } {
  let cap = 0, converged = 0;
  for (let i = 1; i < a.rungs.length; i++) {
    const r = a.rungs[i]!;
    if (r.empty) continue;   // passes, but the cap only ever sits on a converged rung
    const { bits, error } = r;
    if (bits === null || error === null || !Number.isFinite(bits) || !Number.isFinite(error)) break;
    if (error > Math.max(a.config.targetRelError * bits, a.config.absFloorBits)) break;
    cap = i;
    converged++;
  }
  const dealable = a.status !== "too-coarse" && a.status !== "unreachable" && converged >= MIN_DEALABLE_RUNGS;
  return { cap, dealable, converged };
}

export function contentHash(a: Omit<Artefact, "contentHash">): string {
  return hashHex(canonicalJson(a));
}

export function calibrate<S, P>(type: ObjectType<S>, variant: Variant, family: RuleFamily<S, P>, params: P,
  options: { seed?: string; config?: Partial<ValuationConfig>; tieBreaker?: TieBreaker } = {}): { artefact: Artefact; estimate: Estimate } {
  const seed = options.seed ?? "v2";
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const tieBreaker = tieBreakerId(family, options.tieBreaker);
  const tb = tieBreaker === "none" ? null : tieBreaker;
  const est = estimate({ type, variant, family, params, seed, config, tieBreaker: tb });
  const ladder = objectLadder(type, family, params, variant, tb).slice(0, Math.max(est.rungs.length, 1));
  const rungs: ArtefactRung[] = est.rungs.map((r, i) => ({
    score: scoreToWire(ladder[i]!.score), label: r.label, layer: ladder[i]!.layer, ...(ladder[i]!.main !== undefined ? { main: ladder[i]!.main } : {}), bits: r4(r.bits), error: r4(r.error), ...(r.empty ? { empty: true as const } : {}),
  }));
  let curve: Artefact["curve"] = null;
  // Curves are fitted to the primary layer's rungs (§7.4), on single-line objects.
  const primary = ruleLayers(family, tb)[0]!;
  if (est.status === "converged" && type.sites(type.origin(variant), variant) === 1) {
    const points = est.rungs.flatMap((r, i) => {
      const s = ladder[i]!.score;
      if (ladder[i]!.layer !== 0 || r.empty || s === null || s[0] === null) return [];
      const t = primary.sense === "min" ? -Qn.toNumber(s[0]!) : Qn.toNumber(s[0]!);
      return [{ t, v: r.bits, err: Math.max(r.error, config.absFloorBits) }];
    });
    const f = fit(primary.measure === "distance" ? "distance" : "count", points);
    if (f && f.accepted) curve = { ...f.curve, snapped: f.snapped };
  }
  const { cap, dealable } = capOf({ status: est.status, rungs, config });
  const body: Omit<Artefact, "contentHash"> = {
    schema: 3, ruleKey: ruleKey(type as ObjectType<unknown>, variant, family.id, params, tieBreaker), objectType: type.id, objectTypeVersion: type.version,
    variant: variant.id, variantHash: hashHex(canonicalJson(variant)), family: family.id, params, tieBreaker, seed, config,
    status: est.status, reasons: est.reasons, rungs, cap, dealable, primarySense: primary.sense, curve,
    diagnostics: {
      reversibility: r4(est.reversibility), mixingSteps: r4(est.mixingSteps), steps: est.steps, samplesPerChain: est.samplesPerChain,
      distinctLevels: est.distinctLevels, examples: est.examples,
      split: est.rungs.map(r => r4(r.split)), direct: est.rungs.map(r => (r.direct === null ? null : r4(r.direct))),
      levelMatrix: est.levelMatrix,
      convergedThrough: est.convergedThrough,
      drift: est.drift.map(d => (d === null ? null : [r4(d[0]), Number.isFinite(d[1]) ? r4(d[1]) : null] as const)),
    },
  };
  return { artefact: { ...body, contentHash: contentHash(body) }, estimate: est };
}

/** A score's bits (spec §7.7): the rung's value, or the snapped curve between this rung and the next. */
export function bitsFor(a: Artefact, score: Score): number {
  if (a.rungs.length === 0) return 0;   // an unreachable rule: never dealt (§7.5), worth nothing if asked
  const ladder = a.rungs.map(r => ({ score: scoreFromWire(r.score), label: r.label, layer: r.layer, ...(r.main !== undefined ? { main: r.main } : {}) }));
  // Above the cap a line scores as the cap (call (g)): those rungs' values did not converge.
  const level = Math.min(levelOf(score, ladder), a.cap);
  const base = a.rungs[level]!.bits;
  // The curve interpolates between main rungs, and only on a one-layer ladder: on a joint ladder the tie-breaker's rungs
  // sit between main rungs, and a value read off the main curve alone would not follow the lexicographic order.
  if (a.rungs.some(r => r.layer === 1)) return base;
  if (score === null || score[0] === null || level === 0 || level >= a.cap || a.rungs[level + 1]?.layer !== 0 || !a.curve?.snapped) return base;
  const t = a.primarySense === "min" ? -Qn.toNumber(score[0]!) : Qn.toNumber(score[0]!);
  const next = a.rungs[level + 1]!.bits;
  return Math.min(Math.max(evalCurve(a.curve, t), base), next);
}

export { evalCurve };
