/** @jsxRuntime automatic */
/**
 * The two lenses of the new beginner families (layered-line-rules §10.5): the crossing (solving y = 0, worked out) and
 * the table's run of multiples (a "y ÷ x" row, ticked while whole, the first miss marked). Static markup, as in
 * render.test.tsx, under the real families of v2-linear.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, type Mark, type Q, type RuleFamily } from "@workspace/v2-core";
import { divisibilityLadder, fromMC, lineQ, lineType, normalise, wholeCrossing, type Line, type LineState } from "@workspace/v2-linear";
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
  const e = evaluation(wholeCrossing, mc(3, -7));
  const html = view(mc(3, -7), "crossing", "expanded", e.marks);
  assert.match(node(html, "crossing.x0"), /data-focus=""/);
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

test("table: the y ÷ x row is drawn only when a rule cites it, ticks the run and marks the first miss", () => {
  const s = mc(6, 6); // 12, 18, 24 are multiples of 1, 2, 3; 30 is not a multiple of 4
  assert.doesNotMatch(view(s, "table", "expanded"), /y ÷ x/);
  const e = evaluation(divisibilityLadder, s);
  const html = view(s, "table", "expanded", e.marks);
  assert.match(html, /<th scope="row">y ÷ x<\/th>/);
  for (const x of [1, 2, 3]) {
    assert.match(node(html, `table.q(x=${x})`), /data-focus=""/);
    assert.match(html, new RegExp(`<td[^>]*data-run=""[^>]*>(?:(?!</td>).)*data-ref="table\\.q\\(x=${x}\\)"(?:(?!</td>).)*>whole<`), `x = ${x} ticked and in the run`);
  }
  assert.match(html, /<td[^>]*data-miss=""[^>]*>(?:(?!<\/td>).)*data-ref="table\.q\(x=4\)"(?:(?!<\/td>).)*>not whole</, "x = 4 is the miss");
  assert.equal((html.match(/>not whole</g) ?? []).length, 1, "only the first miss is crossed");
  assert.equal((html.match(/data-run=""/g) ?? []).length, 9, "the run's three columns: header, y and y ÷ x");
  assert.match(html, /data-ref="table\.q\(x=6\)"(?:(?!<\/td>).)*>whole</, "a later whole quotient is still ticked");
  assert.match(html, /4 does not divide y\(4\): the run stops here/);
  // The compact table starts at x = 1, where the row has cells, and keeps the run's focus.
  const compact = view(s, "table", "compact", e.marks);
  assert.ok(node(compact, "table.q(x=1)") && !node(compact, "table.y(x=0)"));
});

test("table: a line through (0, 0) has no run to count, and its table draws no y ÷ x row", () => {
  const e = evaluation(divisibilityLadder, mc(3, 0));
  assert.ok("undefined" in e.terms.find(t => t.id === "ladder")!.value);
  assert.doesNotMatch(view(mc(3, 0), "table", "expanded", e.marks), /y ÷ x/);
});

test("the expanded faces of both families draw their lenses", () => {
  const face = (family: RuleFamily<LineState, any>, s: LineState) =>
    renderToStaticMarkup(<ExpandedFace rule={{ type: lineType, family, params: family.dealable(lineQ)[0], variant: lineQ }} state={s} />);
  assert.match(face(wholeCrossing, mc(3, -7)), /data-rep="crossing"/);
  assert.match(face(divisibilityLadder, mc(6, 6)), /data-rep="table"[\s\S]*y ÷ x/);
});
