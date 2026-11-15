/** @jsxRuntime automatic */
/**
 * Scenes of an object made of several lines (a two-line system, lib/v2-pair): given equations stacked with "and", and a
 * plane with every line on it, each in its own colour, a moved line keeping its colour across a move.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, type ElementRef, type ElementValue, type Q } from "@workspace/v2-core";
import type { EquationScene } from "@workspace/v2-linear";
import { equationRenderer, planeRenderer } from "../src/render/register.ts";
import { text as eqText } from "../src/equation-text.ts";
import type { RenderProps } from "../src/scene.ts";

const num = (x: number | Q): ElementValue => ({ kind: "number", q: typeof x === "number" ? q(x) : x });
const seg = (x1: number, y1: number, x2: number, y2: number): ElementValue => ({ kind: "segment", from: { x: q(x1), y: q(y1) }, to: { x: q(x2), y: q(y2) } });
const pt = (x: number, y: number): ElementValue => ({ kind: "point", x: q(x), y: q(y) });
const valuesOf = (m: Record<string, ElementValue>) => (r: ElementRef): ElementValue => m[r.name] ?? { kind: "undefined", reason: `no ${r.name}` };
function props<D>(scene: D, values: Record<string, ElementValue>, extra: Partial<RenderProps> = {}, size: "compact" | "expanded" = "expanded"): RenderProps {
  return {
    rep: "pair", scene: scene as never, values: valuesOf(values), marks: [], terms: new Map(), size, highlight: null,
    meaningOf: r => r.name, labelOf: r => r.name, ...extra,
  } as RenderProps;
}
const BAD = /(^|[^\d/⁄.])1x|−1x|\b0x|\+ 0\b|\+ −|− −|1y\b/;
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

const eqs: EquationScene = {
  kind: "equation", given: 2,
  template: [{ el: "a1" }, "x + ", { el: "b1" }, "y = ", { el: "e1" }],
  steps: [[{ el: "a2" }, "x + ", { el: "b2" }, "y = ", { el: "e2" }]],
} as EquationScene;

test("given equations: the text says them with 'and', not 'so'; each written tidily", () => {
  const v = valuesOf({ a1: num(2), b1: num(1), e1: num(5), a2: num(1), b2: num(-1), e2: num(1) });
  const t = eqText(eqs, v, "eqs");
  assert.equal(t, "2x + y = 5 and x − y = 1");
  assert.doesNotMatch(t, BAD);
  // Two equal given equations are both kept (never dropped as a repeated step).
  const same = valuesOf({ a1: num(1), b1: num(1), e1: num(2), a2: num(1), b2: num(1), e2: num(2) });
  assert.equal(eqText(eqs, same, "eqs"), "x + y = 2 and x + y = 2");
  // A given line that cannot be written says why, in its place.
  const si: EquationScene = { kind: "equation", given: 2, template: ["y = ", { el: "m1" }, "x + ", { el: "c1" }], steps: [["y = ", { el: "m2" }, "x + ", { el: "c2" }]] } as EquationScene;
  const up = valuesOf({ m1: num(2), c1: num(0), m2: { kind: "undefined", reason: "line 2 is upright: x = 3" } });
  assert.equal(eqText(si, up, "si"), "y = 2x and line 2 is upright: x = 3");
  // Steps after the given lines still read "so".
  const solve: EquationScene = { kind: "equation", given: 2, template: [{ el: "a1" }, "x + ", { el: "b1" }, "y = ", { el: "e1" }],
    steps: [[{ el: "a2" }, "x + ", { el: "b2" }, "y = ", { el: "e2" }], ["x = ", { el: "x" }]] } as EquationScene;
  assert.equal(eqText(solve, valuesOf({ a1: num(2), b1: num(1), e1: num(5), a2: num(1), b2: num(-1), e2: num(1), x: num(2) }), "eqs"), "2x + y = 5 and x − y = 1, so x = 2");
});

test("given equations drawn: both stacked, in the compact size too", () => {
  const v = { a1: num(2), b1: num(1), e1: num(5), a2: num(1), b2: num(-1), e2: num(1) };
  for (const size of ["compact", "expanded"] as const) {
    const html = renderToStaticMarkup(<>{equationRenderer.render(props(eqs, v, {}, size) as never)}</>);
    const t = strip(html);
    assert.match(t, /2x \+ y = 5/, size);
    assert.match(t, /x − y = 1/, size);
    assert.equal((html.match(/data-given=""/g) ?? []).length, 2, size);
  }
});

const plane = {
  kind: "plane", window: [q(-10), q(-10), q(10), q(10)],
  items: [{ draw: "line", el: { rep: "pair", name: "L1" } }, { draw: "line", el: { rep: "pair", name: "L2" } }, { draw: "point", el: { rep: "pair", name: "P" } }],
};

test("a plane with two lines draws both, each with its own colour and title, and says both", () => {
  const v = { L1: seg(0, 5, 1, 3), L2: seg(0, -1, 1, 0), P: pt(2, 1) };
  const html = renderToStaticMarkup(<>{planeRenderer.render(props(plane, v) as never)}</>);
  assert.match(html, /data-line="1"[^>]*>[\s\S]*?class="line"/);
  assert.match(html, /data-line="2"/);
  assert.match(html, /<title>L2<\/title>/);
  const t = planeRenderer.text(plane as never, valuesOf(v), "pair");
  assert.match(t, /line 1 through/);
  assert.match(t, /line 2 through/);
});

test("across a move, a line keeps its colour although the canonical order flipped; the moved line's old place is drawn faint", () => {
  // Before: L1 = y = −2x + 5, L2 = y = x − 1. The move shifts y = x − 1 up to y = x + 9, which now sorts first.
  const before = valuesOf({ L1: seg(0, 5, 1, 3), L2: seg(0, -1, 1, 0) });
  const now = { L1: seg(0, 9, 1, 10), L2: seg(0, 5, 1, 3) };
  const html = renderToStaticMarkup(<>{planeRenderer.render(props(plane, now, { before }) as never)}</>);
  // y = −2x + 5 was colour 1 and is unchanged: it stays colour 1 although it is now item L2.
  const colourOf = (name: string) => html.match(new RegExp(`data-line="(\\d)"[^>]*data-ref="pair\\.${name}"|data-ref="pair\\.${name}"[^>]*data-line="(\\d)"`));
  const c2 = colourOf("L2"), c1 = colourOf("L1");
  assert.equal(c2?.[1] ?? c2?.[2], "1");
  assert.equal(c1?.[1] ?? c1?.[2], "2");
  // The moved line's old place: one faint line, in the moved line's colour.
  assert.equal((html.match(/class="line-was"/g) ?? []).length, 1);
  assert.match(html, /class="line-was"[^>]*data-line="2"|data-line="2"[^>]*class="line-was"/);
});
