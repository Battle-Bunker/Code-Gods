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
import { fromMC, lineType, lineZ, longRun, type LineState, lineQ } from "@workspace/v2-linear";
import { grid4, gridType } from "@workspace/v2-grid";
import { GameSummary, summarise, type RuleRef, type SummaryInput } from "../src/index.ts";

const mc = (m: number, c: number): LineState => ({ lines: [fromMC(q(m), q(c))] });
const rule: RuleRef<LineState, unknown> = { type: lineType, family: longRun as never, params: longRun.dealable(lineQ)[0], variant: lineZ, tieBreaker: null };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const base: SummaryInput<LineState> = {
  rule,
  objects: [
    { number: 7, state: mc(-1, 23), points: 60.14, bits: 8.86, want: 6.79 },
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

test("the tug named is the one that changed hands most, not the dearest (round 33: a 3-pull line over a 40-move cycle)", () => {
  const s = summarise({ ...base, tugs: [{ number: 5, withNames: ["Ada"], flips: 3, mySpend: 236.89 }, { number: 3, withNames: ["Ada"], flips: 40, mySpend: 12 }] });
  assert.equal(s.costs[0]!.number, 3);
  assert.equal(s.next.number, 3);
  assert.match(s.next.text, /line 3 back and forth: it changed hands 40 times/);
});

test("what cost: each tug-of-war with whom and the energy your agent burnt, most changes of hands first", () => {
  const s = summarise(base);
  assert.equal(s.costs.length, 2);
  assert.equal(s.costs[0]!.text, "You and Ada pulled line 4 back and forth: it changed hands 6 times (28.86 energy of yours).");
  assert.match(s.costs[1]!.text, /You and Ada and Bo|You, Ada and Bo/);
  assert.match(s.costNote ?? "", /38\.36 energy in all/);
});

test("one thing to try next game is built from this game's facts (rounds 26 and 28: the same words every game)", () => {
  const people = summarise(base);
  assert.equal(people.next.number, 4);
  assert.equal(people.next.text, "This game you and Ada pulled line 4 back and forth: it changed hands 6 times (28.86 energy of yours). Next game, open a line you share in One line and order its moves by “Best for points”: your points there are your bits × theirs, so the top move counts their bits as well as yours. Tell them in chat which way you are climbing.");
  const practice = summarise({ ...base, tugs: base.tugs.map(t => ({ ...t, withNames: ["Practice partner 1"], practice: true })) });
  assert.doesNotMatch(practice.next.text, /chat/, "nobody to talk to in a practice game");
  // In a rotation the facts stay too (round 28 read the same words across the games of a rotation).
  assert.match(summarise({ ...base, rotates: true }).next.text, /^This game you and Ada pulled line 4 back and forth: it changed hands 6 times/);

  // Flat from 2:00 with the energy full: the stall, the energy left, and a change to the agent.
  const flat = { points: [{ x: 0, y: 0 }, { x: 60, y: 30 }, { x: 120, y: 50 }, { x: 300, y: 50 }, { x: 600, y: 50 }], endWorld: 600, energyLeft: 288, capacity: 288 };
  const stalled = summarise({ ...base, tugs: [], pace: flat });
  assert.equal(stalled.next.text, "Your points stopped rising at 2:00, and your energy sat full (288.00 energy unspent) for the rest of the game. Next game, when your points stop rising, change what your agent tries: pick another of its starting points in Agent code, or summon a second agent that tries different moves, so your energy keeps buying moves.");
  // A stall comes before the tug's lesson, and the tug is still named.
  assert.match(summarise({ ...base, pace: flat }).next.text, /^This game you and Ada pulled line 4 back and forth.*\. Your points stopped rising at 2:00/);

  // Still climbing in the last third: more power from the start.
  const climbing = { points: [{ x: 0, y: 0 }, { x: 300, y: 20 }, { x: 400, y: 30 }, { x: 600, y: 61.5 }], endWorld: 600, energyLeft: 12, capacity: 288 };
  assert.equal(summarise({ ...base, tugs: [], pace: climbing }).next.text, "Your agent was still raising your points at the end (+31.50 points in the last third). Next game, give it a bigger share of your power from the start, in My agents, so it climbs sooner.");

  for (const s of [people, practice, stalled]) assert.doesNotMatch(s.next.text, /TARGET|SETTLE|hold it|settle|good for both/i);
  // No pace, no tug, no shared climb: the most wanted line and the move that makes it rarer, as before.
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
  assert.match(t, /Contested lines Line 4: you and Ada undid each other's moves: it changed hands 6 times;/);
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
  const { recurrencePair, fromMC, lineQ, lineType } = await import("@workspace/v2-linear");
  const { q } = await import("@workspace/v2-core");
  const { moves } = await import("../src/index.ts");
  const ec = { type: lineType, family: recurrencePair, params: (recurrencePair as never as { dealable: (v: unknown) => unknown[] }).dealable(lineQ)[0], variant: lineQ } as never;
  const state = { lines: [fromMC(q(2), q(5))] };
  const s = summarise({ rule: ec, objects: [{ number: 3, state, points: 0, bits: 0, want: 6 }], tugs: [], total: 0 });
  const scoring = moves(ec, state, null, { k: 1 }).find(m => m.utility !== null)!;
  assert.ok(scoring);
  assert.match(s.next.text, new RegExp(`Try “${scoring.words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}”`), s.next.text);
});

test("a tug that only flipped between two states says so (round 33: 'flipped back and forth between two states 27 times')", () => {
  const s = summarise({ ...base, tugs: [{ number: 5, withNames: ["Ada"], flips: 3, mySpend: 236.89 }, { number: 2, withNames: ["Ada"], flips: 12, mySpend: 9, cycle: { moves: 27 } }] });
  assert.equal(s.next.number, 2, "the cycle's 27 moves outrank 3 changes of hands");
  assert.match(s.next.text, /flipped line 2 back and forth between two states 27 times \(9\.00 energy of yours\)/);
  assert.match(s.costs[0]!.text, /between two states 27 times/);
});
