import { test } from "node:test";
import assert from "node:assert/strict";
import { elementValue, Qn, ref, rng, walkStep, type ElementValue } from "@workspace/v2-core";
import { lineType, lineQ } from "../src/index.ts";
import { abc, mc, W } from "./helpers.ts";

const show = (v: ElementValue): string => {
  switch (v.kind) {
    case "number": return W(v.q);
    case "point": return `(${W(v.x)}, ${W(v.y)})`;
    case "segment": return `(${W(v.from.x)}, ${W(v.from.y)})-(${W(v.to.x)}, ${W(v.to.y)})`;
    case "symbol": return v.text;
    case "undefined": return `undefined`;
  }
};
const val = (s: ReturnType<typeof mc>, rep: string, name: string, args?: Record<string, number>) => show(elementValue(lineType, s, ref(rep, name, args)));

test("y = 2x + 1 in every representation", () => {
  const s = mc(2, 1);
  assert.equal(val(s, "si", "m"), "2");
  assert.equal(val(s, "si", "y", { q: 3 }), "7");
  assert.deepEqual(["a", "b", "c", "sum"].map(n => val(s, "gen", n)), ["-2", "1", "-1", "-2"]);
  assert.equal(val(s, "cart", "xInt"), "(-1/2, 0)");
  assert.equal(val(s, "cart", "yInt"), "(0, 1)");
  assert.equal(val(s, "cart", "line"), "(-13/2, -12)-(11/2, 12)");
  assert.equal(val(s, "cart", "pointAtY", { q: 5 }), "(2, 5)");
  assert.equal(val(s, "tri", "area"), "1/4");
  assert.equal(val(s, "tri", "hyp2"), "5/4");
  assert.equal(val(s, "seq", "first"), "3");
  assert.equal(val(s, "seq", "term", { n: 10 }), "21");
  assert.equal(val(s, "mach", "reverse", { q: 5 }), "2");
  assert.equal(val(s, "mach", "twice", { q: 1 }), "7");
});

test("undefined elements carry a sentence", () => {
  const vertical = abc(1, 0, -3), flat = mc(0, 2), origin = mc(3, 0);
  for (const [s, rep, name] of [[vertical, "si", "m"], [flat, "cart", "xInt"], [flat, "tri", "area"], [origin, "tri", "area"], [vertical, "cart", "yInt"]] as const) {
    const v = elementValue(lineType, s, ref(rep, name));
    assert.equal(v.kind, "undefined", `${rep}.${name}`);
    assert.ok(v.kind === "undefined" && v.reason.length > 10);
  }
  assert.equal(elementValue(lineType, flat, ref("mach", "reverse", { q: 1 })).kind, "undefined");
});

test("elements that share a meaning agree on a corpus of lines", () => {
  const r = rng("meanings");
  let s = mc(1, 1);
  const groups: Record<string, [string, string, (v: ElementValue) => string][]> = {
    yIntercept: [["si", "c", show], ["seq", "zeroth", show], ["mach", "plus", show], ["cart", "yInt", v => (v.kind === "point" ? W(v.y) : "undefined")]],
    gradient: [["si", "m", show], ["seq", "step", show], ["mach", "times", show], ["cart", "slope", show]],
  };
  for (let i = 0; i < 300; i++) {
    s = walkStep(lineType, lineQ, s, r);
    for (const [meaning, els] of Object.entries(groups)) {
      const seen = new Set(els.map(([rep, name, f]) => f(elementValue(lineType, s, ref(rep, name)))));
      assert.equal(seen.size, 1, `${meaning} on ${lineType.encode(s)}: ${[...seen]}`);
    }
    for (const x of [-1, 0, 4]) {
      const vals = new Set([
        show(elementValue(lineType, s, ref("si", "y", { q: x }))),
        show(elementValue(lineType, s, ref("mach", "out", { q: x }))),
        show(elementValue(lineType, s, ref("seq", "term", { n: x }))),
        (v => (v.kind === "point" ? W(v.y) : "undefined"))(elementValue(lineType, s, ref("cart", "pointAtX", { q: x }))),
      ]);
      assert.equal(vals.size, 1, `valueAt(${x}) on ${lineType.encode(s)}`);
    }
  }
  assert.ok(Qn.ONE);
});

test("dynamic elements check their arguments", () => {
  assert.throws(() => elementValue(lineType, mc(1, 1), ref("si", "y")));
  assert.throws(() => elementValue(lineType, mc(1, 1), ref("seq", "term", { n: "1/2" })));
});

test("every layout cites elements that exist", () => {
  for (const rep of lineType.representations) {
    const scene = rep.layout(mc(2, 3), 0);
    const refs = scene.kind === "plane" ? scene.items.map(i => i.el)
      : scene.kind === "machine" ? [scene.input, scene.output] : scene.kind === "sequence" ? scene.terms.map(t => t.el) : [];
    for (const r of refs) assert.notEqual(elementValue(lineType, mc(2, 3), r).kind, "undefined", `${rep.id}: ${r.rep}.${r.name}`);
  }
  const m = lineType.representations.find(r => r.id === "mach")!.layout(mc(2, 3), 0);
  assert.ok(m.kind === "machine");
  assert.equal(show(elementValue(lineType, mc(2, 3), m.input)), "1");
  assert.equal(show(elementValue(lineType, mc(2, 3), m.output)), "5");
});
