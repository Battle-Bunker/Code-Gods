/** @jsxRuntime automatic */
/** The faces as static markup: what a card says for a line under a two-part rule and a one-part rule. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, type Score } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, triangleArea, type LineState } from "@workspace/v2-linear";
import { CompactFace, ExpandedFace, type RuleRef } from "../src/index.ts";
import { emptyTank } from "../src/demo.ts";

const mc = (m: number, c: number): LineState => ({ lines: [fromMC(q(m), q(c))] });
const tank: RuleRef<LineState, Record<string, never>> = { type: lineType, family: emptyTank, params: {}, variant: lineQ };
/** A stand-in value function: more bits the smaller the main gap (the real one comes from the rule's calibrated record). */
const VALUE = (u: Score) => (u === null ? 0 : 6 + 3 * (Number(u[0]!.n) / Number(u[0]!.d)) + (u[1] ? Number(u[1].n) / Number(u[1].d) / 10 : 0));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

test("compact face: the primary drawn with its marks, the bits, one line per part; no steps", () => {
  const html = renderToStaticMarkup(<CompactFace rule={tank} state={mc(-3, 10)} value={VALUE} />);
  assert.match(html, /data-rep="cart"/);
  assert.match(html, /data-ref="cart\.xInt"[^>]*data-focus/);
  const t = text(html);
  assert.match(t, /bits \(1 in [\d.,]+ by chance\)/);
  assert.match(t, /● /);
  assert.match(t, /◆ /);
  assert.doesNotMatch(t, /step \d|\d\/\d+ /);
  assert.match(text(renderToStaticMarkup(<CompactFace rule={tank} state={mc(2, -6)} value={VALUE} />)), /not scoring/);
});

test("expanded face: the rule's views, both parts with their rulers, the moves with new bits; no steps or ladder", () => {
  const html = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} value={VALUE} />);
  const t = text(html);
  assert.equal((html.match(/class="v2v-panel"/g) ?? []).length, 3);
  assert.match(t, /Main part:/);
  assert.match(t, /Tie-breaker:/);
  assert.match(t, /the closer, the better/);
  assert.match(t, /What would make it rarer/);
  assert.match(t, /⚡/);
  assert.match(t, /→ [\d.]+ bits \(1 in/);
  assert.match(t, /your rule's main view/);
  assert.match(html, /class="v2v-ruler"/);
  assert.doesNotMatch(t, /\bstep \d|Steps to the top|within \d/);
  // The rule's own views are tabs (its main view first, ★); the rest are under "More views".
  assert.equal((html.match(/role="tab"/g) ?? []).length, new Set([tank.family.main.rep, ...tank.family.depends]).size);
  assert.match(html, /data-depends=""[^>]*data-primary=""[^>]*>line on the plane/);
  assert.match(t, /More views/);
});

test("expanded face: a line the rule cannot score says why and offers what would make it score", () => {
  const t = text(renderToStaticMarkup(<ExpandedFace rule={{ type: lineType, family: triangleArea, params: { A: 8 }, variant: lineQ }} state={mc(3, 0)} />));
  assert.match(t, /does not score for your rule: the line and the axes make no triangle/);
  assert.match(t, /What would make it rarer/);
});

test("expanded face: a controlled switcher shows the representation and the comparison it is given", () => {
  // Catches: the app's stored choice (view.showRepresentation / compareRepresentations) ignored for the face's own state.
  const html = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} active="mach" compare="gen" onActive={() => {}} onCompare={() => {}} improvement={false} />);
  assert.match(html, /aria-selected="true"[^>]*>function machine</);
  assert.match(html, /aria-label="general form"/);
  assert.match(html, /<option value="gen" selected="">/);
  // Uncontrolled, it opens on the rule's primary with nothing compared.
  const own = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} improvement={false} />);
  assert.match(own, /aria-selected="true"[^>]*>line on the plane</);
  assert.doesNotMatch(own, /aria-label="general form"/);
});

test("move line: the change, what it did to the rule's quantities, the rarity with its reason, points with the want", async () => {
  const { MoveLine } = await import("../src/index.ts");
  const t = text(renderToStaticMarkup(<MoveLine rule={tank} before={mc(-3, 10)} after={mc(-3, 9)} who="Your agent Tank-1" what="move the line down 1"
    value={VALUE} points={{ before: 8.2, after: 16.3, want: 2.4 }} />));
  assert.match(t, /Your agent Tank-1 changed a line: y = −3x \+ 10 → y = −3x \+ 9 \(move the line down 1\)\./);
  assert.match(t, /Rarity [\d.]+ → [\d.]+ bits, 1 in [\d.,]+ by chance \(fewer random lines are this good\)\./);
  assert.match(t, /Points on this line 8\.20 → 16\.30 \(the others want it 2\.40\)\./);
  assert.doesNotMatch(t, /step \d/);
  const t2 = text(renderToStaticMarkup(<MoveLine rule={tank} before={mc(-3, 10)} after={mc(-3, 9)} who="Your agent" value={VALUE}
    points={{ before: 8.2, after: 7.9, want: 1.1, wantBefore: 2.4 }} />));
  assert.match(t2, /the others want it 1\.10, was 2\.40\): because the others want this line less now/);
});

test("move line: without the rule's value function, up or down is the score's own", async () => {
  const { MoveLine, annotate } = await import("../src/index.ts");
  const [x, y] = [mc(-3, 10), mc(-3, 9)];
  const better = (await import("@workspace/v2-core")).compareScores(annotate(tank, y).score, annotate(tank, x).score);
  assert.notEqual(better, 0, "the two lines score differently");
  const dir = (b: LineState, c: LineState) => /data-dir="(\w+)"/.exec(renderToStaticMarkup(<MoveLine rule={tank} before={b} after={c} who="You" />))![1];
  assert.equal(dir(x, y), better > 0 ? "up" : "down");
  assert.equal(dir(y, x), better > 0 ? "down" : "up");
});

test("compact face: the next move drawn and said, with its new bits; the reason when not scoring", () => {
  const t = text(renderToStaticMarkup(<CompactFace rule={tank} state={mc(-3, 10)} value={VALUE} next />));
  assert.match(t, /next: .* → [\d.]+ bits/);
  const html = renderToStaticMarkup(<CompactFace rule={tank} state={mc(-3, 10)} value={VALUE} next />);
  assert.match(html, /data-next=""/, "the next line drawn on the plane");
  assert.match(text(renderToStaticMarkup(<CompactFace rule={tank} state={mc(2, -6)} />)), /this tank is not draining/);
});

test("plane: two cited points at the same place get one label", async () => {
  const { crossingCheck } = await import("@workspace/v2-linear");
  const { RepView, annotate } = await import("../src/index.ts");
  const rule = { type: lineType, family: crossingCheck, params: { k: 1, q: 4 }, variant: lineQ };
  const s = mc(-1, 5); // y(1) = 4 and x(4) = 1: both at (1, 4)
  const e = annotate(rule, s).sites[0]!.evaluation;
  const html = renderToStaticMarkup(<RepView type={lineType} state={s} rep="cart" size="expanded" marks={e.marks} terms={e.terms} />);
  // Count the drawn labels only (not titles or the drawing's accessible name).
  const drawn = html.replace(/<title>[^<]*<\/title>/g, "").replace(/aria-label="[^"]*"/g, "");
  assert.equal((drawn.match(/\(1, 4\)/g) ?? []).length, 1);
});

test("compact face: the main part's quantity, target and distance; a cited implicit coefficient is shown", async () => {
  const { mMeetsC } = await import("@workspace/v2-linear");
  const tri = { type: lineType, family: triangleArea, params: { A: 8 }, variant: lineQ };
  assert.match(text(renderToStaticMarkup(<CompactFace rule={tri} state={mc(2, -6)} />)), /area 9 · off by 1/);
  const mmc = { type: lineType, family: mMeetsC, params: {}, variant: lineQ };
  const html = renderToStaticMarkup(<CompactFace rule={mmc} state={mc(1, 5)} />);
  assert.match(text(html), /gradient 1, y-intercept 5 · off by 4/);
  assert.match(html, /data-ref="si\.m"[^>]*>(<span[^>]*>)?<span class="v2v-implied">1<\/span>/);
});
