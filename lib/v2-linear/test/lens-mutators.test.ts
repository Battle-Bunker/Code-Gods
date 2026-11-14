/**
 * The five lens mutators (lenses-and-mutators.md §5) on line-q-lenses: worked examples, an independent model of each
 * (the lenses study's formulas) against the engine, same-fee inverses, the sampler against bits, and the exact potential.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amountCode, applyCall, applyPriced, cycleDiagnostic, factorCode, isInvalid, mixedIntBits, nonzeroRatBits, Qn, q, ratBits, rng, stepsRatBits,
  drawMutator, variantMutators, walkStep, type Q,
} from "@workspace/v2-core";
import { describeLine, lensMutators, lineQ, lineQLenses, lineType, normalise, preset, type Line, type LineState } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const v = lineQLenses;
/** The five's "which" bits under line-q-lenses' weighted code (the nine pay log2 12). */
const which = Math.log2(20);
const run = (s: LineState, mutator: string, args: Record<string, string>) => applyCall(lineType, v, s, { mutator, site: 0, args });
const to = (s: LineState, mutator: string, args: Record<string, string>) => {
  const r = run(s, mutator, args);
  return isInvalid(r) ? r.invalid : describeLine(r.result.lines[0]!);
};
const fee = (s: LineState, mutator: string, args: Record<string, string>) => {
  const r = run(s, mutator, args);
  assert.ok(!isInvalid(r), `${mutator} ${JSON.stringify(args)}: ${isInvalid(r) ? r.invalid : ""}`);
  return r.price.which + r.price.arg;
};
const near = (a: number, b: number, why = "") => assert.ok(Math.abs(a - b) < 1e-9, `${why} ${a} vs ${b}`);

test("the weighted which code is a complete prefix code; the walk draws each mutator with probability 2^−which", () => {
  const w = v.which!;
  assert.deepEqual(Object.keys(w).sort(), [...v.mutators].sort());
  near(Object.values(w).reduce((a, b) => a + 2 ** -b, 0), 1, "Kraft");
  near(w["si.shift"]!, Math.log2(12)); near(w["rot.turn"]!, Math.log2(20));
  // A unit shift costs which + its size code at o = log2 12.
  near(fee(mc(1, 1), "si.shift", { k: "1" }), amountCode(Math.log2(12), 1, true).rate);
  // The walk's draw: each mutator with probability 2^−which.
  const r = rng("which-draws"), n = 200_000, ms = variantMutators(lineType, v), count = new Map<string, number>();
  for (let i = 0; i < n; i++) { const m = drawMutator(ms, v, r); count.set(m.id, (count.get(m.id) ?? 0) + 1); }
  for (const m of ms) { const p = 2 ** -w[m.id]!; assert.ok(Math.abs(count.get(m.id)! / n - p) < 4 * Math.sqrt(p * (1 - p) / n), `${m.id}`); }
});

test("line-q is untouched: nine mutators, which = log2 9; the lens variant offers fourteen and is dealt only by its own preset", () => {
  assert.equal(lineQ.mutators.length, 9);
  assert.equal(v.mutators.length, 14);
  assert.deepEqual(v.params, lineQ.params);
  assert.ok(isInvalid(applyCall(lineType, lineQ, mc(2, 5), { mutator: "coef.swap", site: 0, args: { pair: "m-c" } })));
  assert.equal(preset("lines-lenses").variant, "line-q-lenses");
  assert.equal(preset("lines-beginner").variant, "line-q");
});

test("coef.swap: y = mx + c ↦ y = cx + m, and b ↔ c; a choice of 2", () => {
  assert.equal(to(mc(2, 5), "coef.swap", { pair: "m-c" }), "y = 5x + 2");
  assert.equal(to(mc(-4, 0), "coef.swap", { pair: "b-c" }), "x = -1/4");      // y = −4x (4, 1, 0) ↦ 4x + 1 = 0
  assert.equal(to(abc(0, 1, 4), "coef.swap", { pair: "b-c" }), "y = -1/4");   // y = −4 ↦ y = −¼ (the study's 4.2× shortcut)
  near(fee(mc(2, 5), "coef.swap", { pair: "m-c" }), which + 1);
  // The swap and its line cross at x = 1.
  assert.equal(to(mc(3, 3), "coef.swap", { pair: "m-c" }), "that call does not change the object");
});

test("rot.turn: about a pin of the line by any rational tangent, or about the origin by a Pythagorean angle", () => {
  // y = 2x + 1 a quarter turn about its y-intercept: the perpendicular through (0, 1).
  assert.equal(to(mc(2, 1), "rot.turn", { centre: "0", turn: "left" }), "y = -1/2x + 1");
  // A level line turned by tan θ = 1 about its point at x = 3: y = x − 3.
  assert.equal(to(mc(0, 0), "rot.turn", { centre: "3", turn: "1" }), "y = x - 3");
  // y = 1 a quarter turn anticlockwise about the origin is x = −1; clockwise, x = 1.
  assert.equal(to(mc(0, 1), "rot.turn", { centre: "origin", turn: "left" }), "x = -1");
  assert.equal(to(mc(0, 1), "rot.turn", { centre: "origin", turn: "right" }), "x = 1");
  // A 3-4-5 angle keeps the distance from the origin: y = 5 turned by tan θ = 3/4 is 4·(−3)… = −3x + 4y − 25 = 0.
  assert.equal(to(mc(0, 5), "rot.turn", { centre: "origin", turn: "3/4" }), "y = 3/4x + 25/4");
  assert.match(to(mc(0, 5), "rot.turn", { centre: "origin", turn: "1/2" }), /Pythagorean/);
  // Refused: a turn that would stand the line upright (no pin left to turn back about).
  assert.match(to(mc(1, 0), "rot.turn", { centre: "0", turn: "1" }), /vertical/);
  assert.match(to(mc(0, 2), "rot.turn", { centre: "0", turn: "right" }), /upright/);
  // Prices: centre (1 bit, then x0 by steps) + turn (2 bits for a quarter, else 1 + digits).
  near(fee(mc(2, 1), "rot.turn", { centre: "0", turn: "left" }), which + 1 + stepsRatBits(q(0)) + 2);
  near(fee(mc(0, 0), "rot.turn", { centre: "3", turn: "1" }), which + 1 + stepsRatBits(q(3)) + 1 + nonzeroRatBits(q(1)));
  near(fee(mc(0, 5), "rot.turn", { centre: "origin", turn: "3/4" }), which + 1 + 1 + nonzeroRatBits(q(3, 4)));
});

test("basis.lean keeps the x-intercept; basis.zoom keeps the gradient; both are priced by size", () => {
  // y = 2x − 4 crosses at x = 2. Lean ½: the run per rise ½ → 0, the line stands at x = 2.
  assert.equal(to(mc(2, -4), "basis.lean", { k: "1/2" }), "x = 2");
  assert.equal(to(mc(1, -2), "basis.lean", { k: "-1" }), "y = 1/2x - 1");
  assert.match(to(mc(0, 3), "basis.lean", { k: "1" }), /level line/);
  assert.equal(to(mc(2, 3), "basis.zoom", { f: "2" }), "y = 2x + 6");
  assert.equal(to(mc(2, 3), "basis.zoom", { f: "-1/3" }), "y = 2x - 1");
  assert.match(to(mc(2, 0), "basis.zoom", { f: "2" }), /origin/);
  const rateQ = amountCode(which, 1, true).rate;
  near(fee(mc(1, -2), "basis.lean", { k: "3" }), 3 * rateQ);                // far moves are dear: 3 unit leans
  near(fee(mc(2, 3), "basis.zoom", { f: "6" }), factorCode(which).rate * Math.log2(6));
});

test("fold: a crease through a pin is a choice; any other mirror is paid for from scratch (its read length)", () => {
  // A level crease through the y-intercept: m ↦ −m (the table's two entries swapped).
  assert.equal(to(mc(2, 1), "fold", { x0: "0", s: "0" }), "y = -2x + 1");
  // A crease of gradient 1 through the y-intercept: m ↦ 1/m.
  assert.equal(to(mc(2, 1), "fold", { x0: "0", s: "1" }), "y = 1/2x + 1");
  // The mirror y = 0 (0, 1, 0): the x-axis.
  assert.equal(to(mc(2, 1), "fold", { mirror: "0,1,0" }), "y = -2x - 1");
  // The mirror y = x + 1, given in any scale: y = 0 ↦ x = −1.
  assert.equal(to(mc(0, 0), "fold", { mirror: "-2,2,-2" }), "x = -1");
  assert.match(to(mc(0, 0), "fold", { x0: "0", s: "1" }), /upright/);
  near(fee(mc(2, 1), "fold", { x0: "0", s: "0" }), which + 1 + stepsRatBits(q(0)) + ratBits(q(0)));
  near(fee(mc(2, 1), "fold", { mirror: "0,1,0" }), which + 1 + mixedIntBits(0n) + mixedIntBits(1n) + mixedIntBits(0n));
  // A rich mirror is dear: y = 7x + 11 costs about 21 bits on top.
  assert.ok(fee(mc(2, 1), "fold", { mirror: "-7,1,-11" }) > which + 21);
  assert.ok(isInvalid(run(mc(2, 1), "fold", { mirror: "0,1,0", x0: "0" })));
});

// ---------------------------------------------------------------- the study's model against the engine

type R = Q;
const fromMCr = (m: R, c: R): Line => {
  const L = m.d * c.d;
  return normalise(-m.n * (L / m.d), L, -c.n * (L / c.d)) as Line;
};
const through = (x0: R, y0: R, m: R) => fromMCr(m, Qn.sub(y0, Qn.mul(m, x0)));
/** The lenses study's formulas (lib/v2-agents/scripts/lenses.ts), written independently of the engine's geometry. */
function model(l: Line, id: string, a: Record<string, string>): { line: Line | null; fee: number } {
  const m = l.b === 0n ? null : q(-l.a, l.b), c = l.b === 0n ? null : q(-l.c, l.b);
  const bad = { line: null, fee: 0 };
  switch (id) {
    case "coef.swap": return { line: (a.pair === "m-c" ? normalise(l.c, l.b, l.a) : normalise(l.a, l.c, l.b)) as Line, fee: which + 1 };
    case "basis.lean": {
      const s = Qn.from(a.k!);
      if (l.a === 0n) return bad;
      // (a, b + a·s, c) scaled by s's denominator
      return { line: normalise(l.a * s.d, l.b * s.d + l.a * s.n, l.c * s.d) as Line, fee: amountCode(which, 1, true).rate * (Number(s.n < 0n ? -s.n : s.n) + Number(s.d) - 1) };
    }
    case "basis.zoom": {
      const f = Qn.from(a.f!);
      if (l.c === 0n) return bad;
      return { line: normalise(l.a * f.d, l.b * f.d, l.c * f.n) as Line, fee: factorCode(which).rate * Math.log2(Number(f.n < 0n ? -f.n : f.n) * Number(f.d)) };
    }
    case "rot.turn": {
      if (a.centre === "origin") {
        const qt = a.turn === "left" || a.turn === "right";
        if (qt) { const s = a.turn === "left" ? 1n : -1n; return { line: normalise(-l.b * s, l.a * s, l.c) as Line, fee: which + 1 + 2 }; }
        // Pythagorean (u, v) with tan θ = 2uv/(u² − v²): cs = u² − v², sn = 2uv, r = u² + v².
        const t = Qn.from(a.turn!);
        for (let u = 1n; u < 40n; u++) for (let w = -39n; w < 40n; w++) {
          if (w === 0n) continue;
          const cs = u * u - w * w, sn = 2n * u * w, r = u * u + w * w;
          if (cs <= 0n || !Qn.eq(q(sn, cs), t)) continue;
          return { line: normalise(l.a * cs - l.b * sn, l.a * sn + l.b * cs, l.c * r) as Line, fee: which + 1 + 1 + nonzeroRatBits(t) };
        }
        return bad;
      }
      if (!m || !c) return bad;
      const x0 = Qn.from(a.centre!), y0 = Qn.add(Qn.mul(m, x0), c);
      const cfee = which + 1 + stepsRatBits(x0);
      if (a.turn === "left" || a.turn === "right") return Qn.isZero(m) ? bad : { line: through(x0, y0, Qn.neg(Qn.inv(m))), fee: cfee + 2 };
      const t = Qn.from(a.turn!), den = Qn.sub(Qn.ONE, Qn.mul(m, t));
      return Qn.isZero(den) ? bad : { line: through(x0, y0, Qn.div(Qn.add(m, t), den)), fee: cfee + 1 + nonzeroRatBits(t) };
    }
    case "fold": {
      if (a.mirror !== undefined) {
        // Reflect two points in the mirror; the study's reflectPt and lineThrough.
        const [A, B, C] = a.mirror.split(",").map(x => BigInt(x)) as [bigint, bigint, bigint];
        const pts: [R, R][] = l.b !== 0n ? [[q(0), q(-l.c, l.b)], [q(1), q(-l.c - l.a, l.b)]] : [[q(-l.c, l.a), q(0)], [q(-l.c, l.a), q(1)]];
        const n2 = q(A * A + B * B);
        const rp = pts.map(([x, y]) => {
          const s = Qn.div(Qn.add(Qn.add(Qn.mul(q(A), x), Qn.mul(q(B), y)), q(C)), n2);
          return [Qn.sub(x, Qn.mul(q(2n * A), s)), Qn.sub(y, Qn.mul(q(2n * B), s))] as [R, R];
        });
        const dx = Qn.sub(rp[1]![0], rp[0]![0]), dy = Qn.sub(rp[1]![1], rp[0]![1]);
        const L = dx.d * dy.d;
        const k = Qn.sub(Qn.mul(dx, rp[0]![1]), Qn.mul(dy, rp[0]![0]));
        const LL = L * k.d;
        const line = normalise(dy.n * (LL / dy.d), -dx.n * (LL / dx.d), k.n * (LL / k.d)) as Line;
        const M = normalise(A, B, C) as Line;
        return { line, fee: which + 1 + mixedIntBits(M.a) + mixedIntBits(M.b) + mixedIntBits(M.c) };
      }
      if (!m || !c) return bad;
      const x0 = Qn.from(a.x0!), s = Qn.from(a.s!), y0 = Qn.add(Qn.mul(m, x0), c);
      // m′ = (T − m)/(1 + m·T), T = 2s/(1 − s²); s = ±1 gives 1/m.
      const d = Qn.sub(Qn.ONE, Qn.mul(s, s));
      let m2: R | null;
      if (Qn.isZero(d)) m2 = Qn.isZero(m) ? null : Qn.inv(m);
      else { const T = Qn.div(Qn.mul(q(2), s), d), den = Qn.add(Qn.ONE, Qn.mul(m, T)); m2 = Qn.isZero(den) ? null : Qn.div(Qn.sub(T, m), den); }
      return m2 === null ? bad : { line: through(x0, y0, m2), fee: which + 1 + stepsRatBits(x0) + ratBits(s) };
    }
  }
  throw new Error(id);
}

test("the study's model equals the engine: same result and same fee on sampled lines and arguments", () => {
  const r = rng("lens-model");
  let s: LineState = mc(1, 2);
  let compared = 0;
  const per = new Map<string, number>();
  for (let i = 0; i < 6000; i++) {
    const mu = lensMutators[r.below(lensMutators.length)]!;
    const code = mu.args(v);
    const a = code.sample(r);
    if (a !== null) {
      const wire = code.encode(a) as Record<string, string>;
      const raw = model(s.lines[0]!, mu.id, wire);
      const want = { ...raw, line: raw.line && "invalid" in raw.line ? null : raw.line };
      const got = applyPriced(lineType, v, s, mu, 0, a);
      const unchanged = want.line && `${want.line.a},${want.line.b},${want.line.c}` === lineType.encode(s);
      if (want.line === null || unchanged) assert.ok(isInvalid(got), `${mu.id} ${JSON.stringify(wire)} on ${lineType.encode(s)}: the model refuses`);
      else if (!isInvalid(got)) {
        assert.equal(lineType.encode(got.result), `${want.line.a},${want.line.b},${want.line.c}`, `${mu.id} ${JSON.stringify(wire)} on ${lineType.encode(s)}`);
        near(got.price.which + got.price.arg, want.fee, `${mu.id} ${JSON.stringify(wire)}`);
        compared++;
        per.set(mu.id, (per.get(mu.id) ?? 0) + 1);
      } else assert.match(got.invalid, /upright|limit/, `${mu.id} ${JSON.stringify(wire)} on ${lineType.encode(s)}: ${got.invalid}`);
    }
    s = walkStep(lineType, v, s, r);
  }
  for (const mu of lensMutators) assert.ok((per.get(mu.id) ?? 0) > 50, `${mu.id}: ${per.get(mu.id)}`);
  assert.ok(compared > 1000, `${compared}`);
});

test("every lens move is undone by its declared inverse at the same fee", () => {
  const r = rng("lens-inverses");
  let s: LineState = mc(2, 3);
  let checked = 0;
  for (let i = 0; i < 6000; i++) {
    const mu = lensMutators[r.below(lensMutators.length)]!;
    const a = mu.args(v).sample(r);
    if (a !== null) {
      const fwd = applyPriced(lineType, v, s, mu, 0, a);
      if (!isInvalid(fwd)) {
        assert.ok(mu.inverse.kind === "self" || mu.inverse.kind === "mutator");
        const ia = mu.inverse.kind === "self" ? a : (mu.inverse as { args(x: unknown): unknown }).args(a);
        const back = applyPriced(lineType, v, fwd.result, mu, 0, ia as never);
        assert.ok(!isInvalid(back), `${mu.id} ${JSON.stringify(mu.args(v).encode(a))} from ${lineType.encode(fwd.result)}: ${isInvalid(back) ? back.invalid : ""}`);
        assert.equal(lineType.encode(back.result), lineType.encode(s), mu.id);
        near(back.price.arg, fwd.price.arg, `${mu.id} fee`);
        checked++;
      }
    }
    s = walkStep(lineType, v, s, r);
  }
  assert.ok(checked > 1500, `${checked}`);
});

test("each lens mutator's sampler draws an argument with probability 2^−bits, and enumerate agrees", () => {
  for (const mu of lensMutators) {
    const code = mu.args(v);
    const r = rng("lens-args", mu.id);
    const n = 60_000;
    const counts = new Map<string, { a: unknown; c: number }>();
    for (let i = 0; i < n; i++) {
      const a = code.sample(r);
      if (a === null) continue;
      const key = JSON.stringify(code.encode(a));
      const e = counts.get(key);
      if (e) e.c++; else counts.set(key, { a, c: 1 });
    }
    for (const { a, c } of [...counts.values()].sort((x, y) => y.c - x.c).slice(0, 12)) {
      const p = 2 ** -code.bits(a as never);
      assert.ok(Math.abs(c / n - p) < 4 * Math.sqrt(p * (1 - p) / n) + 1e-9, `${mu.id} ${JSON.stringify(code.encode(a as never))}: ${c / n} vs ${p}`);
    }
    const listed = [...code.enumerate!(12)];
    let last = 0;
    for (const a of listed) { const b = code.bits(a); assert.ok(b <= 12 + 1e-9 && b >= last - 1e-9, mu.id); last = b; }
    const keys = new Set(listed.map(a => JSON.stringify(code.encode(a))));
    for (const { a } of counts.values()) if (code.bits(a as never) <= 12) assert.ok(keys.has(JSON.stringify(code.encode(a as never))), `${mu.id} ${JSON.stringify(code.encode(a as never))}`);
    // Round trip through the wire.
    for (const a of listed.slice(0, 40)) assert.deepEqual(code.encode(code.decode(code.encode(a))), code.encode(a));
  }
});

test("line-q-lenses: every proposal has a reverse of the same weight, level, upright and origin lines included", () => {
  const states: LineState[] = [
    ...[-2, -1, 0, 1, 2, [1, 2], [-3, 4]].flatMap(m => [-2, 0, 1, [1, 3], 5].map(c => mc(typeof m === "number" ? m : q(m[0]!, m[1]!), typeof c === "number" ? c : q(c[0]!, c[1]!)))),
    abc(1, 0, -2), abc(1, 0, 3), abc(2, 0, 1), abc(1, 0, 0),
  ];
  const r = cycleDiagnostic(lineType, v, states, 13, 5);
  assert.deepEqual(r.oneWay, {}, "one-way moves");
  for (const [id, x] of Object.entries(r.perMutator)) assert.equal(x.asymmetric, 0, `${id}: ${x.asymmetric} asymmetric pairs, worst ${x.worst} bits`);
  for (const mu of lensMutators) assert.ok((r.perMutator[mu.id]?.edges ?? 0) > 20, `${mu.id} proposed moves`);
  assert.ok(r.worstEdge < 1e-9 && r.worstCycle < 1e-9, `edge ${r.worstEdge}, loop ${r.worstCycle}`);
});
