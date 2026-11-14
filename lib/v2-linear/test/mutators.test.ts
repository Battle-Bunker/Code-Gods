import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCall, applyPriced, isInvalid, rng, walkStep, type Call, type Variant } from "@workspace/v2-core";
import { lineType, lineQ, lineZ, mutators, describeLine } from "../src/index.ts";
import { abc, mc } from "./helpers.ts";

const after = (v: Variant, s: ReturnType<typeof mc>, mutator: string, args: Record<string, string>) => {
  const r = applyCall(lineType, v, s, { mutator, site: 0, args });
  if (isInvalid(r)) return r.invalid;
  return `${describeLine(r.result.lines[0]!)} @ ${r.price.total.toFixed(2)}`;
};

test("each mutator's effect and price on worked examples (spec §12.4)", () => {
  const which = Math.log2(9);
  const s = mc(1, 5);  // y = x + 5
  assert.equal(after(lineZ, s, "seq.step", { k: "2" }), `y = 3x + 3 @ ${(which + 4).toFixed(2)}`);   // no surcharge: φ 10 → 10
  assert.equal(after(lineZ, s, "si.shift", { k: "-4" }), `y = x + 1 @ ${(which + 6).toFixed(2)}`);
  assert.equal(after(lineZ, mc(2, 1), "cart.pivot", { x0: "1", k: "1" }), "y = 3x @ " + (which + 3 + 2).toFixed(2));
  assert.equal(after(lineZ, mc(2, 1), "cart.slide", { u: "1", v: "0" }), "y = 2x - 1 @ " + (which + 3 + 1).toFixed(2));
  assert.equal(after(lineZ, mc(2, 1), "cart.mirror", { axis: "x" }), "y = -2x - 1 @ " + (which + 2).toFixed(2));
  assert.equal(after(lineZ, mc(2, 1), "cart.mirror", { axis: "diagonal" }), "this board only has whole-number gradients and intercepts");
  assert.equal(after(lineQ, mc(2, 1), "cart.mirror", { axis: "diagonal" }), "y = 1/2x - 1/2 @ " + (which + 2).toFixed(2)); // (−2, 1, −1) becomes (−1, 2, 1): same read length
  assert.equal(after(lineQ, abc(0, 1, -3), "cart.mirror", { axis: "diagonal" }), "x = 3 @ " + (which + 2).toFixed(2));
  assert.equal(after(lineZ, mc(2, 2), "mach.stretch", { f: "1/2" }), "y = x + 1 @ " + (which + 2 + 3).toFixed(2));
  // y = x + 4 crosses the x-axis at −4; moving that to −2 keeps (0, 4): y = 2x + 4. Read length 13 → 15.
  assert.equal(after(lineQ, mc(1, 4), "int.move", { axis: "x", k: "2" }), "y = 2x + 4 @ " + (which + 1 + 5 + 2).toFixed(2));
  assert.equal(after(lineQ, mc(2, 1), "gen.nudge", { which: "b", k: "1" }), "y = x + 1/2 @ " + (which + Math.log2(3) + 2 + 2).toFixed(2)); // (−2, 2, −1): read length 11 → 13

});

test("the confining surcharge: growing the read length costs the growth", () => {
  const r = applyCall(lineType, lineZ, mc(0, 0), { mutator: "si.shift", site: 0, args: { k: "8" } });
  assert.ok(!isInvalid(r));
  assert.equal(r.price.surcharge, lineType.readLength(mc(0, 8), lineZ) - 2);
  const back = applyCall(lineType, lineZ, mc(0, 8), { mutator: "si.shift", site: 0, args: { k: "-8" } });
  assert.ok(!isInvalid(back) && back.price.surcharge === 0);
});

test("refused calls: no change, bad arguments, outside the board", () => {
  const s = mc(1, 1);
  const bad: Call[] = [
    { mutator: "si.shift", site: 0, args: { k: "0" } },
    { mutator: "si.shift", site: 0, args: { k: "1/2" } },
    { mutator: "si.shift", site: 0, args: {} },
    { mutator: "si.shift", site: 1, args: { k: "1" } },
    { mutator: "mach.stretch", site: 0, args: { f: "1" } },
    { mutator: "cart.slide", site: 0, args: { u: "1", v: "1" } },  // y = x + 1 slid along itself
    { mutator: "nope", site: 0, args: {} },
  ];
  for (const c of bad) assert.ok(isInvalid(applyCall(lineType, lineZ, s, c)), JSON.stringify(c));
});

test("declared inverses undo their mutator wherever both calls are valid", () => {
  for (const v of [lineZ, lineQ]) {
    const r = rng("inverses", v.id);
    let s = mc(1, 2);
    let checked = 0;
    for (let i = 0; i < 4000; i++) {
      const m = mutators[r.below(mutators.length)]!;
      const a = m.args(v).sample(r);
      if (a === null || m.inverse.kind === "none") continue;
      const fwd = applyPriced(lineType, v, s, m, 0, a);
      if (isInvalid(fwd)) continue;
      const inv = m.inverse.kind === "self" ? m : mutators.find(x => x.id === (m.inverse as { id: string }).id)!;
      const ia = m.inverse.kind === "self" ? a : m.inverse.args(a);
      const back = applyPriced(lineType, v, fwd.result, inv, 0, ia);
      if (isInvalid(back)) { assert.equal(m.inverse.kind, "partial", `${m.id} ${JSON.stringify(m.args(v).encode(a))}: ${back.invalid}`); continue; }
      assert.equal(lineType.encode(back.result), lineType.encode(s), `${m.id} on ${lineType.encode(s)}`);
      checked++;
      s = walkStep(lineType, v, s, r);
    }
    assert.ok(checked > 300, `${v.id}: ${checked}`);
  }
});

test("every mutator's argument sampler draws each argument with probability 2^−bits", () => {
  for (const v of [lineZ, lineQ]) {
    for (const m of mutators) {
      const code = m.args(v);
      const r = rng("args", v.id, m.id);
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
        assert.ok(Math.abs(c / n - p) < 4 * Math.sqrt(p * (1 - p) / n) + 1e-9, `${v.id} ${m.id} ${JSON.stringify(code.encode(a as never))}: ${c / n} vs ${p}`);
      }
    }
  }
});
