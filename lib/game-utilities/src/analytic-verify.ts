/**
 * Verification of analytic survival functions against the empirical evidence (docs/analytic-calibration/architecture.md
 * §verification). Three independent checks, all pure functions a test or a script can call:
 *
 *  1. `compareWithTable`: level by level against a Monte Carlo + splitting table of the same draw (the archived
 *     reference tables in data/analytic-reference/, or any table). Reports the maximum |Δ bits|, the maximum z against
 *     the table's nominal standard error, every table level the analytic calls unattainable, and the error by depth band.
 *  2. `compareWithSpawns`: against fresh spawns: every sampled ordinal must be a level, and at every level with mass
 *     ≥ 2^-9 the sample frequency must agree within 5 standard deviations.
 *  3. `compareWithEnumeration`: for Int domains small enough to enumerate (scripts/estimator.ts EXACT_DOMAIN), the exact
 *     survival at every attainable ordinal must match to 1e-9.
 *
 * Nominal standard error. Shipped tables carry no per-level se, so it is reconstructed from the budget: an MC level with
 * survival G has var(bits) = (1 − G)/(G·nMc)/ln²2; a splitting level adds (1 − p0)/(p0·particles)/ln²2 per stage (one
 * stage per −log2 p0 bits) and is inflated by the estimator's SE_INFLATION (1.6). A floor of 0.02 bits absorbs the
 * clean-up (MIN_STEP_BITS, thinning). Measured against 13 exactly solved families on 48 Grid shapes (tail-toolkit.md §8)
 * this nominal se is honest up to about 48 bits (RMS z ≈ 1) and about 1.4× optimistic above 64 bits.
 */
import { objectType, seededRng, type Instantiation } from "@workspace/game-types";
import { assertAnalytic, cmpOrdinals, ordinalKey, type AnalyticSurvival } from "./analytic.ts";
import type { CalibrationTable } from "./calibration.ts";
import { evaluator, type Draw } from "./catalog.ts";
import type { Ordinal } from "./types.ts";

const SE_INFLATION = 1.6;
const SE_FLOOR_BITS = 0.02;
export const keyOfOrdinal = ordinalKey;

/** The nominal standard error (bits) of a table level at `bits`, from the table's budget; 0 for exact tables. */
export function nominalSe(table: CalibrationTable, bits: number): number {
  const b = table.estimator.budget;
  if (typeof b === "string") return 0;
  const LN2 = Math.LN2;
  const mcVar = (bb: number) => { const g = 2 ** -bb; return (1 - g) / (g * b.nMc) / LN2 ** 2; };
  const mcMax = Math.log2(b.nMc / b.minMcCount);
  if (bits <= mcMax) return Math.sqrt(mcVar(bits));
  const perStage = (1 - b.p0) / (b.p0 * b.particles) / LN2 ** 2, stages = (bits - mcMax) / -Math.log2(b.p0);
  return SE_INFLATION * Math.sqrt(mcVar(mcMax) + stages * perStage);
}

/** Depth bands (bits) the comparison is summarised over. */
export const DEPTH_BANDS: readonly (readonly [number, number])[] = [[0, 4], [4, 8], [8, 16], [16, 32], [32, 48], [48, 64], [64, Infinity]];

export interface BandStats { readonly band: readonly [number, number]; readonly levels: number; readonly meanDelta: number; readonly rmsDelta: number; readonly maxAbsDelta: number; readonly rmsZ: number }
export interface TableComparison {
  readonly instance: string;
  readonly family: string;
  readonly levels: number;
  /** Table levels (ordinals) the analytic says are unattainable: a formula error or a table artefact; investigate. */
  readonly unattainable: readonly Ordinal[];
  readonly maxAbsDelta: number;
  readonly maxZ: number;
  /** The level with the largest z. */
  readonly worst?: { readonly ordinal: Ordinal; readonly tableBits: number; readonly analyticBits: number; readonly se: number };
  readonly bands: readonly BandStats[];
  /** The table's top level bits and the analytic's bits at that same ordinal. */
  readonly topBits: { readonly table: number; readonly analytic: number | null };
}

/** Level by level: Δ = table bits − analytic bits, z = Δ / se (se from the budget with a floor). */
export function compareWithTable(a: AnalyticSurvival, table: CalibrationTable): TableComparison {
  const exact = new Map(a.levels.map(([o, l]) => [keyOfOrdinal(o), -l]));
  const unattainable: Ordinal[] = [];
  let maxAbsDelta = 0, maxZ = 0, worst: TableComparison["worst"], n = 0;
  const acc = DEPTH_BANDS.map(() => ({ n: 0, sd: 0, sd2: 0, sz2: 0, max: 0 }));
  for (const [o, bits] of table.levels) {
    const ab = exact.get(keyOfOrdinal(o));
    if (ab === undefined) { unattainable.push(o); continue; }
    n++;
    const d = bits - ab, se = Math.sqrt(nominalSe(table, bits) ** 2 + SE_FLOOR_BITS ** 2), z = Math.abs(d) / se;
    maxAbsDelta = Math.max(maxAbsDelta, Math.abs(d));
    if (z > maxZ) { maxZ = z; worst = { ordinal: o, tableBits: bits, analyticBits: ab, se }; }
    const bi = DEPTH_BANDS.findIndex(([lo, hi]) => bits >= lo && bits < hi);
    if (bi >= 0) { const b = acc[bi]; b.n++; b.sd += d; b.sd2 += d * d; b.sz2 += z * z; b.max = Math.max(b.max, Math.abs(d)); }
  }
  const [topO, topB] = table.levels[table.levels.length - 1];
  return {
    instance: table.instance, family: table.family, levels: n, unattainable, maxAbsDelta, maxZ, worst,
    bands: acc.map((b, i) => ({ band: DEPTH_BANDS[i], levels: b.n, meanDelta: b.n ? b.sd / b.n : 0, rmsDelta: b.n ? Math.sqrt(b.sd2 / b.n) : 0, maxAbsDelta: b.max, rmsZ: b.n ? Math.sqrt(b.sz2 / b.n) : 0 })),
    topBits: { table: topB, analytic: exact.get(keyOfOrdinal(topO)) ?? null },
  };
}

/**
 * Tolerance on |table − analytic| by depth, from the measured behaviour of the estimator over six families and 48 shapes
 * (tail-toolkit.md §8): for families whose level sets the kernel can move through, the largest observed errors are 3.4
 * bits below 48 bits, 4.8 below 64 and 7 above.
 */
export const MAX_ABS_DELTA = (bits: number) => (bits < 16 ? 1.2 : bits < 32 ? 2.5 : bits < 48 ? 5 : bits < 64 ? 6 : 10);
/** A family's tables, pooled, must have RMS z at most this over the levels below 32 bits. */
export const MAX_RMS_Z_BELOW_32 = 1.5;
/**
 * Families whose sampling tables are known to be biased above some depth (tail-toolkit.md §8.2): the analytic is the
 * ground truth there, so the comparison only bounds the bias. Say why.
 */
export const KNOWN_TABLE_BIAS: Record<string, { readonly fromBits: number; readonly maxAbsDelta: number; readonly why: string }> = {
  rainbow_road: { fromBits: 32, maxAbsDelta: 10, why: "completing a second whole line needs coordinated multi-cell moves the kernel rarely makes" },
};

/**
 * The per-table bands every sampling table must meet against a verified analytic (test/analytic.test.ts, and the split
 * estimator's check, scripts/verify-split.ts): no level the analytic calls unattainable, |Δ| within MAX_ABS_DELTA (or
 * the family's KNOWN_TABLE_BIAS). The pooled RMS z bound (MAX_RMS_Z_BELOW_32) is the caller's, over a family's tables.
 */
export function tableViolations(a: AnalyticSurvival, table: CalibrationTable, c: TableComparison = compareWithTable(a, table)): string[] {
  const bad: string[] = [];
  if (c.unattainable.length) bad.push(`table levels the analytic calls unattainable: ${c.unattainable.map(o => JSON.stringify(o)).join(", ")}`);
  const exact = new Map(a.levels.map(([o, l]) => [keyOfOrdinal(o), -l]));
  const bias = KNOWN_TABLE_BIAS[table.family];
  for (const [o, bits] of table.levels) {
    const ab = exact.get(keyOfOrdinal(o));
    const allowed = bias && bits >= bias.fromBits ? Math.max(bias.maxAbsDelta, MAX_ABS_DELTA(bits)) : MAX_ABS_DELTA(bits);
    if (ab !== undefined && Math.abs(bits - ab) > allowed) bad.push(`at ${JSON.stringify(o)} table ${bits.toFixed(2)} vs analytic ${ab.toFixed(2)} bits`);
  }
  return bad;
}

export interface SpawnComparison {
  readonly spawns: number;
  /** Sampled ordinals that are not levels (a formula that misses attainable ordinals). */
  readonly unlisted: readonly Ordinal[];
  /** Levels with mass ≥ 2^-9 whose sample frequency is more than 5 sd from G. */
  readonly disagreements: readonly { readonly ordinal: Ordinal; readonly G: number; readonly frequency: number }[];
  readonly levelsChecked: number;
}

/** Against `n` fresh spawns of the instantiation (deterministic: seeded by the draw). */
export function compareWithSpawns(a: AnalyticSurvival, draw: Draw, inst: Instantiation, n = 2000): SpawnComparison {
  const T = objectType(inst.objectType), codec = T.codec(inst), ev = evaluator(draw, inst);
  const rng = seededRng(`analytic:${draw.familyId}:${inst.key}:${JSON.stringify(draw.params)}`);
  const known = new Set(a.levels.map(([o]) => keyOfOrdinal(o)));
  const ords: Ordinal[] = [], unlisted = new Map<string, Ordinal>();
  for (let i = 0; i < n; i++) {
    const o = ev(codec.encode(T.spawn(inst, rng)));
    ords.push(o);
    if (!known.has(keyOfOrdinal(o))) unlisted.set(keyOfOrdinal(o), o);
  }
  const disagreements: SpawnComparison["disagreements"][number][] = [];
  let levelsChecked = 0;
  ords.sort(cmpOrdinals);
  let at = 0;   // levels are increasing, so the first sample ≥ the level only moves forward
  for (const [l, log2G] of a.levels) {
    while (at < n && cmpOrdinals(ords[at], l) < 0) at++;
    const G = 2 ** log2G;
    if (G < 2 ** -9) continue;
    levelsChecked++;
    const hits = n - at, sd = Math.sqrt(n * G * (1 - G)) + 1;
    if (Math.abs(hits - n * G) > 5 * sd) disagreements.push({ ordinal: l, G, frequency: hits / n });
  }
  return { spawns: n, unlisted: [...unlisted.values()], disagreements, levelsChecked };
}

/** Domains with at most this many values are enumerated for the exact check (the estimator's EXACT_DOMAIN). */
export const ENUMERABLE_DOMAIN = 1 << 20;

export interface EnumerationComparison { readonly values: number; readonly maxAbsDelta: number; readonly mismatchedOrdinals: readonly Ordinal[] }

/** Exact enumeration of a small Int domain against the analytic; null when the domain is not enumerable. */
export function compareWithEnumeration(a: AnalyticSurvival, draw: Draw, inst: Instantiation): EnumerationComparison | null {
  if (inst.objectType !== "Int") return null;
  const min = Number(inst.args.min), max = Number(inst.args.max);
  if (max - min + 1 > ENUMERABLE_DOMAIN) return null;
  const ev = evaluator(draw, inst), counts = new Map<string, { o: Ordinal; c: number }>();
  for (let x = min; x <= max; x++) {
    const o = ev(x), k = keyOfOrdinal(o), e = counts.get(k);
    if (e) e.c++; else counts.set(k, { o, c: 1 });
  }
  const total = max - min + 1, sorted = [...counts.values()].sort((x, y) => cmpOrdinals(x.o, y.o));
  const exact = new Map<string, number>();
  let G = 0;
  for (let i = sorted.length - 1; i >= 0; i--) { G += sorted[i].c; exact.set(keyOfOrdinal(sorted[i].o), Math.log2(G / total)); }
  const analytic = new Map(a.levels.map(([o, l]) => [keyOfOrdinal(o), l]));
  const mismatched: Ordinal[] = [];
  let maxAbsDelta = 0;
  for (const { o } of sorted) {
    const l = analytic.get(keyOfOrdinal(o)), e = exact.get(keyOfOrdinal(o))!;
    if (l === undefined) { mismatched.push(o); continue; }
    maxAbsDelta = Math.max(maxAbsDelta, Math.abs(l - e));
  }
  return { values: total, maxAbsDelta, mismatchedOrdinals: mismatched };
}

/** Structural validity plus the two cheap checks, as one call for tests. Throws with a precise message on failure. */
export function assertAnalyticAgainstSpawns(a: AnalyticSurvival, draw: Draw, inst: Instantiation, n = 2000): SpawnComparison {
  const where = `${draw.familyId} ${JSON.stringify(draw.params)} on ${inst.key}`;
  assertAnalytic(a, where);
  const s = compareWithSpawns(a, draw, inst, n);
  if (s.unlisted.length) throw new Error(`${where}: sampled ordinals missing from the analytic levels: ${s.unlisted.slice(0, 5).map(o => JSON.stringify(o)).join(", ")}`);
  if (s.disagreements.length) {
    const d = s.disagreements[0];
    throw new Error(`${where}: at ${JSON.stringify(d.ordinal)} the analytic says G = ${d.G.toPrecision(4)} but ${s.spawns} spawns give ${d.frequency.toPrecision(4)}`);
  }
  return s;
}

/** One markdown table of comparisons (what the docs record), one row per (instance). */
export function comparisonMarkdown(rows: readonly TableComparison[]): string {
  const head = "| shape | levels | max abs Δ bits | max z | unattainable | table top / analytic top (bits) | worst level |\n|---|---|---|---|---|---|---|";
  const body = rows.map(r => `| ${r.instance} | ${r.levels} | ${r.maxAbsDelta.toFixed(2)} | ${r.maxZ.toFixed(1)} | ${r.unattainable.length} | ${r.topBits.table.toFixed(1)} / ${r.topBits.analytic === null ? "—" : r.topBits.analytic.toFixed(1)} | ${r.worst ? `${JSON.stringify(r.worst.ordinal)}: table ${r.worst.tableBits.toFixed(2)}, analytic ${r.worst.analyticBits.toFixed(2)}, se ${r.worst.se.toFixed(2)}` : "—"} |`);
  return [head, ...body].join("\n");
}

/** Depth-band summary pooled over comparisons (what tail-toolkit.md §8 shows). */
export function bandSummaryMarkdown(rows: readonly TableComparison[]): string {
  const acc = DEPTH_BANDS.map(() => ({ n: 0, sd: 0, sd2: 0, sz2: 0, max: 0 }));
  for (const r of rows) r.bands.forEach((b, i) => { const a = acc[i]; a.n += b.levels; a.sd += b.meanDelta * b.levels; a.sd2 += b.rmsDelta ** 2 * b.levels; a.sz2 += b.rmsZ ** 2 * b.levels; a.max = Math.max(a.max, b.maxAbsDelta); });
  const head = "| band (bits) | levels | mean Δ (table − analytic) | RMS Δ | max abs Δ | RMS z |\n|---|---|---|---|---|---|";
  const body = acc.flatMap((a, i) => a.n ? [`| ${DEPTH_BANDS[i][0]}–${Number.isFinite(DEPTH_BANDS[i][1]) ? DEPTH_BANDS[i][1] : ""} | ${a.n} | ${(a.sd / a.n).toFixed(3)} | ${Math.sqrt(a.sd2 / a.n).toFixed(3)} | ${a.max.toFixed(2)} | ${Math.sqrt(a.sz2 / a.n).toFixed(2)} |`] : []);
  return [head, ...body].join("\n");
}
