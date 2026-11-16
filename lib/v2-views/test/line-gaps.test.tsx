/** @jsxRuntime automatic */
/**
 * Line rules whose target had no mark (the coordinator's gaps, 16 Nov): Ruler draws the circle round (0, 0) its distance should reach.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, ruler, type LineState } from "@workspace/v2-linear";
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

test("Square Area: the preferences read the nearest square (its root), so the drawn square is theirs too", async () => {
  const { evaluateSite } = await import("@workspace/v2-core");
  const { squareArea } = await import("@workspace/v2-linear");
  const e = evaluateSite(lineType, squareArea, {}, mc(-1, 7), lineQ, 0, null);   // area 24½: nearest square 25 = 5²
  for (const id of ["spf", "lpf"]) {
    const t = e.terms.find(x => x.id === id)!;
    assert.ok(t.from.some(r => r.rep === "tri" && r.name === "square" && r.args?.s === "5"), `${id} cites the square`);
  }
});
