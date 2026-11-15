/**
 * The plane's viewport and labels (docs/engine-v2/annotations-design.md §6): the rule supplies the interesting points
 * (through its marks and reads), d3-scale fits and nices the window, and the labels of every priority-1 point are placed
 * at rest, on screen and without overlap. Hard cases from real games and every pool rule's top state, at the phone and
 * desktop boxes and the compact face.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { q, type Q, type RuleFamily } from "@workspace/v2-core";
import {
  divisibilityLadder, fromMC, lineQ, lineZ, lineType, normalise, primeGradient, primeLanding, primeStaircase, sameOnBothRulers,
  squareArea, treasure, wholeCrossing, type Line, type LineState,
} from "@workspace/v2-linear";
import { annotate, meaningKey, projectRef, type RuleRef } from "../src/index.ts";
import { fitViewport } from "../src/plot/viewport.ts";
import { placeLabels, overlap } from "../src/plot/labels.ts";
import { planeLayout, planeRenderer } from "../src/render/plane.tsx";
import { valuesOf } from "../src/rep-view.tsx";

const mc = (m: number | Q, c: number | Q): LineState => ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const abc = (a: number, b: number, c: number): LineState => ({ lines: [normalise(BigInt(a), BigInt(b), BigInt(c)) as Line] });

// ---------------------------------------------------------------- the pure parts

test("fitViewport: every point inside, nice ticks, equal scales when they keep things legible", () => {
  const v = fitViewport({ points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }], box: { w: 320, h: 220 }, pad: 16 });
  assert.equal(v.equal, true);
  for (const p of [[0, 0], [4, 0], [0, 3]]) {
    const X = v.sx(p[0]!), Y = v.sy(p[1]!);
    assert.ok(X >= 16 && X <= 304 && Y >= 16 && Y <= 204, `${p} at ${X},${Y}`);
  }
  assert.ok(v.xTicks.length >= 3 && v.yTicks.length >= 3);
  assert.ok(v.xTicks.every(t => Number.isInteger(t)), `nice x ticks ${v.xTicks}`);
  // A steep spread (0.2 across, 59 up) cannot share a scale: the axes go independent and say so.
  const s = fitViewport({ points: [{ x: 0, y: 0 }, { x: -0.2, y: 0 }, { x: 0, y: 59 }], box: { w: 320, h: 220 }, pad: 16 });
  assert.equal(s.equal, false);
  assert.ok(s.sx(0) - s.sx(-0.2) >= 30, "the 0.2-wide span is readable");
});

test("placeLabels: deterministic, inside the box, no overlaps, avoids the line", () => {
  const reqs = [0, 1, 2, 3].map(i => ({ id: `p${i}`, x: 100 + i * 4, y: 100, w: 60, h: 12, priority: 1 as const }));
  const out = placeLabels(reqs, [{ x1: 0, y1: 0, x2: 320, y2: 220 }], { w: 320, h: 220 });
  assert.deepEqual(out, placeLabels(reqs, [{ x1: 0, y1: 0, x2: 320, y2: 220 }], { w: 320, h: 220 }));
  const shown = out.filter(l => l.shown);
  assert.equal(shown.length, 4);
  for (const a of shown) {
    assert.ok(a.box.x >= 0 && a.box.y >= 0 && a.box.x + a.box.w <= 320 && a.box.y + a.box.h <= 220, `${a.id} on screen`);
    for (const b of shown) if (a !== b) assert.equal(overlap(a.box, b.box), 0, `${a.id} overlaps ${b.id}`);
  }
});

// ---------------------------------------------------------------- the hard cases

type Case = { name: string; family: RuleFamily<LineState, any>; params?: unknown; tb?: string; state: LineState; variant?: typeof lineQ };
const CASES: Case[] = [
  { name: "y = 290x + 59, Square Area", family: squareArea, state: mc(290, 59), variant: lineZ },
  { name: "y = 290x + 59, Prime Landing", family: primeLanding, state: mc(290, 59), variant: lineZ },
  { name: "near-horizontal y = x/6 + 7/6, Whole Crossing", family: wholeCrossing, state: mc(q(1, 6), q(7, 6)) },
  { name: "far from the origin, c = 27,720, Divisibility Ladder", family: divisibilityLadder, state: mc(27720, 27720), variant: lineZ },
  { name: "far from the origin, c = 27,720, Prime Landing", family: primeLanding, state: mc(5, 27720), variant: lineZ },
  { name: "through the origin, Square Area (no triangle)", family: squareArea, state: mc(3, 0) },
  { name: "through the origin, Whole Crossing", family: wholeCrossing, state: mc(3, 0) },
  { name: "near-vertical, huge x-intercept", family: wholeCrossing, state: abc(1000, -1, -90001) },
  { name: "near-vertical, Prime Gradient", family: primeGradient, state: mc(997, 3), variant: lineZ },
  // Each pool rule's typical top state.
  { name: "Prime Landing top", family: primeLanding, state: mc(6, 31), variant: lineZ },
  { name: "Square Area top", family: squareArea, state: mc(-1, 46) /* area 1058 = not square */, variant: lineZ },
  { name: "Square Area exact", family: squareArea, state: mc(-2, 14), variant: lineZ },
  { name: "Whole Crossing top", family: wholeCrossing, state: mc(1, -37), variant: lineZ },
  { name: "Divisibility Ladder top", family: divisibilityLadder, state: mc(27720, 27720), variant: lineZ },
  { name: "Treasure top", family: treasure, state: mc(17, 3), variant: lineZ },
  { name: "Same on Both Rulers top", family: sameOnBothRulers, state: mc(-1, 2442), variant: lineZ },
  { name: "Prime Gradient top", family: primeGradient, state: mc(31, 7), variant: lineZ },
  { name: "Prime Staircase", family: primeStaircase, state: mc(6, 5), variant: lineZ },
];
/**
 * The boxes the renderer lays out in: the compact face and the expanded drawing (the SVG then scales to the card at
 * every width, so labels keep their places; e2e/annotations-lines.ts measures them in the browser at 390 and 1440 px).
 */
const BOXES = [{ name: "compact", size: "compact" as const, box: planeRenderer.box.compact }, { name: "expanded", size: "expanded" as const, box: planeRenderer.box.expanded }];

for (const c of CASES) {
  test(`plane: ${c.name}: every priority-1 point in view, its label on screen and clear`, () => {
    const variant = c.variant ?? lineQ;
    const rule: RuleRef<LineState, unknown> = { type: lineType, family: c.family, params: c.params ?? c.family.dealable(variant)[0], variant };
    const e = annotate(rule, c.state).sites[0]!.evaluation;
    for (const rep of ["cart", "tri"]) {
      const scene = lineType.representations.find(r => r.id === rep)!.layout(c.state, 0);
      for (const b of BOXES) {
        const L = planeLayout({ rep, scene: scene as never, values: valuesOf(lineType, c.state, 0), marks: e.marks, terms: new Map(e.terms.map(t => [t.id, t])), size: b.size, box: b.box, project: (r, reps) => projectRef(lineType, r, reps) });
        if (!L) continue; // nothing drawable (the line cannot be drawn: its sentence is shown instead)
        const where = `${rep} ${b.name}`;
        for (const p of L.points.filter(p => p.priority === 1)) {
          assert.ok(p.px >= 0 && p.px <= b.box.w && p.py >= 0 && p.py <= b.box.h, `${where}: ${p.id} at ${p.px.toFixed(1)},${p.py.toFixed(1)} is outside the box`);
        }
        const labels = L.labels.filter(l => l.priority === 1);
        for (const l of labels) {
          assert.ok(l.shown, `${where}: the label of ${l.id} is hidden`);
          assert.ok(l.box.x >= -0.5 && l.box.y >= -0.5 && l.box.x + l.box.w <= b.box.w + 0.5 && l.box.y + l.box.h <= b.box.h + 0.5, `${where}: the label "${l.text}" leaves the box`);
          for (const o of labels) if (o !== l) assert.equal(overlap(l.box, o.box), 0, `${where}: "${l.text}" overlaps "${o.text}"`);
        }
        // The axes' numbers drawn never sit under a priority-1 label or a point.
        for (const t of L.ticks) {
          for (const l of labels) assert.equal(overlap(t.box, l.box), 0, `${where}: tick ${t.text} under "${l.text}"`);
          for (const pt of L.points.filter(x => x.priority === 1)) assert.equal(overlap(t.box, { x: pt.px - 5, y: pt.py - 5, w: 10, h: 10 }), 0, `${where}: tick ${t.text} under ${pt.id}`);
        }
        // The line itself is always drawn across the window when it exists.
        assert.ok(L.line, `${where}: the line is drawn`);
      }
    }
  });
}

test("an area rule's triangle labels both legs at rest", () => {
  const rule: RuleRef<LineState, unknown> = { type: lineType, family: squareArea, params: {}, variant: lineZ };
  const s = mc(-1, 7);
  const e = annotate(rule, s).sites[0]!.evaluation;
  const scene = lineType.representations.find(r => r.id === "tri")!.layout(s, 0);
  const L = planeLayout({ rep: "tri", scene: scene as never, values: valuesOf(lineType, s, 0), marks: e.marks, terms: new Map(e.terms.map(t => [t.id, t])), size: "expanded", box: planeRenderer.box.expanded, project: (r, reps) => projectRef(lineType, r, reps) })!;
  const legs = L.labels.filter(l => l.shown && l.text.startsWith("leg"));
  assert.deepEqual(legs.map(l => l.text).sort(), ["leg 7", "leg 7"]);
  assert.ok(legs.every(l => l.priority === 1));
});

test("Square Area draws the nearest square beside the triangle on equal scales, and not on unequal ones", () => {
  const rule: RuleRef<LineState, unknown> = { type: lineType, family: squareArea, params: {}, variant: lineZ };
  const layout = (s: LineState) => {
    const e = annotate(rule, s).sites[0]!.evaluation;
    const scene = lineType.representations.find(r => r.id === "tri")!.layout(s, 0);
    return planeLayout({ rep: "tri", scene: scene as never, values: valuesOf(lineType, s, 0), marks: e.marks, terms: new Map(e.terms.map(t => [t.id, t])), size: "expanded", box: planeRenderer.box.expanded, project: (r, reps) => projectRef(lineType, r, reps), meaningOf: r => meaningKey(lineType, r) })!;
  };
  const L = layout(mc(-1, 7)); // area 24½, nearest square 25 = 5 × 5
  assert.ok(L.square, "the square is drawn");
  assert.equal(L.square!.label, "5 × 5 = 25");
  assert.ok(L.square!.x >= 0 && L.square!.y >= 0 && L.square!.x + L.square!.side <= L.view.box.w && L.square!.y + L.square!.side <= L.view.box.h, "inside the drawing");
  assert.equal(layout(mc(290, 59)).square, null, "unequal scales: no square");
});
