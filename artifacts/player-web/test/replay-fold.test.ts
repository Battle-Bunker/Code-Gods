/**
 * The replay's fold (src/replay/fold.ts): an ended game's stored file (engine convex/v2/replays.ts: header, every
 * player's rule, every v2Events event) folded up to a cursor into what the SDK hooks answer live. Expectations are
 * worked by hand from spec §8 (points = own ✨ rarity × the others' sum) on a two-player game of literal events.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { appliedAtWorld, frameAt, indexReplay, nextStop, prevStop, resolveCursor, worldAt } from "../src/replay/fold.ts";
import { cursorWorld, playheadAt, stepOp } from "../src/replay/playhead.ts";

const ladder = [{ level: 0, label: "nothing", rarityBits: 0 }, { level: 1, label: "one", rarityBits: 2 }];
const val = (memberId: string, rarityBits: number, level = 1) => ({ memberId, score: [String(level)], level, rarityBits });
const standings = (m1: number, m2: number) => [
  { memberId: "m1", total: m1, net: m1, rank: 1 },
  { memberId: "m2", total: m2, net: m2 - 0.1 * m2, rank: 2 },
];
const act = (worldSeconds: number, objectId: string, number: number, outcome: string, before: string, after: string, charge: number) => ({
  n: 1, tick: 1, worldSeconds, objectId, number, agentId: "a1", memberId: "m1", seed: "act:1", energy: 10, liveObjects: 2,
  program: { version: 0, language: "typescript" }, outcome, before, after, charge, readBits: 3,
  calls: outcome === "committed" ? [{ mutator: "shift", site: 0, args: { by: "1" }, rep: "si" }] : [],
});

/** Two players; Bo pays a 10% handicap. Lines 1 and 2; Ada's agent moves line 1 (both gain) and line 2 (only hers). */
const EVENTS: [string, unknown][] = [
  ["gameStarted", { variant: "line-z" }],
  ["objectBorn", { objectId: "o1", number: 1, state: "s1a", worldSeconds: 0 }],
  ["values", { objectId: "o1", number: 1, values: [val("m1", 2), val("m2", 1)] }],            // Ada 2·1 = 2, Bo 1·2 = 2
  ["objectBorn", { objectId: "o2", number: 2, state: "s2a", worldSeconds: 0 }],
  ["values", { objectId: "o2", number: 2, values: [val("m1", 1), val("m2", 0, 0)] }],         // Ada 1·0 = 0, Bo 0·1 = 0
  ["phase", { phase: "live", worldSeconds: 0 }],
  ["tick", { tick: 0, worldSeconds: 0, standings: standings(2, 2) }],
  ["command", { kind: "summon", memberId: "m1", agentId: "a1", language: "typescript", sourceHash: "h", version: 0, price: 5, share: 0.7, worldSeconds: 1 }],
  ["act", act(4, "o1", 1, "committed", "s1a", "s1b", 1.5)],
  ["values", { objectId: "o1", number: 1, values: [val("m1", 4, 2), val("m2", 1)] }],        // Ada 4·1 = 4, Bo 1·4 = 4
  ["act", act(6, "o2", 2, "skipped", "s2a", "s2a", 0.2)],
  ["act", act(8, "o2", 2, "committed", "s2a", "s2b", 2)],
  ["values", { objectId: "o2", number: 2, values: [val("m1", 3, 2), val("m2", 0, 0)] }],     // Ada 3·0 = 0, Bo 0·3 = 0
  ["tick", { tick: 9, worldSeconds: 10, standings: standings(4, 4) }],
  ["gameEnded", { worldSeconds: 10, standings: standings(4, 4) }],
];

const FILE = {
  version: 1,
  game: {
    gameId: "g1", roomId: "r1", number: 1, code: "G1", phase: "ended", preset: "beginner", variant: "line-z", seed: "s",
    settings: { worldSeconds: 10 },
    roster: [{ memberId: "m1", name: "Ada", kind: "human" }, { memberId: "m2", name: "Bo", kind: "practice" }],
  },
  rules: [
    { memberId: "m1", family: "prime-gradient", params: {}, tieBreaker: null, ruleKey: "k1", card: "Ada's card", layers: ["main"], ladder, handicap: null },
    { memberId: "m2", family: "triangle-area", params: {}, tieBreaker: null, ruleKey: "k2", card: "Bo's card", layers: ["main"], ladder, handicap: 10 },
  ],
  events: EVENTS.map(([kind, data], seq) => ({ seq, kind, data })),
};

const ix = indexReplay(FILE);
const END = EVENTS.length;

test("folding to the end gives the game's final standings exactly, and each player's lines add up to their total", () => {
  // Catches: standings from an earlier scoreboard, a lost handicap or name, or values folded in the wrong order.
  const end = frameAt(ix, resolveCursor(ix, { seq: END }));
  const final = (EVENTS.at(-1)![1] as { standings: ReturnType<typeof standings> }).standings;
  assert.deepEqual(end.standings, {
    seq: 1, worldSeconds: 10,
    rows: final.map(r => ({ ...r, name: r.memberId === "m1" ? "Ada" : "Bo", handicap: r.memberId === "m2" ? 10 : 0 })),
  });
  assert.deepEqual(end.standings!.rows.map(r => [r.name, r.net]), [["Ada", 4], ["Bo", 3.6]]);
  for (const [m, total] of [["m1", 4], ["m2", 4]] as const) {
    const sum = end.objectIds(m, "points").reduce((s, r) => s + end.object(r.objectId, m)!.value!.points, 0);
    assert.equal(sum, total, `${m}'s lines add up to their total`);
  }
  assert.deepEqual(end.history.map(h => [h.seq, h.worldSeconds, h.totals.map(t => t.net)]), [[0, 0, [2, 1.8]], [1, 10, [4, 3.6]]]);
  assert.equal(end.worldSeconds, 10);
});

test("the playhead shows each line, value and move as it was, and nothing that came after", () => {
  // Catches: a move shown before its values, a value from the end leaking into the middle, the wrong player's move.
  const before = frameAt(ix, 9);   // Ada's first act is applied, its values are not: nothing has changed yet
  assert.equal(before.object("o1", "m1")!.state, "s1a");
  assert.deepEqual(before.moves("m1"), []);
  const mid = frameAt(ix, 10);
  assert.deepEqual(mid.object("o1", "m1"), {
    objectId: "o1", number: 1, bornAt: 0, state: "s1b", version: 2, changedAt: 4,
    value: { score: ["2"], level: 2, rarityBits: 4, want: 1, points: 4, version: 2 },
  });
  assert.equal(mid.object("o2", "m1")!.state, "s2a");
  assert.deepEqual(mid.standings!.rows.map(r => r.total), [2, 2], "the scoreboard is the one published by then");
  assert.deepEqual(mid.moves("m1"), [{
    seq: 0, worldSeconds: 4, objectId: "o1", number: 1, agentId: "a1", mine: true,
    calls: [{ mutator: "shift", site: 0, args: { by: "1" } }], rep: "si", stateBefore: "s1a", stateAfter: "s1b",
    before: { score: ["1"], level: 1, rarityBits: 2, want: 1, points: 2 }, after: { score: ["2"], level: 2, rarityBits: 4, want: 1, points: 4 },
    charge: 1.5,
  }]);
  const bo = mid.moves("m2");
  assert.equal(bo.length, 1, "Bo's points moved 2 → 4, so the move concerns him");
  assert.deepEqual([bo[0]!.mine, bo[0]!.agentId, bo[0]!.charge, bo[0]!.before.points, bo[0]!.after.points], [false, null, null, 2, 4]);
  const end = frameAt(ix, END);
  assert.deepEqual(end.moves("m1").map(m => m.seq), [1, 0], "newest first");
  assert.deepEqual(end.moves("m2").map(m => m.seq), [0], "line 2's move left Bo's points at 0: not his");
  assert.equal(frameAt(ix, 0).object("o1", "m1"), null, "no line before its birth");
  assert.deepEqual(frameAt(ix, 0).objectIds("m1", "points"), []);
});

test("lines sort like the server's indexes, best first, and the digest packs every line by number", () => {
  const end = frameAt(ix, END);
  assert.deepEqual(end.objectIds("m1", "points").map(r => r.number), [1, 2]);
  assert.deepEqual(end.objectIds("m1", "born").map(r => r.number), [2, 1]);
  assert.deepEqual(end.objectIds("m1", "recent").map(r => r.number), [2, 1]);
  assert.deepEqual(end.objectIds("m2", "want").map(r => r.number), [1, 2], "Bo's want: 4 on line 1, 3 on line 2");
  assert.deepEqual(end.digest("m1")!.packed, [1, 4, 1, 2, 3, 0]);
  assert.deepEqual(end.object("o1", null)!.value, null, "no point of view: no values");
});

test("every player's rule is open in the replay, with its card and the steps of its ladder", () => {
  const bo = frameAt(ix, END).rule("m2")!;
  assert.equal(bo.family, "triangle-area");
  assert.equal(bo.title, "Triangle Area");
  assert.equal(bo.primary, "tri");
  assert.deepEqual([bo.card, bo.handicap, bo.ladder], ["Bo's card", 10, ladder]);
  assert.equal(frameAt(ix, END).rule("nobody"), null);
  assert.deepEqual(frameAt(ix, END).agents("m1").map(a => [a.agentId, a.name, a.language, a.share]), [["a1", "Agent 1", "typescript", 0.7]]);
  assert.deepEqual(frameAt(ix, 7).agents("m1"), [], "not summoned yet");
});

test("cursors: an event number, or a world time plus events; steps land after each move", () => {
  // Catches: a step that stops between a move and its values (the panes would show half a move).
  assert.equal(resolveCursor(ix, { seq: 99 }), END);
  assert.equal(resolveCursor(ix, { worldSeconds: 0, plus: 0 }), 7, "the start of the world: births, values and the first scoreboard");
  assert.equal(resolveCursor(ix, { worldSeconds: 4, plus: 0 }), 10);
  assert.equal(resolveCursor(ix, { worldSeconds: 5, plus: 3 }), 13);
  assert.equal(worldAt(ix, 10), 4);
  assert.equal(worldAt(ix, 0), 0);
  assert.equal(appliedAtWorld(ix, 6.5), 11);
  assert.equal(ix.endWorld, 10);
  assert.deepEqual([nextStop(ix, 0), nextStop(ix, 10), nextStop(ix, 13)], [10, 13, END]);
  assert.deepEqual([prevStop(ix, END), prevStop(ix, 13), prevStop(ix, 10)], [13, 10, 0]);
});

test("a playing replay moves on in world time at its speed, stops at the end, and steps from the playhead", () => {
  // Catches: playing from the stored cursor instead of the playhead, or running past the end.
  const anchor = { world: 4, at: 1000, speed: 2 };
  assert.deepEqual(playheadAt(ix, anchor, 2000), { world: 6, applied: 11, done: false });
  assert.deepEqual(playheadAt(ix, anchor, 9000), { world: 10, applied: END, done: true });
  assert.equal(cursorWorld(ix, { seq: 10 }), 4);
  assert.equal(cursorWorld(ix, { worldSeconds: 5.5, plus: 0 }), 5.5);
  assert.deepEqual(stepOp(ix, 10, 10, 1), { id: "replay.step", args: { by: 3 } });
  assert.deepEqual(stepOp(ix, 11, 7, 1), { id: "replay.step", args: { by: 6 } }, "from the playhead, as a step of the stored cursor");
  assert.deepEqual(stepOp(ix, 13, 13, -1), { id: "replay.step", args: { by: -3 } });
  assert.equal(stepOp(ix, 0, 0, -1), null, "nothing before the start");
  assert.equal(stepOp(ix, END, END, 1), null, "nothing after the end");
});

test("a file this page cannot read says so", () => {
  assert.throws(() => indexReplay({ version: 2, events: [] }), /version 2/);
  assert.throws(() => indexReplay(null), /not a stored replay/);
});
