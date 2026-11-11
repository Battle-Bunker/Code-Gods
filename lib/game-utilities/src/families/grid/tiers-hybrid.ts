/**
 * The hybrid law of a tiered grid draw (src/tiers/hybrid.ts) wired to the family's own card: the base's exact law from
 * its disjoint units, and the tier read off the host-evaluated card, so the table calibrates exactly what scores.
 * Number-only rules: the law does not depend on the colour set, so it is computed once per (family, size, symbols, params).
 */
import type { ObjectValue } from "@workspace/game-types";
import type { AnalyticSurvival } from "../../analytic.ts";
import { HYBRID_MAX_ERROR_BITS } from "../../analytic.ts";
import type { FamilyContext, Params } from "../../types.ts";
import { hostEval } from "../define.ts";
import { hybridLaw, liveness, type HybridLaw, type Liveness } from "../../tiers/hybrid.ts";
import { baseParams, tierArity, tiersOf, type GridTiers } from "./tiers.ts";
import { gridSpec, symbolCode, type GridSpec } from "./_util.ts";
import { COLOUR_COMPONENTS } from "@workspace/game-types";

/** Bump when the hybrid estimate of a key would change (the splitting, its budget or the kernel). */
export const HYBRID_VERSION = 2;

const stable = (p: unknown): string => (Array.isArray(p) ? `[${p.map(stable).join(",")}]`
  : p && typeof p === "object" ? `{${Object.keys(p).sort().map(k => `${k}:${stable((p as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(p));
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** A board of symbol indices as a wire value in the shape's first colour. */
function wireOf(g: GridSpec, ctx: FamilyContext): (board: Uint8Array) => ObjectValue {
  const letter = (COLOUR_COMPONENTS as Readonly<Record<string, { letters: readonly string[] }>>)[g.colours].letters[0];
  const code = Array.from({ length: g.S }, (_, s) => symbolCode(g, s) + letter), N = g.N;
  void ctx;
  return board => {
    let out = "";
    for (let i = 0; i < board.length; i++) out += (i === 0 ? "" : i % N === 0 ? "/" : ",") + code[board[i]];
    return out;
  };
}

const laws = new Map<string, HybridLaw | null>();
/** The hybrid law of a tiered draw, or null when it has none (an unlocked tier, or a base without disjoint units here). */
export function hybridLawOf<P extends Params>(familyId: string, spec: GridTiers<P>, p: P, ctx: FamilyContext): HybridLaw | null {
  const g = gridSpec(ctx), key = `${familyId}|${g.N}|${g.symbols}|${stable(p)}`;
  let law = laws.get(key);
  if (law !== undefined) return law;
  const tiers = tiersOf(p), base = spec.base(baseParams(p), g);
  if (!base || tiers.some(t => t.compose === "unlock")) { laws.set(key, null); return null; }
  const score = hostEval(familyId, p, ctx), wire = wireOf(g, ctx), arity = tierArity(spec, p);
  law = hybridLaw(base, {
    gate: tiers[0].gate, tierArity: arity, seed: hash32(key),
    tier: board => { const o = score(wire(board)) as readonly number[]; return arity === 1 ? o[o.length - 1] : o.slice(o.length - arity); },
  });
  laws.set(key, law);
  return law;
}

/** The analytic header of a tiered draw: kind "hybrid", levels computed when a table is built. */
export function hybridAnalytic<P extends Params>(familyId: string, spec: GridTiers<P>, p: P, ctx: FamilyContext): AnalyticSurvival | null {
  const g = gridSpec(ctx), base = spec.base(baseParams(p), g);
  if (!base || tiersOf(p).some(t => t.compose === "unlock")) return null;
  const [name, version] = base.id.split("@");
  return {
    id: `${name}-hybrid@${Number(version) * 100 + HYBRID_VERSION}`, kind: "hybrid", maxErrorBits: HYBRID_MAX_ERROR_BITS,
    get levels() { return hybridLawOf(familyId, spec, p, ctx)!.levels; },
  };
}

/** The best board the hybrid law found, as a wire value (null without a law). */
export function hybridBest<P extends Params>(familyId: string, spec: GridTiers<P>, p: P, ctx: FamilyContext): ObjectValue | null {
  const law = hybridLawOf(familyId, spec, p, ctx);
  return law ? wireOf(gridSpec(ctx), ctx)(law.best) : null;
}

/** The liveness check of a tiered draw on this shape (docs/layered-rules-design.md §2.3), or null without a law. */
export function tierLiveness<P extends Params>(familyId: string, spec: GridTiers<P>, p: P, ctx: FamilyContext,
  band?: { readonly min: number; readonly max: number }): Liveness | null {
  const law = hybridLawOf(familyId, spec, p, ctx);
  if (!law) return null;
  const g = gridSpec(ctx), score = hostEval(familyId, p, ctx), wire = wireOf(g, ctx);
  return liveness(law, g.N, g.S, board => score(wire(board)) as readonly number[], band);
}
