/** @jsxRuntime automatic */
/**
 * The two lenses of the new beginner families (layered-line-rules §10.5): the crossing (solving y = 0, worked out) and
 * the table's run of longRun (a "y ÷ x" row, ticked while whole, the first miss marked). Static markup, as in
 * render.test.tsx, under the real families of v2-linear.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, type Mark, type Q, type RuleFamily } from "@workspace/v2-core";
import { longRun, fromMC, lineQ, lineType, normalise, goldenPath, type Line, type LineState } from "@workspace/v2-linear";
import { annotate, ExpandedFace, ObjectChip, RepView, repText, type RuleRef } from "../src/index.ts";

const mc = (m: number | Q, c: number | Q): LineState =>
  ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const abc = (a: number, b: number, c: number): LineState => ({ lines: [normalise(BigInt(a), BigInt(b), BigInt(c)) as Line] });
const evaluation = (family: RuleFamily<LineState, any>, s: LineState) =>
  annotate({ type: lineType, family, params: family.dealable(lineQ)[0], variant: lineQ } as RuleRef<LineState, unknown>, s).sites[0]!.evaluation;
const view = (s: LineState, rep: string, size: "compact" | "expanded", marks: readonly Mark[] = [], extra: { highlight?: string } = {}) =>
  renderToStaticMarkup(<RepView type={lineType} state={s} rep={rep} size={size} marks={marks} highlight={extra.highlight} />);
/** The opening tag of the node with this data-ref. */
const node = (html: string, k: string) => html.match(new RegExp(`<[^>]*data-ref="${k.replace(/[().=]/g, "\\$&")}"[^>]*>`))?.[0] ?? "";

test("crossing text: worked from 0 = mx + c to x, then the nearest whole number and the gap", () => {
  assert.equal(repText(lineType, mc(3, -7), "crossing"), "0 = 3x − 7, so 3x = 7, so x = 2⅓ (nearest whole number 2, off by ⅓)");
  assert.equal(repText(lineType, mc(1, -4), "crossing"), "0 = x − 4, so x = 4 (on the whole number 4)", "a repeated step is said once");
  assert.equal(repText(lineType, mc(q(-1, 2), 3), "crossing"), "0 = −½x + 3, so −½x = −3, so x = 6 (on the whole number 6)");
  assert.equal(repText(lineType, mc(0, 4), "crossing"), "a flat line (gradient 0) never crosses the x-axis, or lies right along it");
});

test("crossing scene: every step's numbers and both readouts are element nodes; a flat line shows its reason", () => {
  const html = view(mc(3, -7), "crossing", "expanded");
  for (const k of ["crossing.m", "crossing.c", "crossing.rhs", "crossing.x0", "crossing.near", "crossing.off"]) assert.ok(node(html, k), k);
  assert.equal((html.match(/class="v2v-eq-line/g) ?? []).length, 3, "three steps");
  assert.match(html, /nearest whole number <\/span><span[^>]*>2<\/span>/);
  assert.match(html, /off by <\/span><span[^>]*>⅓<\/span>/);
  assert.match(view(mc(0, 4), "crossing", "expanded"), /v2v-undef[^>]*>a flat line/);
  // The compact face keeps the answer: the last step and the readouts.
  const compact = view(mc(3, -7), "crossing", "compact");
  assert.ok(node(compact, "crossing.x0") && node(compact, "crossing.near") && node(compact, "crossing.off"));
});

test("crossing: marks land on its elements and x0 lights with the plane's x-intercept", () => {
  const e = evaluation(goldenPath, mc(3, -7));
  const html = view(mc(3, -7), "crossing", "expanded", e.marks);
  const near: Mark[] = [{ kind: "candidate", ref: { rep: "crossing", name: "near" } }];
  assert.match(node(view(mc(3, -7), "crossing", "expanded", near), "crossing.near"), /data-cand=""/);
  assert.match(node(view(mc(3, -7), "crossing", "expanded", [], { highlight: "xIntercept" }), "crossing.x0"), /data-lit=""/);
  assert.match(node(view(mc(3, -7), "cart", "expanded", [], { highlight: "xIntercept" }), "cart.xInt"), /data-lit=""/);
  // The chip never writes the worked steps: it falls back to y = mx + c.
  assert.match(renderToStaticMarkup(<ObjectChip type={lineType} state={mc(3, -7)} rep="crossing" />), /y = 3x − 7/);
  // A vertical line crosses at x = −c/a: the steps that need a gradient are left out, the answer stays.
  const vertical = view(abc(2, 0, -7), "crossing", "expanded");
  assert.ok(node(vertical, "crossing.x0") && !node(vertical, "crossing.m"));
});

