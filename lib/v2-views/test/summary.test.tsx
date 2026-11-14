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
  assert.match(s.earned[0]!.why, /y-intercept 23 · on 23/, s.earned[0]!.why);
  assert.match(s.earned[0]!.why, /8\.86 bits × others' 6\.79 bits = 60\.14 points/, s.earned[0]!.why);
  assert.match(s.earnedNote, /These 3 lines earned 105\.84 of your 105\.84 points\./);
});

test("what cost: each tug-of-war with whom and the energy your agent burnt, dearest first", () => {
  const s = summarise(base);
  assert.equal(s.costs.length, 2);
  assert.match(s.costs[0]!, /^Line 4: a tug-of-war with Ada \(6 pulls\): your agent spent 28\.86 ⚡ on it\.$/);
  assert.match(s.costs[1]!, /with Ada and Bo/);
  assert.match(s.costNote ?? "", /38\.36 ⚡ in all/);
});

test("one thing to try next game: talk to whoever pulled hardest against you, about that line", () => {
  assert.match(summarise(base).next, /^Talk to Ada about line 4 before your agents pull it: you both want it\.$/);
  // No tug-of-war: make the most wanted line rarer for you, with the move that does it and its price.
  const calm = summarise({ ...base, tugs: [] });
  assert.match(calm.next, /^Line 4 is the one the others want most \(7\.55 bits\)\. .+ would make it rarer for you: [\d.]+ ⚡( for [\d.]+ bits)?\.$/, calm.next);
});

test("the component: three short sections, no steps, the noun of the object type; a grid says grid", () => {
  const t = text(renderToStaticMarkup(<GameSummary summary={summarise(base)} />));
  assert.match(t, /What earned your points/);
  assert.match(t, /What cost you/);
  assert.match(t, /Try next game/);
  assert.doesNotMatch(t, /\bstep \d|\brung\b/);
  const g = { type: gridType, family: gridType.families[0]!, params: gridType.families[0]!.dealable(grid4)[0], variant: grid4 } as RuleRef<any, unknown>;
  const gs = summarise({ rule: g, objects: [{ number: 2, state: { cells: [3, 1, 1, 3, 0, 4, 8, 0, 2, 2, 2, 2, 9, 0, 0, 3] }, points: 9, bits: 3, want: 3 }], tugs: [], total: 9 });
  const gt = text(renderToStaticMarkup(<GameSummary summary={gs} />));
  assert.match(gt, /Grid 2/);
  assert.doesNotMatch(gt, /\b[Ll]ines?\b/);
});

test("nothing scored and no tug: the summary still says one thing to try", () => {
  const s = summarise({ ...base, objects: base.objects.map(o => ({ ...o, points: 0 })), tugs: [], total: 0 });
  assert.equal(s.earned.length, 0);
  assert.match(s.earnedNote, /No line scored for you this game/);
  assert.ok(s.next.length > 10);
});
