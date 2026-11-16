/**
 * `rule.fit` (v1's fit_utility_mixture, restored under owner-decisions call 36), the part that needs no database: the
 * guard, the observations from the caller's view of the log, each candidate's bits at them, and the fit
 * (lib/v2-agents inference.ts). Call 36: offered only on lines with disclosure noise σ ≥ 8 (variance ≥ 64), where the
 * collapse check found identification costly (test 5: a median of 1,284 probes at σ 8); refused on grids until grid
 * test 2 passes, and refused at lower noise, where the others' rules would be read off a few moves.
 */
import { findVariant } from "@workspace/v2-valuation";
import { fitRules, type FitHint } from "@workspace/v2-agents/pure";
import { dealablePool, familyOf } from "./deal.ts";
import { presetOf } from "./presets.ts";
import { decode, valueOf } from "./world.ts";

/** The least disclosure noise variance (bits²) the fit is offered at: σ 8 (call 36). */
export const FIT_MIN_NOISE_VARIANCE = 64;
/** The most observed states a fit reads (the newest distinct ones): bounds the action's work. */
export const FIT_MAX_OBSERVATIONS = 400;

export interface FitContext { variant: string; preset: string; noiseVariance: number; others: number; ownFamily: string | null; objects: number }
export interface FitRow { objectId: string; state: string | null; others: number | null }

/** Why the fit is refused in this game, or null when it is offered. */
export function fitRefusal(c: Pick<FitContext, "variant" | "noiseVariance">): string | null {
  if (findVariant(c.variant).type.id !== "line") return "Fitting the others' rules is offered on lines only: on grids it would find them too easily.";
  if (c.noiseVariance < FIT_MIN_NOISE_VARIANCE) return "Fitting the others' rules is offered only in games whose disclosure noise is at least ±8 bits.";
  return null;
}

/** The newest distinct (object, state) readings with a disclosed others' sum, newest first (rows arrive newest first). */
export function observations(rows: readonly FitRow[], max = FIT_MAX_OBSERVATIONS): { state: string; others: number }[] {
  const seen = new Set<string>(), out: { state: string; others: number }[] = [];
  for (const r of rows) {
    if (out.length >= max) break;
    if (r.state === null || r.others === null) continue;
    const key = `${r.objectId}\u0000${r.state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ state: r.state, others: r.others });
  }
  return out;
}

export interface FitArgs { hints?: FitHint[]; exclude?: string[]; top: number }

export function fitGame(c: FitContext, rows: readonly FitRow[], a: FitArgs) {
  const obs = observations(rows);
  const states = obs.map(o => decode(o.state, c.variant));
  const pool = dealablePool(presetOf(c.preset)).filter(r => r.family !== c.ownFamily);
  const candidates = pool.map(r => ({ family: r.family, params: r.params, tieBreaker: r.tieBreaker, bits: states.map(s => valueOf(s, c.variant, r, c.objects).rarityBits) }));
  const sigma = Math.sqrt(c.noiseVariance);
  const fit = fitRules({ y: obs.map(o => o.others), candidates, others: c.others, sigma, hints: a.hints, exclude: a.exclude, top: a.top });
  const card = (r: { family: string; params: unknown; tieBreaker: string | null }) => familyOf(r.family).card(r.params, r.tieBreaker as never);
  const params = (p: unknown) => (p ?? {}) as Record<string, unknown>;
  return {
    observations: fit.observations, sigma, exact: fit.exact,
    hypotheses: fit.hypotheses.map(h => ({ posterior: h.posterior, rms: h.rms, rules: h.rules.map(r => ({ family: r.family, params: params(r.params), tieBreaker: r.tieBreaker, card: card(r) })) })),
    families: Object.entries(fit.families).map(([family, probability]) => ({ family, probability })).sort((x, y) => y.probability - x.probability),
    spectrum: candidates.map((r, i) => ({ family: r.family, params: params(r.params), tieBreaker: r.tieBreaker, weight: fit.spectrum[i]! }))
      .filter(x => x.weight > 1e-6).sort((x, y) => y.weight - x.weight).slice(0, 10),
  };
}
