/**
 * The replay's fold (src/replay/fold.ts): an ended game's stored file (engine convex/v2/replays.ts: header, every
 * player's rule, every v2Events event) folded up to a cursor into what the SDK hooks answer live. Expectations are
 * worked by hand from spec §8 (points = own rarity × the others' sum) on a two-player game of literal events.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { appliedAtWorld, frameAt, indexReplay, nextStop, prevStop, resolveCursor, worldAt } from "../src/replay/fold.ts";
import { cursorWorld, playheadAt, stepOp } from "../src/replay/playhead.ts";

const val = (memberId: string, rarityBits: number, u = 1) => ({ memberId, score: [String(u)], rarityBits });
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
    { memberId: "m1", family: "bearing", params: { suffix: "1" }, tieBreaker: null, ruleKey: "k1", card: "Ada's card", layers: ["main"], contentHash: "h1", handicap: null },
    { memberId: "m2", family: "corner", params: {}, tieBreaker: null, ruleKey: "k2", card: "Bo's card", layers: ["main"], contentHash: "h2", value: { knots: [{ u: null, bits: 0, lo: 0, hi: 0 }, { u: ["1"], bits: 3, lo: 2.5, hi: 3.5 }], tail: { primary: { form: "linear", slope: 1 }, secondary: { form: "log", slope: 0.5 } } }, handicap: 10 },
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
    value: { score: ["2"], rarityBits: 4, want: 1, points: 4, version: 2 },
  });
  assert.equal(mid.object("o2", "m1")!.state, "s2a");
  assert.deepEqual(mid.standings!.rows.map(r => r.total), [2, 2], "the scoreboard is the one published by then");
  assert.deepEqual(mid.moves("m1"), [{
    seq: 0, worldSeconds: 4, objectId: "o1", number: 1, agentId: "a1", mine: true,
    calls: [{ mutator: "shift", site: 0, args: { by: "1" } }], rep: "si", stateBefore: "s1a", stateAfter: "s1b",
    before: { score: ["1"], rarityBits: 2, want: 1, points: 2 }, after: { score: ["2"], rarityBits: 4, want: 1, points: 4 },
    charge: 1.5, notes: [],
  }]);
  const bo = mid.moves("m2");
  assert.equal(bo.length, 1, "Bo's points moved 2 → 4, so the move concerns him");
  assert.deepEqual([bo[0]!.mine, bo[0]!.agentId, bo[0]!.charge, bo[0]!.before.points, bo[0]!.after.points], [false, null, null, 2, 4]);
  const end = frameAt(ix, END);
  assert.deepEqual(end.moves("m1").map(m => m.seq), [1, 0], "newest first");
  assert.deepEqual(end.moves("m2").map(m => m.seq), [0], "line 2's move left Bo's points at 0: not his");
  assert.equal(frameAt(ix, 0).object("o1", "m1"), null, "no line before its birth");
  // Catches: every row drawing again on every frame of a playing replay.
  assert.equal(frameAt(ix, 13).object("o1", "m1"), mid.object("o1", "m1"), "a line the playhead did not change is the same answer");
  assert.notEqual(frameAt(ix, 13).object("o2", "m1"), mid.object("o2", "m1"));
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

test("a replay's moves are whole act-log rows: notes (none recorded) and no mover named for another's move (round 9: 'o.notes is not iterable')", () => {
  const rows = frameAt(ix, END).moves("m1");
  assert.ok(rows.length > 0, "the replay has moves");
  for (const r of rows) assert.ok(Array.isArray((r as { notes?: unknown }).notes), `move ${r.seq} has notes`);
});

test("a replay calls an agent what the live game did, from the summon's name (round 10: 'Agent 1' for 'Simple')", () => {
  const named = indexReplay({ ...FILE, events: FILE.events.map(e => (e.kind === "command" && (e.data as { kind?: string }).kind === "summon" ? { ...e, data: { ...(e.data as object), name: "Simple" } } : e)) } as never);
  assert.deepEqual(frameAt(named, END).agents("m1").map(a => a.name), ["Simple"]);
  assert.deepEqual(frameAt(ix, END).agents("m1").map(a => a.name), ["Agent 1"], "an older file without the name keeps the numbered name");
});

test("parameter drift (call 18): the replay's rule card is the one in force at the playhead, from gameStarted through each drift", () => {
  // Catches: the replay showing the END rule from the first second (the file's rules are the end state), or a drift lost.
  const events: [string, unknown][] = [
    ["gameStarted", { variant: "line-z", players: [
      { memberId: "m1", family: "corner", params: { k: 3 }, tieBreaker: null, ruleKey: "k-start", contentHash: "h0" },
      { memberId: "m2", family: "corner", params: { k: 5 }, tieBreaker: null, ruleKey: "k2", contentHash: "h2" },
    ] }],
    ["phase", { phase: "live", worldSeconds: 0 }],
    ["tick", { tick: 1, worldSeconds: 60, standings: standings(1, 1) }],
    ["drift", { worldSeconds: 120, k: 1, seats: [{ memberId: "m1", family: "corner", params: { k: 7 }, tieBreaker: null, ruleKey: "k-end", contentHash: "h1", card: "Ada's card after the drift" }] }],
    ["tick", { tick: 2, worldSeconds: 130, standings: standings(1, 1) }],
    ["gameEnded", { worldSeconds: 130, standings: standings(1, 1) }],
  ];
  const file = { ...FILE, rules: [{ ...FILE.rules[0]!, family: "corner", params: { k: 7 }, ruleKey: "k-end", card: "Ada's card after the drift" }, FILE.rules[1]!],
    events: events.map(([kind, data], seq) => ({ seq, kind, data })) };
  const x = indexReplay(file);
  const before = frameAt(x, 3).rule("m1")!, after = frameAt(x, 5).rule("m1")!;
  assert.deepEqual(before.params, { k: 3 }, "before the drift: the dealt numbers");
  assert.equal(before.drifts, 0);
  assert.notEqual(before.card, "Ada's card after the drift");
  assert.deepEqual(after.params, { k: 7 });
  assert.equal(after.card, "Ada's card after the drift");
  assert.deepEqual([after.drifts, after.driftedAt], [1, 120]);
  assert.deepEqual(after.previous?.params, { k: 3 }, "what the drift changed from, as live (W3 #750)");
  assert.equal(before.previous, null);
  assert.deepEqual(frameAt(x, 5).rule("m2")!.params, { k: 5 }, "a seat the drift did not redraw keeps its rule");
});

test("a retired line (turnover) leaves the lines at its retirement, joins the retired list, and keeps its banked value", () => {
  // Catches: a retired line still listed (or listed before it retired), a retired list in the wrong order, its value lost.
  const withRetire = {
    ...FILE,
    events: [
      ...EVENTS.slice(0, -1),
      ["retired", { objectId: "o1", number: 1, worldSeconds: 10, state: "s1b", banked: true, points: [{ memberId: "m1", points: 4 }, { memberId: "m2", points: 4 }] }],
      ["objectBorn", { objectId: "o3", number: 3, state: "s3a", worldSeconds: 10 }],
      ["values", { objectId: "o3", number: 3, values: [val("m1", 1), val("m2", 1)] }],
      EVENTS.at(-1)!,
    ].map(([kind, data], seq) => ({ seq, kind, data })),
  };
  const rx = indexReplay(withRetire), retiredAt = EVENTS.length;   // the retired event's position, 1-based
  const before = frameAt(rx, retiredAt - 1), after = frameAt(rx, retiredAt);
  assert.deepEqual(before.objectIds("m1", "born").map(r => r.number), [2, 1]);
  assert.deepEqual(before.banked("m1"), []);
  assert.equal(before.object("o1", "m1")!.retiredAt, undefined);
  assert.deepEqual(after.objectIds("m1", "born").map(r => r.number), [2]);
  assert.deepEqual(after.banked("m1").map(r => r.number), [1]);
  const o1 = after.object("o1", "m1")!;
  assert.deepEqual([o1.retiredAt, o1.state, o1.value!.points], [10, "s1b", 4]);
  const end = frameAt(rx, rx.end);
  assert.deepEqual(end.objectIds("m1", "born").map(r => r.number), [3, 2]);
  assert.deepEqual(end.banked("m2").map(r => r.number), [1]);
});
