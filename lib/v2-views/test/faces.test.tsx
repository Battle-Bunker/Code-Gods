/** @jsxRuntime automatic */
/** The faces as static markup: what a card says for a line under a two-part rule and a one-part rule. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, triangleArea, type LineState } from "@workspace/v2-linear";
import { CompactFace, ExpandedFace, type RuleRef } from "../src/index.ts";
import { emptyTank } from "../src/demo.ts";

const mc = (m: number, c: number): LineState => ({ lines: [fromMC(q(m), q(c))] });
const tank: RuleRef<LineState, Record<string, never>> = { type: lineType, family: emptyTank, params: {}, variant: lineQ };
// Empty Tank's ladder: the main part's 8 steps, then the tie-breaker's 4 at the main part's top.
const RARITIES = [0, 0.4, 0.9, 1.5, 2.1, 3.4, 4.6, 5.7, 6.8, 7.5, 8.1, 8.9, 9.6];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

test("compact face: the primary drawn with its marks, the step and the rarity", () => {
  const html = renderToStaticMarkup(<CompactFace rule={tank} state={mc(-3, 10)} />);
  assert.match(html, /data-rep="cart"/);
  assert.match(html, /data-ref="cart\.xInt"[^>]*data-focus/);
  assert.match(text(html), /5\/8/);
  assert.match(text(renderToStaticMarkup(<CompactFace rule={tank} state={mc(2, -6)} />)), /not scoring/);
});

test("expanded face: every depended representation, both parts with their steps, the next step, the ladder", () => {
  const html = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} rarities={RARITIES} />);
  const t = text(html);
  for (const rep of ["cart", "si", "seq"]) assert.match(html, new RegExp(`class="v2v-panel"[^>]*>\\s*<h4[^>]*>[^<]*`), rep);
  assert.equal((html.match(/class="v2v-panel"/g) ?? []).length, 3);
  assert.match(t, /main part step 5 of 8/);
  assert.match(t, /tie-breaker step 4 of 4/);
  assert.match(t, /✨ 3\.4 step 5 of 12/);
  assert.match(t, /Next step: .*⚡\): step \d+ of 12\./);
  assert.match(t, /Steps to the top/);
  assert.match(t, /your rule's main view/);
  // Tabs reach every representation of the line, the rule's own marked.
  assert.equal((html.match(/role="tab"/g) ?? []).length, lineType.representations.length);
  assert.match(html, /data-depends=""[^>]*data-primary=""[^>]*>line on the plane/);
});

test("expanded face: a line the rule cannot score says why and offers what brings it closer", () => {
  const t = text(renderToStaticMarkup(<ExpandedFace rule={{ type: lineType, family: triangleArea, params: { A: 8 }, variant: lineQ }} state={mc(3, 0)} />));
  assert.match(t, /does not score for your rule: the line and the axes make no triangle/);
  assert.match(t, /not scoring/);
  assert.match(t, /Next step: /);
});

test("expanded face: a controlled switcher shows the representation and the comparison it is given", () => {
  // Catches: the app's stored choice (view.showRepresentation / compareRepresentations) ignored for the face's own state.
  const html = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} active="mach" compare="gen" onActive={() => {}} onCompare={() => {}} />);
  assert.match(html, /aria-selected="true"[^>]*>function machine</);
  assert.match(html, /aria-label="general form"/);
  assert.match(html, /<option value="gen" selected="">/);
  // Uncontrolled, it opens on the rule's primary with nothing compared.
  const own = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} />);
  assert.match(own, /aria-selected="true"[^>]*>line on the plane</);
  assert.doesNotMatch(own, /aria-label="general form"/);
});

test("move line: the change, the step before → after, the rarity with its reason, points with the want", async () => {
  const { MoveLine } = await import("../src/index.ts");
  const t = text(renderToStaticMarkup(<MoveLine rule={tank} before={mc(-3, 10)} after={mc(-3, 9)} who="Your agent Tank-1" what="move the line down 1"
    rarities={RARITIES} points={{ before: 8.2, after: 16.3, want: 2.4 }} />));
  assert.match(t, /Your agent Tank-1 changed a line: y = −3x \+ 10 → y = −3x \+ 9 \(move the line down 1\)\. Up: step 5 → 12 of 12 ?\./);
  assert.match(t, /✨ rarity 3\.4 → 9\.6 \(fewer random lines score this well\)\./);
  assert.match(t, /Points on this line 8\.2 → 16\.3 \(the others want it 2\.4\)\./);
  const t2 = text(renderToStaticMarkup(<MoveLine rule={tank} before={mc(-3, 10)} after={mc(-3, 9)} who="Your agent" rarities={RARITIES}
    points={{ before: 8.2, after: 7.9, want: 1.1, wantBefore: 2.4 }} />));
  assert.match(t2, /the others want it 1\.1, was 2\.4\): because the others want this line less now/);
});

test("compact face: says 'step n of N', each part's step, the reason when not scoring, and the next move", () => {
  const t = text(renderToStaticMarkup(<CompactFace rule={tank} state={mc(-3, 10)} next />));
  assert.match(t, /step 5 of 12/);
  assert.match(t, /main 5\/8/);
  assert.match(t, /tie-break 4\/4/);
  assert.match(t, /next: .* → step \d+/);
  const html = renderToStaticMarkup(<CompactFace rule={tank} state={mc(-3, 10)} next />);
  assert.match(html, /data-next=""/, "the next line drawn on the plane");
  assert.match(text(renderToStaticMarkup(<CompactFace rule={tank} state={mc(2, -6)} />)), /not scoring this tank is not draining/);
});

test("plane: two cited points at the same place get one label", async () => {
  const { crossingCheck } = await import("@workspace/v2-linear");
  const { RepView, annotate } = await import("../src/index.ts");
  const rule = { type: lineType, family: crossingCheck, params: { k: 1, q: 4 }, variant: lineQ };
  const s = mc(-1, 5); // y(1) = 4 and x(4) = 1: both at (1, 4)
  const e = annotate(rule, s).sites[0]!.evaluation;
  const html = renderToStaticMarkup(<RepView type={lineType} state={s} rep="cart" size="expanded" marks={e.marks} terms={e.terms} />);
  assert.equal((html.match(/\(1, 4\)/g) ?? []).length - (html.match(/<title>[^<]*\(1, 4\)/g) ?? []).length, 1);
});

test("compact face: the main part's quantity, target and distance; a cited implicit coefficient is shown", async () => {
  const { mMeetsC } = await import("@workspace/v2-linear");
  const tri = { type: lineType, family: triangleArea, params: { A: 8 }, variant: lineQ };
  assert.match(text(renderToStaticMarkup(<CompactFace rule={tri} state={mc(2, -6)} />)), /area 9, target 8 · off by 1/);
  const mmc = { type: lineType, family: mMeetsC, params: {}, variant: lineQ };
  const html = renderToStaticMarkup(<CompactFace rule={mmc} state={mc(1, 5)} />);
  assert.match(text(html), /gradient 1, y-intercept 5 · off by 4/);
  assert.match(html, /data-ref="si\.m"[^>]*>(<span[^>]*>)?<span class="v2v-implied">1<\/span>/);
});
