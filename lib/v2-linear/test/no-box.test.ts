/**
 * Owner decision 26: no cap on coefficient size, only a cost that makes larger numbers harder to reach. What would
 * break: a line past the old box (|a|, |b|, |c| ≤ 10^6) refused, priced other than by φ, or a rule that hangs or throws
 * on huge coefficients (every family's limits must give a defined answer or "undefined", in bounded time).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateObject, q, type Variant } from "@workspace/v2-core";
import { lineType, lineQ, lineZ, normalise, type Line, type LineState } from "../src/index.ts";
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

