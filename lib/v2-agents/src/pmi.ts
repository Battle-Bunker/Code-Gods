/**
 * Independence of two rules (owner decision 39): the pointwise mutual information of their upper sets,
 *
 *   PMI(t) = log2 π(A ≥ t ∧ B ≥ t) − log2 π(A ≥ t) − log2 π(B ≥ t)      (bits; "A ≥ t": A's value is at least t bits),
 *
 * averaged over the depths t where the joint upper set was read (scripts/pmi.ts; docs/engine-v2/pmi-matrix.md). 0 is
 * perpendicular: an object worth t bits to each is as rare as 2t bits. Positive is aligned (one structure paid twice);
 * negative is anti-aligned (hard to hold both). The table is generated (src/pmi.gen.ts) and keyed by "family/tieBreaker";
 * a family dealt with several parameter sets carries the mean over them.
 */
import { PMI_TABLES, type PmiTable } from "./pmi.gen.ts";

export type PmiClass = "independent" | "mild" | "mild-anti" | "aligned" | "anti-aligned";

/** |PMI| ≤ INDEPENDENT_WITHIN is independent; beyond ALIGNED_ABOVE (either sign) aligned or anti-aligned; mild between. */
export const INDEPENDENT_WITHIN = 1;
export const ALIGNED_ABOVE = 2;

export function pmiClass(pmi: number): PmiClass {
  if (Math.abs(pmi) <= INDEPENDENT_WITHIN) return "independent";
  if (pmi > ALIGNED_ABOVE) return "aligned";
  if (pmi < -ALIGNED_ABOVE) return "anti-aligned";
  return pmi > 0 ? "mild" : "mild-anti";
}

/** One character per class in the generated table. */
export const CLASS_CHAR: Readonly<Record<PmiClass, string>> = { independent: "i", mild: "m", "mild-anti": "n", aligned: "A", "anti-aligned": "X" };
const CHAR_CLASS = Object.fromEntries(Object.entries(CLASS_CHAR).map(([k, v]) => [v, k as PmiClass]));

/** Position of the pair i < j in an upper triangle of n rules stored row by row. */
export const pairIndex = (n: number, i: number, j: number): number => (i * (2 * n - i - 1)) / 2 + (j - i - 1);

const indexes = new Map<PmiTable, Map<string, number>>();

/**
 * The depth-averaged PMI of two rules ("family/tieBreaker") on a variant, and its class; null when either rule is not
 * in the table, the two are the same key, or no depth was read for the pair.
 */
export function pairPmi(variant: string, a: string, b: string, tables: Readonly<Record<string, PmiTable>> = PMI_TABLES): { pmi: number; class: PmiClass } | null {
  const t = tables[variant];
  if (!t || a === b) return null;
  let idx = indexes.get(t);
  if (!idx) { idx = new Map(t.rules.map((r, i) => [r, i])); indexes.set(t, idx); }
  const i = idx.get(a), j = idx.get(b);
  if (i === undefined || j === undefined) return null;
  const k = pairIndex(t.rules.length, Math.min(i, j), Math.max(i, j));
  const pmi = t.pmi[k];
  if (pmi === null || pmi === undefined) return null;
  return { pmi, class: CHAR_CLASS[t.classes[k]!] ?? pmiClass(pmi) };
}

export type { PmiTable };
