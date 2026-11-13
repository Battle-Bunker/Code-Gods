/**
 * Equal opportunity (docs/rules-design.md P10): a family's params make PEER rules. Draws in one symmetry orbit share a
 * canonical table, so a family whose params are all symmetries has one table per shape; a family with several canonical
 * tables on a shape deals gods different rules, and those must still offer the same opportunity: the same top
 * achievable bits (within TOP_RATIO) and the same mean bits of a random board (within MEAN_DELTA), per shape.
 *
 * What would break: a new param that adds or removes scoring opportunity (diagonals on/off, rows|cols|both, targets of
 * different difficulty). Families that still violate are listed in VIOLATORS, which only shrinks: the test fails for a
 * violator not listed AND for a listed family that no longer violates (take it off the list).
 *
 * It reads whatever calibration is shipped (data/calibration/v1), so it keeps working when the calibration itself
 * changes (e.g. hold rarity). Tolerances: sampled tables' tops carry estimator noise, so a small band is allowed; 15% on
 * top bits and half a bit on the mean flag real gaps (Set Spotter's diagonals were 17%, Magic Accountant's rows vs both
 * 80%) and can be revisited if the data shows them too tight or too loose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shippedInstanceKeys, shippedFile } from "../src/calibration-data.ts";
import { instantiateKey, type CalibrationTable } from "../src/calibration.ts";
import { context, family, paramsKey } from "../src/catalog.ts";

/** The largest allowed ratio between a family's top achievable bits on one shape, and the largest mean-bits gap. */
const TOP_RATIO = 1.15, MEAN_DELTA = 0.5;

/** Families whose param classes still differ in opportunity (being fixed in batches). Only shrinks. */
const VIOLATORS: ReadonlySet<string> = new Set([]);

function stats(t: CalibrationTable): { top: number; mean: number } {
  const b = t.levels.map(l => l[1]);
  let mean = 0;
  for (let i = 0; i < b.length; i++) mean += (2 ** -b[i] - (i + 1 < b.length ? 2 ** -b[i + 1] : 0)) * b[i];
  return { top: b[b.length - 1], mean };
}

/**
 * The peers a table is compared with. Base draws of a family are one group, as ever. Tiered draws
 * (docs/tiered-rules.md) are grouped by their tier signature: the dealt (gated, in-band) values of one interaction are
 * peers of each other, never of the base, whose top they extend on purpose. Lab draws (other compositions, values
 * outside the balance band) are deliberately unequal and belong to no group.
 */
const dealtMemo = new Map<string, Set<string>>();
function peerGroup(t: CalibrationTable, instKey: string): string | null {
  const tiers = (t.canonicalParams as { tiers?: readonly { id: string }[] }).tiers;
  if (!tiers) return t.family;
  const memo = `${instKey}|${t.family}`;
  let dealt = dealtMemo.get(memo);
  if (!dealt) {
    const f = family(t.family), ctx = context(instantiateKey(instKey));
    dealt = new Set([1, 2].flatMap(depth => (f.tiered?.(ctx, depth) ?? []).map(p => paramsKey(f.canonical(p, ctx)))));
    dealtMemo.set(memo, dealt);
  }
  return dealt.has(paramsKey(t.canonicalParams)) ? `${t.family} ★ ${tiers.map(x => x.id).join(" + ")}` : null;
}

/** Every family whose canonical tables on some shipped shape differ beyond the tolerances, with the worst case. */
export function opportunityGaps(): Map<string, string> {
  const out = new Map<string, string>();
  for (const key of shippedInstanceKeys()) {
    const by = new Map<string, CalibrationTable[]>();
    for (const t of shippedFile(key)!.tables) {
      if ((t as { prior?: unknown }).prior) continue;
      const group = peerGroup(t, key);
      if (group) by.set(group, [...(by.get(group) ?? []), t]);
    }
    for (const [family, ts] of by) {
      if (ts.length < 2) continue;
      const s = ts.map(stats), tops = s.map(x => x.top), means = s.map(x => x.mean);
      const ratio = Math.max(...tops) / Math.max(1e-9, Math.min(...tops)), gap = Math.max(...means) - Math.min(...means);
      if (ratio > TOP_RATIO || gap > MEAN_DELTA) {
        out.set(family, out.get(family) ?? `${key}: top bits ${Math.min(...tops).toFixed(1)}..${Math.max(...tops).toFixed(1)}, mean gap ${gap.toFixed(2)}`);
      }
    }
  }
  return out;
}

test("every family's params make peer rules of equal opportunity (or the family is a listed violator)", () => {
  const gaps = opportunityGaps();
  const fresh = [...gaps].filter(([f]) => !VIOLATORS.has(f)).map(([f, why]) => `${f} (${why})`);
  assert.deepEqual(fresh, [], "unequal opportunity between a family's params: fix the family (rules-design.md P10)");
  const fixed = [...VIOLATORS].filter(f => !gaps.has(f));
  assert.deepEqual(fixed, [], "these families are fixed: take them off VIOLATORS");
});
