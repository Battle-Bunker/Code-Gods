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
  assert.match(t, /Secondary preference:/);
  assert.doesNotMatch(t, /tie-?break/i, "the owner's word is secondary preference, never tie-breaker");
  assert.match(t, /the closer, the better/);
  assert.match(t, /What would make it rarer/);
  assert.match(t, /\d energy/);
  // A concept has a name, never only a symbol (the owner, 15 Nov): no ⚡, ★, ↑ or ▾ standing alone.
  assert.doesNotMatch(t, /[⚡★↑↓▾✕✓✗]/u);
  assert.match(t, /→ [\d.]+ bits \(1 in/);
  assert.match(t, /your rule's main view/);
  assert.match(html, /class="v2v-ruler"/);
  assert.doesNotMatch(t, /\bstep \d|Steps to the top|within \d/);
  // The rule's own views are tabs (its main view first, ★); the rest are under "More views".
  assert.equal((html.match(/role="tab"/g) ?? []).length, new Set([tank.family.main.rep, ...tank.family.depends]).size);
  assert.match(html, /data-depends=""[^>]*data-primary=""[^>]*>line on the plane<span class="v2v-tab-main"> · main view<\/span>/);
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

test("compact face: the main part's quantity, target and distance; a cited coefficient of 1 marks its variable, never a written 1", async () => {
  const { mMeetsC } = await import("@workspace/v2-linear");
  const tri = { type: lineType, family: triangleArea, params: { A: 8 }, variant: lineQ };
  assert.match(text(renderToStaticMarkup(<CompactFace rule={tri} state={mc(2, -6)} />)), /area 9 · off by 1/);
  const mmc = { type: lineType, family: mMeetsC, params: {}, variant: lineQ };
  const html = renderToStaticMarkup(<CompactFace rule={mmc} state={mc(1, 5)} />);
  assert.match(text(html), /gradient 1, y-intercept 5 · off by 4/);
  // The mark sits on the variable (the element node is "x"); a faint "1" read as "1x" in playtest round 10.
  assert.match(html, /data-ref="si\.m"[^>]*data-focus[^>]*>(<span[^>]*>)*x</);
  assert.doesNotMatch(html, /v2v-implied|>1<\/span><span class="v2v-var">x/);
});

test("identity badges: the elements a part reads carry its role in every view, projected by meaning", async () => {
  const { primeLanding, fromMC: f, lineZ } = await import("@workspace/v2-linear");
  const rule: RuleRef<LineState, unknown> = { type: lineType, family: primeLanding as never, params: primeLanding.dealable(lineZ)[0], variant: lineZ, tieBreaker: "shared-factor" };
  const s: LineState = { lines: [f(q(6), q(25))] };
  const reps = lineType.representations.map(r => r.id);
  for (const compare of reps) {
    const html = renderToStaticMarkup(<ExpandedFace rule={rule} state={s} compare={compare} initialRep={rule.family.main.rep} />);
    const roles = [...html.matchAll(/data-ref="([^"]+)"[^>]*data-role="(main|tb)"/g)].map(m => `${m[1]}:${m[2]}`);
    assert.ok(roles.some(r => r.endsWith(":main")), `${compare}: a main-part badge somewhere: ${roles}`);
    // The x-axis landing is the main part's source; any view that shows it badges it, and the y-intercept is the tie-breaker's.
    if (/data-ref="crossing\.x0"/.test(html)) assert.match(html, /data-ref="crossing\.x0"[^>]*data-role="main"/, compare);
    if (/data-ref="si\.c"/.test(html)) assert.match(html, /data-ref="si\.c"[^>]*data-role="tb"/, compare);
  }
  // A badge is said, not only drawn: its title names the part.
  const html = renderToStaticMarkup(<ExpandedFace rule={rule} state={s} initialRep={rule.family.main.rep} />);
  assert.match(html, /data-role="main"[^>]*title="[^"]*\(main part\)"/);
});

test("a triangle too thin to see is drawn stretched in a labelled inset: its legs and its area, in both sizes", async () => {
  const { squareArea, lineZ: z } = await import("@workspace/v2-linear");
  const { RepView, annotate } = await import("../src/index.ts");
  const rule: RuleRef<LineState, unknown> = { type: lineType, family: squareArea as never, params: {}, variant: z, tieBreaker: squareArea.tieBreakers[0]!.id };
  const s: LineState = { lines: [fromMC(q(-1512), q(-1))] };   // from a real game: a steep line, a sliver of a triangle
  const e = annotate(rule, s).sites[0]!.evaluation;
  for (const size of ["compact", "expanded"] as const) {
    const html = renderToStaticMarkup(<RepView type={lineType} state={s} rep="tri" size={size} marks={e.marks} terms={e.terms} />);
    const inset = /<g class="inset">([\s\S]*?)<\/g>/.exec(html)?.[1] ?? "";
    assert.ok(inset, `${size}: the inset is drawn`);
    assert.equal((inset.match(/class="leg"/g) ?? []).length, 2, `${size}: its two legs`);
    assert.match(inset, /class="note inset-label"[^>]*>(area )?≈? ?[\d.]+/, `${size}: labelled with the area`);
  }
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
  assert.match(t, /Best for my rarity/);
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

test("a rule that does not score a line says what would make it score, with the cheapest such move (playtest round 12: Exact Change)", async () => {
  const { exactChange } = await import("@workspace/v2-linear");
  const ec: RuleRef<LineState, unknown> = { type: lineType, family: exactChange as never, params: (exactChange as never as { dealable: (v: unknown) => unknown[] }).dealable(lineQ)[0], variant: lineQ };
  const flat = mc(2, 5); // −2x + y = 5: a and b not both positive, no coins
  const compact = text(renderToStaticMarkup(<CompactFace rule={ec} state={flat} />));
  assert.match(compact, /not scoring/);
  assert.match(compact, /To score: \S/, "on by default");
  const expanded = text(renderToStaticMarkup(<ExpandedFace rule={ec} state={flat} />));
  assert.match(expanded, /does not score for your rule: .+\. To score: .+, for [\d,]+\.\d\d energy\./);
});

test("what the main part reads is always on the page, with its badge (W5: Ruler's distance² was drawn nowhere)", async () => {
  const { ruler, lineQ: v } = await import("@workspace/v2-linear");
  const r = { type: lineType, family: ruler as never, params: (ruler as never as { dealable: (x: unknown) => unknown[] }).dealable(v)[0], variant: v } as RuleRef<LineState, unknown>;
  const html = renderToStaticMarkup(<ExpandedFace rule={r} state={mc(-4, 10)} improvement={false} />);
  assert.match(html, /data-ref="norm\.dist2"[^>]*data-role="main"|data-role="main"[^>]*data-ref="norm\.dist2"/, "the distance² is listed, badged as the main part's");
});

test("expanded face: locks are drawn as marks on what they read and listed apart from the rule's parts", () => {
  // Catches: a lock drawn by a second system, mixed into the rule's parts (it is not part of the score), or missing.
  const lock = { id: "3", words: "the y-intercept is at least 10", refs: [{ rep: "si", name: "c" }], energy: 12.5 };
  const html = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} value={VALUE} active="si" onActive={() => {}} locks={[lock]} improvement={false} />);
  const t = text(html);
  assert.match(html, /data-ref="si\.c"[^>]*data-focus/);
  assert.match(t, /🔒 the y-intercept is at least 10 \(held by 12\.50 energy\)/);
  assert.doesNotMatch(text(renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} value={VALUE} active="si" onActive={() => {}} improvement={false} />)), /🔒/);
  // A lock on another line of a system is not drawn on this one.
  const other = renderToStaticMarkup(<ExpandedFace rule={tank} state={mc(-3, 10)} value={VALUE} active="si" onActive={() => {}} improvement={false}
    locks={[{ ...lock, refs: [{ rep: "si", name: "c", site: 1 }] }]} />);
  assert.doesNotMatch(other, /data-ref="si\.c"[^>]*data-focus/);
});
