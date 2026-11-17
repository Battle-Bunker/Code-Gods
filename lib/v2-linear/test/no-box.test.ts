/**
 * Owner decision 26: no cap on coefficient size, only a cost that makes larger numbers harder to reach. What would
 * break: a line past the old box (|a|, |b|, |c| ≤ 10^6) refused, priced other than by φ, or a rule that hangs or throws
 * on huge coefficients (every family's limits must give a defined answer or "undefined", in bounded time).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, evaluateObject, isInvalid, mixedIntBits, q, type Variant } from "@workspace/v2-core";
import { LINE_Q_CODES, lineType, lineQ, lineZ, normalise, type Line, type LineState } from "../src/index.ts";
import { mc } from "./helpers.ts";

const BIG = 10n ** 30n + 7n;
const state = (a: bigint, b: bigint, c: bigint): LineState => ({ lines: [normalise(a, b, c) as Line] });

test("every family and tie-breaker evaluates huge lines quickly (bounded trial division, coin and prime windows)", () => {
  const lines = [
    state(-3n, 1n, -BIG), state(-BIG, 1n, -5n), state(-BIG, 1n, -BIG - 2n), state(-(2n ** 100n), 1n, 6n), state(-2n, 1n, -(10n ** 200n + 1n)),
  ];
  const fractions = [state(3n, BIG, 5n), state(BIG, 7n, -(BIG + 2n)), state(1n, 2n ** 64n, 3n)];
  let n = 0;
  for (const v of [lineZ, lineQ] as Variant[]) for (const f of lineType.families) {
    const params = f.dealable(v)[0];
    if (params === undefined) continue;
    for (const s of v === lineZ ? lines : [...lines, ...fractions]) {
      const t = Date.now();
      const r = evaluateObject(lineType, f, params, s, v, null);
      assert.ok(Date.now() - t < 1000, `${v.id} ${f.id} on ${lineType.encode(s).slice(0, 40)}: ${Date.now() - t} ms`);
      assert.ok(r.score === null || r.score.every(x => x === null || typeof x.n === "bigint"), `${f.id}: a score or undefined`);
      n++;
    }
  }
  assert.ok(n > 60, `${n} evaluations`);
});

test("line-q's law needs no box to be normalised: the canonical triples hold at most the product code's mass, 1", () => {
  // π on line-q is p_a(a)·p_b(b)·p_c(c) (LINE_Q_CODES) conditioned on canonical triples. Over |a|, |b|, |c| ≤ R the
  // canonical mass plus the rest is exactly the product of the three partial sums, each < 1, for every R: nothing
  // needs a cap to keep the total finite.
  const pa = (n: bigint) => 2 ** -LINE_Q_CODES.a.bits(n), pb = (n: bigint) => 2 ** -LINE_Q_CODES.b.bits(n), pc = (n: bigint) => 2 ** -LINE_Q_CODES.c.bits(n);
  const R = 24n;
  let canonical = 0, all = 0, sa = 0, sb = 0, sc = 0;
  for (let n = -R; n <= R; n++) { sa += pa(n); sb += pb(n); sc += pc(n); }
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
    const w = pa(a) * pb(b) * pc(c);
    all += w;
    const l = normalise(a, b, c);
    if (!isInvalid(l) && l.a === a && l.b === b && l.c === c) canonical += w;
  }
  assert.ok(Math.abs(all - sa * sb * sc) < 1e-12 && sa < 1 && sb < 1 && sc < 1);
  assert.ok(canonical > 0.1 && canonical < all, `canonical mass ${canonical} of ${all}`);
});
