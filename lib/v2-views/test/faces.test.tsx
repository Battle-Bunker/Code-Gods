/** @jsxRuntime automatic */
/** The faces as static markup: what a card says for a line under a two-part rule and a one-part rule. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q, type Score } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, squareTriangle, type LineState } from "@workspace/v2-linear";
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
  assert.match(t, /bits of energy/);
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
  assert.match(t, /Secondary preference:/);
  assert.doesNotMatch(t, /tie-?break/i, "the owner's word is secondary preference, never tie-breaker");
  assert.match(t, /the closer, the better/);
  assert.match(t, /What would make it rarer/);
  assert.match(t, /\d energy/);
  // A concept has a name, never only a symbol (the owner, 15 Nov): no ⚡, ★, ↑ or ▾ standing alone.
  assert.doesNotMatch(t, /[⚡★↑↓▾✕✓✗]/u);
  assert.match(t, /→ [\d.]+ bits of energy/);
  assert.match(t, /your rule's main view/);
  assert.match(html, /class="v2v-ruler"/);
  assert.doesNotMatch(t, /\bstep \d|Steps to the top|within \d/);
  // The rule's own views are tabs (its main view first, ★); the rest are under "More views".
  assert.equal((html.match(/role="tab"/g) ?? []).length, new Set([tank.family.main.rep, ...tank.family.depends]).size);
  assert.match(html, /data-depends=""[^>]*data-primary=""[^>]*>line on the plane<span class="v2v-tab-main"> · main view<\/span>/);
  assert.match(t, /More views/);
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
  assert.match(t, /Energy [\d.]+ → [\d.]+ bits \(dearer to reach from a random line\)\./);
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

test("the climb: each move's points with the others' total and the change from now, best for points first, “good for both” marked, unavailable when another line holds it", async () => {
  const { moves } = await import("../src/index.ts");
  const s = mc(-3, 10);
  const list = moves(tank, s, VALUE, { k: 4 });
  assert.ok(list.length >= 2, `${list.length} moves`);
  // The others' total at each candidate (the server's sum; here made up): the last one suits them best.
  const others = new Map(list.map((m, i) => [lineType.encode(m.after), 2 + i * 3] as const));
  const at = (x: LineState) => others.get(lineType.encode(x)) ?? null;
  const html = renderToStaticMarkup(<ExpandedFace rule={tank} state={s} value={VALUE} others={{ now: 2.5, at }} />);
  const t = text(html);
  assert.match(t, /Best for points/);
  assert.match(t, /Best for my energy/);
  assert.match(t, /your [\d.]+ bits × others' [\d.]+ bits [=≈] [\d.,]+ points \([+−][\d.,]+ from now\)/);
  const shown = [...html.matchAll(/data-points="([\d.]+)"/g)].map(x => Number(x[1]));
  assert.deepEqual([...shown].sort((a, b) => b - a), shown, "descending points");
  assert.match(html, /data-both=""/, "a candidate raising both is marked");
  assert.match(t, /The climb from here: “.+” takes your points from [\d.,]+ points? to [\d.,]+ points/);
  assert.doesNotMatch(html, /button-propose|button-hold/, "no destination: no propose, no hold");
  // The hint proposes no state to settle on and hold (CLAUDE.md: settle-and-hold is the bug the game avoids).
  assert.doesNotMatch(t, /reason to undo|nobody has/, "no settle-and-hold");
  // Another line already holds the best candidate's state: it is not available, with the reason, and drops to the end.
  const bestKey = [...others.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const taken = (x: LineState) => (lineType.encode(x) === bestKey ? 5 : null);
  const h2 = renderToStaticMarkup(<ExpandedFace rule={tank} state={s} value={VALUE} others={{ now: 2.5, at, taken }} />);
  assert.match(text(h2), /Not available: line 5 is already like this, and no two lines may be the same\./);
  assert.match(h2, /data-unavailable=""[^]*<\/ol>/);
  assert.ok(h2.lastIndexOf("data-unavailable") > h2.lastIndexOf("data-points"), "the unavailable one is listed last");
});

test("stuck: when no move raises the points from here, the face says so", async () => {
  const { moves } = await import("../src/index.ts");
  const s = mc(-3, 10);
  const list = moves(tank, s, VALUE, { k: 4 });
  const html = renderToStaticMarkup(<ExpandedFace rule={tank} state={s} value={VALUE} moves={list} others={{ now: 1000, at: () => 0.01 }} />);
  assert.match(text(html), /Stuck here: no single move raises your points above/);
});

test("a blurred others' total can be negative: points use max(0, others), so no candidate shows negative points", async () => {
  const { moves } = await import("../src/index.ts");
  const s = mc(-3, 10);
  const list = moves(tank, s, VALUE, { k: 4 });
  const html = renderToStaticMarkup(<ExpandedFace rule={tank} state={s} value={VALUE} moves={list} others={{ now: -3, at: () => -2, approx: true }} />);
  for (const p of [...html.matchAll(/data-points="([^"]+)"/g)].map(x => Number(x[1]))) assert.ok(p >= 0, `points ${p}`);
  assert.doesNotMatch(text(html), /−[\d.,]+ points/, "no negative points written");
});

test("expanded face: locks are drawn as marks on what they read and listed apart from the rule's parts", () => {
  // Catches: a lock drawn by a second system, mixed into the rule's parts (it is not part of the score), or missing.
  const lock = { id: "3", words: "the y-intercept is at least 10", refs: [{ rep: "si", name: "c" }], energy: 12.5 };
  const html = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} value={VALUE} active="si" onActive={() => {}} locks={[lock]} improvement={false} />);
  const t = text(html);
  assert.match(html, /data-ref="si\.c"[^>]*data-focus/);
  assert.match(t, /Lock: the y-intercept is at least 10 \(held by 12\.50 energy\)/);
  assert.doesNotMatch(text(renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} value={VALUE} active="si" onActive={() => {}} improvement={false} />)), /Lock:/);
  // A lock on another line of a system is not drawn on this one.
  const other = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} value={VALUE} active="si" onActive={() => {}} improvement={false}
    locks={[{ ...lock, refs: [{ rep: "si", name: "c", site: 1 }] }]} />);
  assert.doesNotMatch(other, /data-ref="si\.c"[^>]*data-focus/);
});
