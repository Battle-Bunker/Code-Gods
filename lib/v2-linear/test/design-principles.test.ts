/**
 * The design-principles check (docs/engine-v2/design-principles.md), its mechanical rows, on every dealt beginner line
 * family: row 1 (no attained top: the best main part found keeps rising with the search radius), row 3 (each tie-breaker's
 * best gradient on some main-part level is not best on a higher one, among the six highest levels). Row 4 and the rows
 * that read declarations and law draws (3a, 5, 7, decision 13) are checked on every preset's dealt pool, lines, grids and
 * pairs: artifacts/engine test/unit/v2-rule-check.test.ts.
 *
 * A known failure is listed in EXEMPT with its date and owner. The test fails for any failure not listed, and for a
 * listed one that now passes (remove it).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, mainUnbounded, Qn, tieEntangled, type Reading } from "@workspace/v2-core";
import { beginnerPool, fromMC, lineQ, lineType, type LineState } from "../src/index.ts";

/** "<family> row <n>[, <tie-breaker>]" → since when and who owns it. */
const EXEMPT: Readonly<Record<string, string>> = {
  "square-area row 1": "15 Nov, grids session: a distance main part reaches 0 (Square Area redesign)",
  "square-area row 3, spf": "15 Nov, grids session: no counterpart on the high level (Square Area redesign)",
  "square-area row 3, lpf": "15 Nov, grids session: no counterpart on the high level (Square Area redesign)",
  "prime-gradient row 1": "15 Nov, spec lead: the best main part found is −0.5 at every radius (a top within the searched gradients)",
  "prime-gradient row 3, shared-factor": "15 Nov, spec lead: the low level's best gradient has no counterpart on the high level",
};
type K = [number, number];   // (m, c)

function readings(f: (typeof beginnerPool)[number], p: unknown, ms: readonly number[], cs: readonly number[]): Reading<K>[] {
  const out: Reading<K>[] = [];
  const val = (x: unknown) => (x && typeof x === "object" && "n" in x ? Qn.toNumber(x as never) : null);
  for (const m of ms) for (const c of cs) {
    const e = evaluateSite(lineType, f as never, p, { lines: [fromMC(Qn.q(m), Qn.q(c))] } as LineState, lineQ, 0, null);
    const term = (id: string) => val(e.terms.find(t => t.id === id)?.value);
    out.push({ key: [m, c], main: term(f.main.id), ties: Object.fromEntries(f.tieBreakers.map(t => [t.id, term(t.id)])) });
  }
  return out;
}
const range = (r: number) => Array.from({ length: 2 * r + 1 }, (_, i) => i - r);
/** Gradients for row 1: the small ones, and the steps a progression of primes with one ending needs (10, 30, 210). */
const GRADIENTS = [...range(8), ...[10, 20, 30, 60, 90, 150, 210, 420].flatMap(x => [x, -x])];

for (const f of beginnerPool) {
  const p = f.dealable(lineQ)[0];
  const check = () => {
    const problems: string[] = [];
    const levels = [5, 15, 40, 120, 600].map(r => readings(f, p, GRADIENTS, range(r)));
    const u = mainUnbounded(f.main.sense, levels);
    if (!u.ok) problems.push(`${f.id} row 1`);
    // Row 3: the six best main-part values within radius 120, each with every gradient −40 … 40 that reaches it; some
    // lower level's best gradient must lose on some higher level.
    const wide = readings(f, p, range(40), range(120)).filter(r => r.main !== null);
    const sign = f.main.sense === "max" ? 1 : -1;
    const values = [...new Set(wide.map(r => r.main!))].sort((a, b) => sign * (b - a));
    const groups = values.map(v => wide.filter(r => r.main === v)).filter(g => g.length >= 5).slice(0, 6);
    if (groups.length < 2) problems.push(`${f.id} row 3`);
    else for (const t of f.tieBreakers) {
      if (t.dealtOn && !t.dealtOn(lineQ)) continue;
      const tries = groups.flatMap((hi, i) => groups.slice(i + 1).map(lo => tieEntangled(lo, hi, t.id, (a, b) => a[0] === b[0])));
      if (!tries.some(e => e.ok)) problems.push(`${f.id} row 3, ${t.id}`);
    }
    return problems;
  };
  test(`${f.id} passes rows 1 and 3 of design-principles.md, or each failure is listed in EXEMPT`, () => {
    const found = check();
    assert.deepEqual(found.filter(k => !(k in EXEMPT)), [], "new failures: fix them, or list them in EXEMPT with a date and an owner");
    const mine = Object.keys(EXEMPT).filter(k => k.startsWith(`${f.id} row`));
    assert.deepEqual(mine.filter(k => !found.includes(k)), [], "exemptions that now pass: remove them");
  });
}

test("every exemption names a dealt beginner family", () => {
  const ids = new Set(beginnerPool.map(f => f.id));
  assert.deepEqual(Object.keys(EXEMPT).filter(k => !ids.has(k.split(" row")[0]!)), []);
});
