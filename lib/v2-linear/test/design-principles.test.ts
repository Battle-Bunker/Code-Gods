/**
 * The design-principles check (docs/engine-v2/design-principles.md), its mechanical rows, on every dealt beginner line
 * family: row 1 (no attained top: the best main part found keeps rising with the search radius), row 3 (each tie-breaker's
 * best gradient on some main-part level is not best on a higher one, among the six highest levels) and row 4 (at least four dealable instances).
 * Families redesigned to the principles must pass; the others are listed as to-dos until their redesign lands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { enoughInstances, evaluateSite, mainUnbounded, Qn, tieEntangled, type Reading } from "@workspace/v2-core";
import { beginnerPool, fromMC, lineQ, lineType, type LineState } from "../src/index.ts";

const REDESIGNED = new Set(["treasure", "prime-landing", "smooth-intercept", "prime-staircase", "pythagorean-area", "same-on-both-rulers", "ruler", "square-area"]);
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
    if (!enoughInstances(f.dealable(lineQ))) problems.push(`row 4: ${f.dealable(lineQ).length} dealable instances`);
    const levels = [5, 15, 40, 120, 600].map(r => readings(f, p, GRADIENTS, range(r)));
    const u = mainUnbounded(f.main.sense, levels);
    if (!u.ok) problems.push(`row 1: ${u.why} (best by radius ${u.best.join(", ")})`);
    // Row 3: the six best main-part values within radius 120, each with every gradient −40 … 40 that reaches it; some
    // lower level's best gradient must lose on some higher level.
    const wide = readings(f, p, range(40), range(120)).filter(r => r.main !== null);
    const sign = f.main.sense === "max" ? 1 : -1;
    const values = [...new Set(wide.map(r => r.main!))].sort((a, b) => sign * (b - a));
    const groups = values.map(v => wide.filter(r => r.main === v)).filter(g => g.length >= 5).slice(0, 6);
    if (groups.length < 2) problems.push("row 3: fewer than two main-part levels with five states each");
    else for (const t of f.tieBreakers) {
      if (t.dealtOn && !t.dealtOn(lineQ)) continue;
      const tries = groups.flatMap((hi, i) => groups.slice(i + 1).map(lo => tieEntangled(lo, hi, t.id, (a, b) => a[0] === b[0])));
      if (!tries.some(e => e.ok)) problems.push(`row 3, ${t.id}: ${tries[0]!.why}`);
    }
    return problems;
  };
  if (REDESIGNED.has(f.id)) test(`${f.id} passes the mechanical rows of design-principles.md`, () => assert.deepEqual(check(), []));
  else test.todo(`${f.id}: redesign to design-principles.md (${check().join("; ")})`);
}
