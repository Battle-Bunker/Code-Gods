/** @jsxRuntime automatic */
/**
 * Line rules whose target had no mark (the coordinator's gaps, 16 Nov): Ruler draws the circle round (0, 0) its distance should reach.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, ruler, sameOnBothRulers, type LineState } from "@workspace/v2-linear";
import { annotate, ExpandedFace, type RuleRef } from "../src/index.ts";

const mc = (m: number, c: number): LineState => ({ lines: [fromMC(q(m), q(c))] });

test("Ruler: the circle round (0, 0) at the prime the distance² should round down to", () => {
  const rule = { type: lineType, family: ruler, params: { ends: 3 }, variant: lineQ } as RuleRef<LineState, unknown>;
  const s = mc(0, 5);   // distance² 25; the nearest window of a prime ending in 3 is [23, 24)
  const marks = annotate(rule, s).sites[0]!.parts[0]!.marks;
  assert.ok(marks.some(m => m.kind === "candidate" && m.ref.name === "circle" && m.ref.args?.r2 === "23"));
  const html = renderToStaticMarkup(<ExpandedFace rule={rule} state={s} improvement={false} initialRep="norm" />);
  assert.match(html, /data-circle=""/);
  assert.match(html, /distance² 23/);
});

test("Square Area: the drawn square is the rung's (its root), the one the main part and the preference read", async () => {
  const { evaluateSite } = await import("@workspace/v2-core");
  const { squareArea } = await import("@workspace/v2-linear");
  const e = evaluateSite(lineType, squareArea, { ends: 9 }, mc(-2, 14), lineQ, 0, null);   // area 49 = 7²
  assert.ok(e.marks.some(m => m.kind === "candidate" && "ref" in m && m.ref.rep === "tri" && m.ref.name === "square" && m.ref.args?.s === "7"), "the square 7 × 7 is drawn")
});

test("Same on Both Rulers: the meeting point is the reading, the palindrome it should round to the target", () => {
  const rule = { type: lineType, family: sameOnBothRulers, params: { meets: 1, digits: "odd" }, variant: lineQ } as RuleRef<LineState, unknown>;
  const s = mc(0, 120);   // y = 120 meets y = x at x = 120, nearest the palindrome 121
  const html = renderToStaticMarkup(<ExpandedFace rule={rule} state={s} improvement={false} initialRep="cart" />);
  assert.match(html, /data-ref="cart\.pointAtX\(q=120\)"[^>]*data-focus/);
  assert.match(html, /data-ref="cart\.xAxisMark\(x=121\)"[^>]*data-cand/);
});
