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
const rule: RuleRef<LineState, unknown> = { type: lineType, family: primeLanding as never, params: { ends: 3 }, variant: lineZ, tieBreaker: "big-prime" };
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
  assert.match(s.earned[0]!.chain, /^● main part: y-intercept 23 · on 23$/, s.earned[0]!.chain);
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
  assert.equal(s.costs[0]!.text, "You and Ada pulled line 4 back and forth (6 pulls, 28.86 energy).");
  assert.match(s.costs[1]!.text, /You and Ada and Bo|You, Ada and Bo/);
  assert.match(s.costNote ?? "", /38\.36 energy in all/);
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
  assert.doesNotMatch(gt, /\b[Ll]ines?\b/);
});

test("one thing to try next game: on a contested line, climb with the moves that raise both; no destination to hold", () => {
  const people = summarise(base);
  assert.equal(people.next.number, 4);
  assert.equal(people.next.text, "Next game, when you and another player pull the same line back and forth, look on the line for the moves marked “good for both”: they raise the points for you both, so climb with those and tell each other in chat. This game it was line 4.");
  const practice = summarise({ ...base, tugs: base.tugs.map(t => ({ ...t, practice: true })) });
  assert.match(practice.next.text, /^Next game, when your agent and another player's pull the same line back and forth, have it take the moves marked “good for both” on the line/);
  assert.equal(summarise({ ...base, rotates: true }).next.text.endsWith("This game it was line 4."), false, "in a rotation: the lesson only");
  for (const s of [people, practice]) assert.doesNotMatch(s.next.text, /TARGET|SETTLE|hold it|settle/i);
  // No tug-of-war: make the most wanted line rarer for you, with the move that does it and its price.
  const calm = summarise({ ...base, tugs: [] });
  assert.match(calm.next.text, /^Line 4 is the one the others want most \(7\.55 bits\)\. Try “.+” on it: [\d.]+ energy( for [\d.]+ bits for you)?\.$/, calm.next);
});

test("contested lines: each said as climbed together or undone, under its own heading", () => {
  const step = (by: string, b: [number, number], w: [number, number]) => ({ by, before: { rarityBits: b[0], want: w[0], points: b[0] * w[0] }, after: { rarityBits: b[1], want: w[1], points: b[1] * w[1] } });
  const s = summarise({ ...base, climbs: [
    { number: 4, moves: [step("you", [2, 3], [4, 3]), step("Ada", [3, 2], [3, 4]), step("you", [2, 3], [4, 3]), step("Ada", [3, 2], [3, 4])] },
    { number: 7, moves: [step("you", [2, 2.5], [3, 3.5]), step("Bo", [2.5, 3], [3.5, 4])] },
    { number: 9, moves: [step("you", [1, 2], [1, 1])] },
  ] });
  assert.deepEqual(s.contested.map(c => [c.number, c.kind]), [[4, "undoing"], [7, "together"]], "a line only your agents moved is not contested");
  const t = text(renderToStaticMarkup(<GameSummary summary={s} rule={rule} />));
  assert.match(t, /Contested lines Line 4: you and Ada undid each other's moves \(4 moves\)/);
  assert.match(t, /Line 7: you and Bo climbed together, every move raising the points: your points 6\.00 → 12\.00 points\./);
  assert.doesNotMatch(text(renderToStaticMarkup(<GameSummary summary={summarise(base)} rule={rule} />)), /Contested lines/);
});

test("nothing scored and no tug: the summary still says one thing to try", () => {
  const s = summarise({ ...base, objects: base.objects.map(o => ({ ...o, points: 0 })), tugs: [], total: 0 });
  assert.equal(s.earned.length, 0);
  assert.match(s.earnedNote, /No line scored for you this game/);
  assert.ok(s.next.text.length > 10);
});

test("a partial act log says so: the costs are from the moves read", () => {
  const s = summarise({ ...base, movesRead: 1000 });
  assert.match(s.costNote ?? "", /from your last 1,000 moves/);
});


test("try next game: on a line the player's rule does not score, the move offered makes it score (playtest round 12: Exact Change)", async () => {
  const { exactChange, fromMC, lineQ, lineType } = await import("@workspace/v2-linear");
  const { q } = await import("@workspace/v2-core");
  const { moves } = await import("../src/index.ts");
  const ec = { type: lineType, family: exactChange, params: (exactChange as never as { dealable: (v: unknown) => unknown[] }).dealable(lineQ)[0], variant: lineQ } as never;
  const state = { lines: [fromMC(q(2), q(5))] };
  const s = summarise({ rule: ec, objects: [{ number: 3, state, points: 0, bits: 0, want: 6 }], tugs: [], total: 0 });
  const scoring = moves(ec, state, null, { k: 1 }).find(m => m.utility !== null)!;
  assert.ok(scoring);
  assert.match(s.next.text, new RegExp(`Try “${scoring.words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}”`), s.next.text);
});
