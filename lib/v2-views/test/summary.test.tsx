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
const rule: RuleRef<LineState, unknown> = { type: lineType, family: primeLanding as never, params: { ends: 3 }, variant: lineZ, tieBreaker: "shared-factor" };
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

test("what earned the points: the best lines first, each said through its rule's main part, with bits × others'", () => {
  const s = summarise(base);
  assert.deepEqual(s.earned.map(e => e.number), [7, 4, 3], "best first, nothing that scored nothing");
  assert.match(s.earned[0]!.chain, /^● main part: where it crosses the x-axis 23 · on 23$/, s.earned[0]!.chain);
  // Self-consistent arithmetic (the app's one formatter): "=" where the shown factors multiply to the shown product…
  assert.equal(s.earned[0]!.formula, "your 8.86 bits × others' 6.79 bits = 60.16 points");
  // …and "≈" where they do not (10.22 × 11.05 = 112.93, but the full values make 112.97).
  const close = summarise({ ...base, objects: [{ number: 25, state: mc(6, 23), points: 112.97, bits: 10.2249, want: 11.0481 }], tugs: [] });
  assert.equal(close.earned[0]!.formula, "your 10.22 bits × others' 11.05 bits ≈ 112.97 points");
  assert.match(s.earnedNote, /These 3 lines earned 105\.84 of your 105\.84 points\./);
});

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

test("the summary renders for every beginner family on lines on and off their rungs (a throw shows only the plain advice)", async () => {
  const L = await import("@workspace/v2-linear") as unknown as { beginnerPool: { id: string; dealable(v: unknown): unknown[]; tieBreakers: { id: string }[] }[]; lineQ: never };
  for (const f of L.beginnerPool) {
    const r = { type: lineType, family: f as never, params: f.dealable(L.lineQ)[0], variant: L.lineQ, tieBreaker: f.tieBreakers[0]!.id } as RuleRef<LineState, unknown>;
    const objects = [[10, 3], [-7, 2], [4, 100], [11, 31]].map(([m, c], i) => ({ number: i + 1, state: mc(m!, c!), points: 5, bits: 1, want: 5 }));
    const s = summarise({ rule: r, objects, tugs: [], total: 20 });
    assert.doesNotThrow(() => renderToStaticMarkup(<GameSummary summary={s} rule={r} />), f.id);
    for (const e of s.earned) assert.doesNotMatch(e.chain, /: [−-][\d½⅓⅔¼¾]|\bdealt\b/, `${f.id}: ${e.chain}`);
  }
});

test("a tug that only flipped between two states says so (round 33: 'flipped back and forth between two states 27 times')", () => {
  const s = summarise({ ...base, tugs: [{ number: 5, withNames: ["Ada"], flips: 3, mySpend: 236.89 }, { number: 2, withNames: ["Ada"], flips: 12, mySpend: 9, cycle: { moves: 27 } }] });
  assert.equal(s.next.number, 2, "the cycle's 27 moves outrank 3 changes of hands");
  assert.match(s.next.text, /flipped line 2 back and forth between two states 27 times \(9\.00 energy of yours\)/);
  assert.match(s.costs[0]!.text, /between two states 27 times/);
});
