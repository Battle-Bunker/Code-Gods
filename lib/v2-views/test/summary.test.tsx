/** @jsxRuntime automatic */
/**
 * The end of a game (coordinator, 14 November): the player is told what earned their points (their best lines through
 * the contributor chain), what cost them (energy burnt in tug-of-wars, with whom) and one concrete thing to try next
 * game, for lines and grids. Pure model plus its component.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { q } from "@workspace/v2-core";
import { fromMC, lineType, lineZ, primeLanding, type LineState } from "@workspace/v2-linear";
import { grid4, gridType } from "@workspace/v2-grid";
import { GameSummary, summarise, type RuleRef, type SummaryInput } from "../src/index.ts";

const mc = (m: number, c: number): LineState => ({ lines: [fromMC(q(m), q(c))] });
const rule: RuleRef<LineState, unknown> = { type: lineType, family: primeLanding as never, params: {}, variant: lineZ, tieBreaker: "big-prime" };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const base: SummaryInput<LineState> = {
  rule,
  objects: [
    { number: 7, state: mc(6, 23), points: 60.14, bits: 8.86, want: 6.79 },
    { number: 3, state: mc(2, 25), points: 12.5, bits: 2.1, want: 5.95 },
    { number: 9, state: mc(-1, 4), points: 0, bits: 0, want: 3 },
    { number: 4, state: mc(3, 19), points: 33.2, bits: 4.4, want: 7.55 },
  ],
  tugs: [
    { number: 4, withNames: ["Ada"], flips: 6, mySpend: 28.86 },
    { number: 3, withNames: ["Ada", "Bo"], flips: 3, mySpend: 9.5 },
  ],
  total: 105.84,
};

test("what earned the points: the best lines first, each said through its rule's main part, with bits × others'", () => {
  const s = summarise(base);
  assert.deepEqual(s.earned.map(e => e.number), [7, 4, 3], "best first, nothing that scored nothing");
  assert.match(s.earned[0]!.chain, /^● y-intercept 23 · on 23$/, s.earned[0]!.chain);
  // Self-consistent arithmetic (the app's one formatter): "=" where the shown factors multiply to the shown product…
  assert.equal(s.earned[0]!.formula, "your 8.86 bits × others' 6.79 bits = 60.16 points");
  // …and "≈" where they do not (10.22 × 11.05 = 112.93, but the full values make 112.97).
  const close = summarise({ ...base, objects: [{ number: 25, state: mc(6, 23), points: 112.97, bits: 10.2249, want: 11.0481 }], tugs: [] });
  assert.equal(close.earned[0]!.formula, "your 10.22 bits × others' 11.05 bits ≈ 112.97 points");
  assert.match(s.earnedNote, /These 3 lines earned 105\.84 of your 105\.84 points\./);
});

test("what cost: each tug-of-war with whom and the energy your agent burnt, dearest first", () => {
  const s = summarise(base);
  assert.equal(s.costs.length, 2);
  assert.equal(s.costs[0]!.text, "You and Ada pulled line 4 back and forth (6 pulls, 28.86 ⚡).");
  assert.match(s.costs[1]!.text, /You and Ada and Bo|You, Ada and Bo/);
  assert.match(s.costNote ?? "", /38\.36 ⚡ in all/);
});

test("one thing to try next game: talk to whoever pulled hardest against you, about that line", () => {
  // What pays (rule-compatibility.md): settling a contested line at a state both like and holding it, not keeping off.
  assert.match(summarise(base).next.text, /^Next game, tell each other what your rules want and settle line 4 at a line that suits you both; then both hold it\./);
  assert.equal(summarise(base).next.number, 4);
  // No tug-of-war: make the most wanted line rarer for you, with the move that does it and its price.
  const calm = summarise({ ...base, tugs: [] });
  assert.match(calm.next.text, /^Line 4 is the one the others want most \(7\.55 bits\)\. Try “.+” on it: [\d.]+ ⚡( for [\d.]+ bits for you)?\.$/, calm.next);
  // Practice partners do not read chat: the advice is about your own agent instead.
  const practice = summarise({ ...base, tugs: base.tugs.map(t => ({ ...t, practice: true })) });
  // Practice partners do not talk: the state the pull passed through that was worth most to you, to hold next time.
  const held = summarise({ ...base, tugs: base.tugs.map((t, i) => ({ ...t, practice: true, ...(i === 0 ? { best: { state: mc(3, 23), points: 41.5 } } : {}) })) });
  assert.equal(held.next.text, "Next game, hold line 4 at y = 3x + 23: it was worth 41.50 points to you there. In your agent's code: TARGET = { m: 3, c: 23 }; SETTLE = [4].");
  assert.equal(practice.next.text, "Next game, settle line 4 at a line your rule likes and hold it there.");
});

test("the component: three short sections, no steps, the noun of the object type; a grid says grid", () => {
  const html = renderToStaticMarkup(<GameSummary summary={summarise(base)} rule={rule} onOpen={() => {}} />);
  const t = text(html);
  // "Try next game" first and strongest; each earned line with its compact face, tappable.
  assert.ok(t.indexOf("Try next game") < t.indexOf("What earned your points"), "the next step comes first");
  assert.equal((html.match(/class="v2v v2v-compact-face"/g) ?? []).length, 3, "a face beside each earned line");
  assert.equal((html.match(/<button[^>]*class="v2v-summary-open"/g) ?? []).length, 3, "each earned line opens its object");
  assert.match(t, /What earned your points/);
  assert.match(t, /What cost you/);
  assert.match(t, /Try next game/);
  assert.doesNotMatch(t, /\bstep \d|\brung\b/);
  const g = { type: gridType, family: gridType.families[0]!, params: gridType.families[0]!.dealable(grid4)[0], variant: grid4 } as RuleRef<any, unknown>;
  const gs = summarise({ rule: g, objects: [{ number: 2, state: { cells: [3, 1, 1, 3, 0, 4, 8, 0, 2, 2, 2, 2, 9, 0, 0, 3] }, points: 9, bits: 3, want: 3 }], tugs: [], total: 9 });
  const gt = text(renderToStaticMarkup(<GameSummary summary={gs} rule={g} />));
  assert.match(gt, /Grid 2/);
  // A held board is drawn in the advice, not written as sixteen digits.
  const board = { cells: [5, 3, 2, 9, 3, 7, 3, 5, 5, 2, 4, 7, 9, 5, 1, 2] };
  const hold = summarise({ rule: g, objects: [], tugs: [{ number: 22, withNames: ["Practice partner 1"], flips: 3, mySpend: 9, practice: true, best: { state: board, points: 783.27 } }], total: 0 });
  assert.match(hold.next.text, /^Next game, hold grid 22 like this: it was worth 783\.27 points to you there\./);
  const hh = renderToStaticMarkup(<GameSummary summary={hold} rule={g} />);
  assert.match(hh, /data-testid="text-summary-next"[\s\S]*class="v2v-grid"/, "the board drawn in the advice");
  assert.doesNotMatch(text(hh), /5 3 2 9 \//);
  // A board is held the same way (#538): its TARGET is its sixteen digits, row by row.
  const gr = summarise({ rule: g, objects: [], tugs: [{ number: 22, withNames: ["Practice partner 1"], flips: 3, mySpend: 9, practice: true, best: { state: board, points: 783.27 } }], total: 0 });
  assert.match(gr.next.text, /In your agent's code: TARGET = "5329373552479512"; SETTLE = \[22\]\.$/, gr.next.text);
  assert.doesNotMatch(gt, /\b[Ll]ines?\b/);
});

test("nothing scored and no tug: the summary still says one thing to try", () => {
  const s = summarise({ ...base, objects: base.objects.map(o => ({ ...o, points: 0 })), tugs: [], total: 0 });
  assert.equal(s.earned.length, 0);
  assert.match(s.earnedNote, /No line scored for you this game/);
  assert.ok(s.next.text.length > 10);
});

test("the hold advice names the agent's settings for that line", () => {
  const held = summarise({ ...base, tugs: [{ number: 24, withNames: ["Practice partner 1"], flips: 3, mySpend: 22.46, practice: true, best: { state: mc(2, 7), points: 79.5 } }] });
  assert.equal(held.next.text, "Next game, hold line 24 at y = 2x + 7: it was worth 79.50 points to you there. In your agent's code: TARGET = { m: 2, c: 7 }; SETTLE = [24].");
  const people = summarise(base);
  assert.match(people.next.text, /then both hold it\. In your agent's code: SETTLE = \[4\] and TARGET = the line you agree\.$/);
});

test("in a rotation (the next game deals another rule) the advice is the lesson, with this game's line as its example", () => {
  const practice = summarise({ ...base, rotates: true, tugs: [{ number: 24, withNames: ["Practice partner 1"], flips: 3, mySpend: 22.46, practice: true, best: { state: mc(2, 7), points: 79.5 } }] });
  assert.equal(practice.next.text, "Next game, when your agent and another player's pull the same line back and forth, hold it at a line your rule likes: set TARGET and SETTLE in your agent's code. This game, line 24 at y = 2x + 7 was worth 79.50 points to you.");
  const people = summarise({ ...base, rotates: true });
  assert.equal(people.next.text, "Next game, when you and another player pull the same line back and forth, tell each other what your rules want, settle it at a line that suits you both, and both hold it: TARGET and SETTLE in your agent's code.");
});

test("a partial act log says so: the costs are from the moves read", () => {
  const s = summarise({ ...base, movesRead: 1000 });
  assert.match(s.costNote ?? "", /from your last 1,000 moves/);
});

test("the hold advice writes the settings in the agent's own language", () => {
  const held = summarise({ ...base, language: "python", tugs: [{ number: 24, withNames: ["Practice partner 1"], flips: 3, mySpend: 22.46, practice: true, best: { state: mc(2, 7), points: 79.5 } }] });
  assert.match(held.next.text, /In your agent's code: TARGET = \{"m": 2, "c": 7\}; SETTLE = \[24\]\.$/);
});
