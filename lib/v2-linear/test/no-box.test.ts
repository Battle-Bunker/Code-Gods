/**
 * Owner decision 26: no cap on coefficient size, only a cost that makes larger numbers harder to reach. What would
 * break: a line past the old box (|a|, |b|, |c| ≤ 10^6) refused, priced other than by φ, or a rule that hangs or throws
 * on huge coefficients (every family's limits must give a defined answer or "undefined", in bounded time).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, evaluateObject, isInvalid, mixedIntBits, q, tieBreakersOn, type Variant } from "@workspace/v2-core";
import { gravityLineCode, lineParams, lineType, lineQ, lineZ, normalise, type Line, type LineState } from "../src/index.ts";
import { mc } from "./helpers.ts";

const BIG = 10n ** 30n + 7n;
const state = (a: bigint, b: bigint, c: bigint): LineState => ({ lines: [normalise(a, b, c) as Line] });

test("a line past 10^6 is on the board, read at its φ, and reached by an ordinary call priced by φ", () => {
  for (const v of [lineZ, lineQ]) {
    const s = state(-3n, 1n, -BIG);   // y = 3x + 10^30 + 7
    assert.ok(!isInvalid(lineType.canonical(s, v)), `${v.id}: accepted`);
    assert.deepEqual(lineType.decode(lineType.encode(s)), s);
    const phi = lineType.readLength(s, v);
    const want = v === lineZ ? mixedIntBits(3n) + mixedIntBits(BIG) : gravityLineCode(lineParams(v).gravity!).bits(-3n, 1n, -BIG);
    assert.equal(phi, want);
    assert.ok(phi > lineType.readLength(mc(3, 1_000_000), v), "bigger numbers are dearer, never refused");
  }
  // Stretching y = 1000x + 1000 by 10^4 lands past the old box: allowed, and its fee includes φ's rise.
  const from = mc(1000, 1000);
  const r = applyCall(lineType, lineZ, from, { mutator: "mach.stretch", site: 0, args: { f: "10000" } });
  assert.ok(!isInvalid(r), isInvalid(r) ? r.invalid : "");
  if (!isInvalid(r)) {
    assert.deepEqual(r.result, mc(10_000_000, 10_000_000));
    assert.ok(r.price.total >= lineType.readLength(r.result, lineZ) - lineType.readLength(from, lineZ));
  }
});

test("every family and tie-breaker evaluates huge lines quickly (bounded trial division, coin and prime windows)", () => {
  const lines = [
    state(-3n, 1n, -BIG), state(-BIG, 1n, -5n), state(-BIG, 1n, -BIG - 2n), state(-(2n ** 100n), 1n, 6n), state(-2n, 1n, -(10n ** 200n + 1n)),
  ];
  const fractions = [state(3n, BIG, 5n), state(BIG, 7n, -(BIG + 2n)), state(1n, 2n ** 64n, 3n)];
  let n = 0;
  for (const v of [lineZ, lineQ] as Variant[]) for (const f of lineType.families) {
    const params = f.dealable(v)[0];
    if (params === undefined) continue;
    const tbs = tieBreakersOn(f, v).map(t => t.id);
    for (const tb of tbs.length ? tbs : [null]) for (const s of v === lineZ ? lines : [...lines, ...fractions]) {
      const t = Date.now();
      const r = evaluateObject(lineType, f, params, s, v, tb);
      assert.ok(Date.now() - t < 1000, `${v.id} ${f.id}+${tb} on ${lineType.encode(s).slice(0, 40)}: ${Date.now() - t} ms`);
      assert.ok(r.score === null || r.score.every(x => x === null || typeof x.n === "bigint"), `${f.id}+${tb}: a score or undefined`);
      n++;
    }
  }
  assert.ok(n > 300, `${n} evaluations`);
  // The m-meets-c perfect line y = Nx + N at any size: a defined size utility as large as N.
  const huge = mc(q(BIG), q(BIG));
  const f = lineType.families.find(x => x.id === "m-meets-c")!;
  assert.deepEqual(evaluateObject(lineType, f, {}, huge, lineZ, "size").score, [q(0), q(BIG)]);
});

test("line-q's law needs no box to be normalised: the canonical triples hold at most the code's mass, 1", () => {
  // π on line-q is 2^−φ(a, b, c) (the gravity code, complete for each b) conditioned on canonical triples. Over
  // |a|, |b|, |c| ≤ R the mass is below 1 for every R: nothing needs a cap to keep the total finite.
  const code = gravityLineCode(lineParams(lineQ).gravity!), R = 24n;
  let canonical = 0, all = 0;
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
    const w = 2 ** -code.bits(a, b, c);
    all += w;
    const l = normalise(a, b, c);
    if (!isInvalid(l) && l.a === a && l.b === b && l.c === c) canonical += w;
  }
  assert.ok(all < 1, `all ${all}`);
  assert.ok(canonical > 0.1 && canonical < all, `canonical mass ${canonical} of ${all}`);
});

test("exact change counts the ways to pay in closed form at any size (it used to give up past 10^5 steps)", async () => {
  const { waysToPay } = await import("../src/index.ts");
  // Against brute force on small coins and bills (the line as normalised: its own a, b and N).
  for (let a0 = 1n; a0 <= 9n; a0++) for (let b0 = 1n; b0 <= 9n; b0++) for (let N0 = -3n; N0 <= 60n; N0++) {
    const l = normalise(a0, b0, -N0);
    if (isInvalid(l)) continue;
    const { a, b } = l, N = -l.c;
    const ways: { x: bigint; y: bigint }[] = [];
    for (let x = 0n; a * x <= N; x++) if ((N - a * x) % b === 0n) ways.push({ x, y: (N - a * x) / b });
    const w = waysToPay(l)!;
    assert.equal(w.count, BigInt(ways.length), `${a}x + ${b}y = ${N}`);
    if ("first" in w) assert.deepEqual([w.first, w.last], [ways[0], ways[ways.length - 1]], `${a}x + ${b}y = ${N}`);
  }
  // A bill of 10^30 + 7 with coins 3 and 5: x ≡ 2N (mod 5), 0 ≤ x ≤ N/3, counted at once.
  const line = normalise(3n, 5n, -BIG) as Line;
  const x0 = (2n * BIG) % 5n;
  assert.equal(waysToPay(line)!.count, (BIG / 3n - x0) / 5n + 1n);
  const f = lineType.families.find(x => x.id === "exact-change")!;
  const s = evaluateObject(lineType, f, f.dealable(lineQ)[0], { lines: [line] }, lineQ, "big-bill").score;
  assert.ok(s !== null && s[1]!.n === BIG, "the bill counts at any size");
});
