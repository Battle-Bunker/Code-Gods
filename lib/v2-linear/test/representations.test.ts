import { test } from "node:test";
import assert from "node:assert/strict";
import { elementValue, Qn, q, ref, rng, walkStep, type ElementValue } from "@workspace/v2-core";
import { lineType, lineQ, type EquationScene, type TableScene } from "../src/index.ts";
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

test("crossing: solving y = 0 gives the crossing exactly, its nearest whole number and the gap", () => {
  const s = mc(3, -7);
  assert.equal(val(s, "crossing", "x0"), "7/3");
  assert.equal(val(s, "crossing", "near"), "2");
  assert.equal(val(s, "crossing", "off"), "1/3");
  assert.equal(val(s, "crossing", "rhs"), "7");
  assert.equal(val(mc(-2, 5), "crossing", "x0"), "5/2");
  assert.equal(val(mc(-2, 5), "crossing", "near"), "3", "a half rounds up");
  assert.equal(val(mc(-4, -10), "crossing", "near"), "-2", "−2½ rounds up to −2");
  assert.equal(val(mc(2, -6), "crossing", "off"), "0");
  // A vertical line still crosses the x-axis, though it has no gradient to solve with.
  assert.equal(val(abc(2, 0, -7), "crossing", "x0"), "7/2");
  assert.equal(val(abc(2, 0, -7), "crossing", "m"), "undefined");
});

test("crossing: a flat line has no crossing, with a reason in words", () => {
  for (const name of ["x0", "near", "off"]) {
    const v = elementValue(lineType, mc(0, 4), ref("crossing", name));
    assert.ok(v.kind === "undefined" && /flat/.test(v.reason), name);
  }
});

test("crossing.x0 shares its meaning with the plane's x-intercept, on a corpus", () => {
  const r = rng("crossing");
  let s = mc(1, 1);
  for (let i = 0; i < 300; i++) {
    s = walkStep(lineType, lineQ, s, r);
    const p = elementValue(lineType, s, ref("cart", "xInt"));
    assert.equal(show(elementValue(lineType, s, ref("crossing", "x0"))), p.kind === "point" ? W(p.x) : "undefined", lineType.encode(s));
  }
  const decl = (rep: string, name: string) => lineType.representations.find(x => x.id === rep)!.elements.find(e => e.name === name)!;
  assert.equal(decl("crossing", "x0").meaning, decl("cart", "xInt").meaning);
});

test("table.q is y(x) ÷ x, and table.run counts the multiples from x = 1 up to the first miss", () => {
  const s = mc(6, 6); // y(1) = 12, y(2) = 18, y(3) = 24, y(4) = 30: 12, 9, 8, then 7½
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(x => val(s, "table", "q", { x })), ["12", "9", "8", "15/2", "36/5", "7"]);
  assert.equal(val(s, "table", "run"), "3");
  assert.equal(val(mc(5, 60), "table", "run"), "6", "60 is a multiple of 1 … 6, not of 7");
  assert.equal(val(mc(2, 1), "table", "run"), "1");
  assert.equal(val(mc(q(1, 2), 0), "table", "run"), "0", "y(1) = ½ is not a multiple of 1");
  assert.equal(val(mc(q(1, 2), q(1, 2)), "table", "run"), "1", "y(1) = 1, y(2) = 3/2");
  assert.equal(val(mc(-3, 12), "table", "q", { x: -2 }), "-9");
  for (const [s0, name, args] of [[s, "q", { x: 0 }], [mc(3, 0), "run", undefined], [abc(1, 0, -3), "q", { x: 1 }]] as const) {
    const v = elementValue(lineType, s0, ref("table", name, args));
    assert.ok(v.kind === "undefined" && v.reason.length > 10, `${name} ${lineType.encode(s0)}`);
  }
});

test("the table lays out a y ÷ x row under the y row, one cell per column, none at x = 0", () => {
  const scene = lineType.representations.find(r => r.id === "table")!.layout(mc(6, 6), 0) as TableScene;
  assert.equal(scene.kind, "table");
  const row = scene.rows?.[0];
  assert.ok(row && row.check === "whole");
  assert.equal(row.cells.length, scene.columns.length);
  scene.columns.forEach((c, i) => {
    const x = Number(c.el.args!.x);
    assert.deepEqual(row.cells[i], x === 0 ? null : ref("table", "q", { x }, 0));
  });
});

test("the crossing scene works y = 0 out step by step and cites only its own elements", () => {
  const scene = lineType.representations.find(r => r.id === "crossing")!.layout(mc(3, -7), 0) as EquationScene;
  assert.equal(scene.kind, "equation");
  assert.equal(scene.steps?.length, 2);
  const names = [scene.template, ...scene.steps!, scene.caption!].flat().filter((x): x is { el: string } => typeof x !== "string").map(x => x.el);
  assert.deepEqual(names, ["m", "c", "m", "rhs", "x0", "near", "off"]);
  for (const n of names) assert.notEqual(elementValue(lineType, mc(3, -7), ref("crossing", n)).kind, "undefined", n);
});
