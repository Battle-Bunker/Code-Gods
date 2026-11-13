/**
 * The tier specs by family id, for the scripts that need a family's `GridTiers` rather than its `UtilityFamily`: the
 * disjoint base (the exact law and the exact conditional sampler of `src/tiers/hybrid.ts`), the interactions, the gate
 * and the dealt values. A family exports its own spec; nothing in the app needs this map, because `gridFamily` closes
 * over the spec — only the measurement scripts do, so it lives here beside them.
 */
import type { Params } from "../src/types.ts";
import type { GridTiers } from "../src/families/grid/tiers.ts";
import { ninesTiers } from "../src/families/grid/beginner/opposite_nines.ts";
import { threesTiers } from "../src/families/grid/beginner/crosswise_threes.ts";
import { mirrorTiers } from "../src/families/grid/layered/mirror-tiers.ts";
import { courtTiers } from "../src/families/grid/layered/royal_court.ts";
import { pairTiers } from "../src/families/grid/layered/pair-tiers.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const TIER_SPECS: Readonly<Record<string, GridTiers<any>>> = Object.freeze({
  opposite_nines: ninesTiers,
  mirrormancer: mirrorTiers,
  kings_and_subjects: courtTiers,
  two_pair: pairTiers,
  crosswise_threes: threesTiers,
});

/** The base params a spec's own measurements use, where a family's base is dealt with params of its own. */
export const SPEC_BASE: Readonly<Record<string, Params>> = Object.freeze({
  mirrormancer: { axis: "LR" },
  kings_and_subjects: { squares: "corners" },
});
