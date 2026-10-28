/**
 * The Grid object type's utility functions: dealing, host evaluation, cards and scoring.
 *
 * Families, draws, kid cards and calibration tables come from Grid Lab, precomputed offline
 * (src/grid/data). The host evaluates each draw with a TypeScript port of the family's ordinal
 * (src/grid/families, parity-tested against Grid Lab), converts it to surprisal with the shipped
 * table, and combines reward and defence-goal penalty into signed net bits.
 */
import type { GridTypeArgs } from "@workspace/game-core";
import type { Rng, UtilityDescriptor } from "../types.ts";
import { gridData, type GridDrawInfo } from "./data.ts";
import { gridEnv, decode, type Ordinal } from "./env.ts";
import { gridOrdinal } from "./families/index.ts";
import { surprisal, hinge, netBits, rarerThanPerThousand, oneIn, HINGE_BITS } from "./calibration.ts";

export * from "./calibration.ts";
export { gridData, hasGridData, canonicalJson, SHIPPED_GRID_TYPES, GRID_DATA_VERSION } from "./data.ts";
export type { GridData, GridDrawInfo, GridFamilyInfo } from "./data.ts";
export { gridEnv, type GridEnv, type GridView, type Ordinal } from "./env.ts";
export { GRID_ORDINALS, gridOrdinal } from "./families/index.ts";

/** Public, parameter-free catalog of the families gods may draw in this GridType. */
export function gridCatalog(args: GridTypeArgs) {
  return gridData(args).families.map(({ id, name, emoji, theme, defence }) => ({ id, name, emoji, theme, defence }));
}

function drawOf(descriptor: UtilityDescriptor, args: GridTypeArgs): GridDrawInfo {
  const d = gridData(args).draw(descriptor.familyId, descriptor.params);
  if (!d) throw new Error(`Utility ${descriptor.familyId} is not a dealable draw for this grid type`);
  return d;
}

/**
 * Divine Lottery for Grid: each god independently draws a family uniformly, then one of its
 * shipped draws uniformly. Identical draws are redrawn.
 */
export function dealGrid(args: GridTypeArgs, count: number, rng: Rng): UtilityDescriptor[] {
  const data = gridData(args), out: UtilityDescriptor[] = [], seen = new Set<string>();
  for (let attempt = 0; out.length < count; attempt++) {
    if (attempt > 10000) throw new Error("Not enough distinct utility functions for this grid type");
    const family = data.families[rng(data.families.length)];
    const draws = data.drawsOf(family.id);
    const d = draws[rng(draws.length)];
    const key = `${d.family}|${JSON.stringify(d.params)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ familyId: d.family, params: JSON.parse(JSON.stringify(d.params)) as UtilityDescriptor["params"] });
  }
  return out;
}

/** What one god's utility function makes of one grid. Server-private except to that god. */
export interface GridEvaluation {
  ordinal: Ordinal;
  /** Reward surprisal: −log2 of the share of random grids at least this good. */
  bits: number;
  /** Defence goal only: the badness surprisal and the penalty bits (soft hinge of it). */
  penaltySurprisal: number | null;
  penaltyBits: number | null;
  /** Signed net bits: the god's utility for this object. */
  net: number;
}

export function evaluateGrid(descriptor: UtilityDescriptor, value: string, args: GridTypeArgs): GridEvaluation {
  const data = gridData(args), env = gridEnv(args), d = drawOf(descriptor, args), g = decode(value, env);
  const params = d.params as Record<string, unknown>;
  const reward = d.penalty ? Object.fromEntries(Object.entries(params).filter(([k]) => k !== "defence")) : params;
  const ordinal = gridOrdinal(d.family).ordinal(g, reward, env);
  const bits = surprisal(data.tables[d.table], ordinal);
  if (!d.penalty || !d.penaltyTable) return { ordinal, bits, penaltySurprisal: null, penaltyBits: null, net: bits };
  const ptable = data.tables[d.penaltyTable];
  const sm = surprisal(ptable, gridOrdinal(d.penalty.family).ordinal(g, params.defence, env));
  const h = hinge(sm);
  return { ordinal, bits, penaltySurprisal: sm, penaltyBits: h, net: netBits(bits, h, ptable.hbar ?? 0) };
}

/** Kid-facing per-object feedback: rarity instead of bits, plus a defence-goal warning. */
export function gridFeedback(e: GridEvaluation, descriptor: UtilityDescriptor, args: GridTypeArgs) {
  const d = drawOf(descriptor, args);
  const out: {
    bits: number; rarerThan: number; oneIn: number; text: string;
    penalty: null | { bits: number; worseThanPercent: number; warning: boolean; text: string };
  } = {
    bits: e.bits, rarerThan: rarerThanPerThousand(e.bits), oneIn: oneIn(e.bits),
    text: `Rarer than ${rarerThanPerThousand(e.bits).toLocaleString("en")} of 1,000 random grids (1 in ${oneIn(e.bits).toLocaleString("en")})`,
    penalty: null,
  };
  if (d.penalty && e.penaltySurprisal !== null) {
    const sm = e.penaltySurprisal, warning = sm > HINGE_BITS, pct = Math.floor(100 * (1 - 2 ** -sm));
    out.penalty = {
      bits: e.penaltyBits ?? 0, worseThanPercent: pct, warning,
      text: warning ? `⚠️ ${d.penalty.comparative} than ${pct}% of grids` : "⚠️ fine: no worse than usual",
    };
  }
  return out;
}

/** A god's own card: emoji, name, plain-language summary and the kid-readable source. */
export function gridCard(descriptor: UtilityDescriptor, args: GridTypeArgs) {
  const data = gridData(args), d = drawOf(descriptor, args), f = data.family(d.family)!;
  return {
    familyId: f.id, name: f.name.split(",")[0], emoji: f.emoji, summary: d.summary, source: d.card,
    penalty: d.penalty ? { name: d.penalty.name, summary: d.penalty.summary } : null,
  };
}
export { gridManifest, gridBadges, gridTypeLabel, GRID_BADGES, MAX_CALLS_PER_ACT } from "./manifest.ts";
