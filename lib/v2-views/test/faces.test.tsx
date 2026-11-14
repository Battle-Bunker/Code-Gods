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
const RARITIES = [0, 0.4, 0.9, 1.5, 2.1, 3.4, 4.6, 5.7, 6.8];
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
  assert.match(t, /✨ 3\.4 step 5 of 8/);
  assert.match(t, /Next step: .*⚡\): step 8 of 8\./);
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
