/**
 * What a game deals from one reward family (docs/layered-rules-design.md): an ordinary game its support, a tiered game
 * (settings.ruleTiers) the family's tiered draws of that depth and composition, which are deliberately outside the
 * support. The one place that decides it, for the dealer (selectors.ts), rival inference (inference.ts), table coverage
 * (calibration.ts) and the engine's warm-ups.
 */
import type { FamilyContext, Params, TierCompose, UtilityFamily } from "./types.ts";

/** A game's tiers: how many interactions each rule carries, and how they compose with the base ("gated" when absent). */
export interface TierOptions {
  readonly depth: number;
  readonly compose?: TierCompose;
}

/** The draws of a reward family a game can deal here: its support, or with `tiers` its tiered draws (none: never dealt). */
export function dealableParams<P extends Params>(f: UtilityFamily<P>, ctx: FamilyContext, tiers?: TierOptions): readonly P[] {
  if (!tiers) return f.support(ctx);
  return f.tiered?.(ctx, tiers.depth, tiers.compose ?? "gated") ?? [];
}
