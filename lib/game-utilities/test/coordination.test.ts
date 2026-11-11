/**
 * The coordination model's pieces (scripts/coordination-lib.ts, docs/coordination-incentives.md) against hand-derived
 * numbers: the payoff aggregates, the price of a write, each policy's choice on boards where it can be worked out by
 * hand, the energy loop, and the equilibrium finder on a two-policy dilemma.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, seededRng, type GridValue } from "@workspace/game-types";
import { givenRule, space } from "../scripts/rule-difficulty-lib.ts";
import {
  DEFAULT_TUNING, DEVELOP_ECON, decide, equilibria, payoffs, playGame, profileKey, profiles, winShares, writeWork,
  type Econ, type Obj, type Policy, type TableStats,
} from "../scripts/coordination-lib.ts";

const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const sp = space(inst, "symbol");
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const econ = (patch: Partial<Econ> = {}): Econ => ({
  powerPerSecond: 64, interactionRateHz: 25, durationSeconds: 10, startingObjectCount: 3, spawnRateHz: 0, ...DEVELOP_ECON, candidates: 1000, ...patch,
});

// Bits = the count itself. god 0 wants 7s, god 1 wants 3s, god 2 wants digits ≥ 5 (fine with 7s, against 3s).
const count = (id: string, want: (s: number) => boolean) => givenRule(id, g => g.sym.filter(want).length, o => o as number, 16);
const RULES = [count("sevens", s => s === 7), count("threes", s => s === 3), count("high", s => s >= 5)];
const board = (sym: number[]): GridValue => ({ size: 4, sym, col: new Array(16).fill(0) });
const object = (sym: number[], e = econ()): Obj => {
  const grid = board(sym), ords = RULES.map(r => r.score(grid)), bits = ords.map(o => o as number);
  return { grid, ords, bits, pay: payoffs(bits, e.aggregate) };
};
const act = (policy: Policy, god: number, sym: number[], e = econ(), extra: { informed?: boolean; remaining?: number } = {}) =>
  decide(policy, { god, object: object(sym, e), rules: RULES, sp, econ: e, tuning: DEFAULT_TUNING, informed: extra.informed ?? true, remaining: extra.remaining ?? 100, rng: seededRng("t") });
const ALL7 = new Array(16).fill(7), ALL0 = new Array(16).fill(0);

test("payoff aggregates: sum is develop's own × Σ others; min and geo agree with it on equal bits and punish a zero", () => {
  assert.deepEqual(payoffs([2, 3, 5]), [16, 21, 25]);
  assert.deepEqual(payoffs([2, 3, 5], "min"), [2 * 2 * 3, 3 * 2 * 2, 5 * 2 * 2]);
  const geo = payoffs([2, 3, 5], "geo");
  near(geo[0], 2 * 2 * Math.sqrt(15)); near(geo[1], 3 * 2 * Math.sqrt(10)); near(geo[2], 5 * 2 * Math.sqrt(6));
  for (const a of ["sum", "min", "geo"] as const) payoffs([4, 4, 4], a).forEach(x => near(x, 32));
  assert.deepEqual(payoffs([0, 3, 5]), [0, 15, 15]);
  assert.deepEqual(payoffs([0, 3, 5], "min"), [0, 0, 0]);
  assert.deepEqual(payoffs([6, 7]), [42, 42], "two gods always tie");
});

test("a write's work: develop's flat symbol price, distance pricing, and the erasure surcharge", () => {
  near(writeWork(sp, econ(), 0, 9, 20, 5), 4 + 2 * Math.log2(10));
  near(writeWork(sp, econ({ distancePricing: true }), 3, 7, 0, 0), 4 + Math.log2(3) * 4);
  near(writeWork(sp, econ({ erasure: 1 }), 0, 9, 20, 17), 4 + 2 * Math.log2(10) + 3);
  near(writeWork(sp, econ({ erasure: 1 }), 0, 9, 17, 20), 4 + 2 * Math.log2(10), 1e-9);
});

test("each policy's choice on boards worked out by hand", () => {
  // All zeros: bits [0, 0, 0]. Greedy for 7s writes a 7; it read the whole board (16 × log2 10 bits).
  const g = act("greedy", 0, ALL0);
  assert.equal(g.move?.value, 7);
  near(g.readBits, 16 * Math.log2(10));
  assert.equal(act("random", 0, ALL0).readBits, 0);

  // All sevens: bits [16, 0, 16], points [256, 0, 256]. A 3 anywhere gives bits [15, 1, 15], points [240, 30, 240].
  assert.equal(act("greedy", 1, ALL7).move?.value, 3, "greedy for 3s tramples the 7s");
  assert.equal(act("considerate", 1, ALL7).move, null, "every 3 lowers two other gods: skip");
  assert.equal(act("considerate", 1, ALL0).move?.value, 3, "on zeros a 3 lowers nobody");
  assert.equal(act("payoff", 1, ALL7).move?.value, 3, "+30 points for itself");
  assert.equal(act("cooperator", 1, ALL7).move, null, "the table's points fall 512 → 510: skip");
  assert.equal(act("deny", 1, ALL7).move?.value, 3, "+30 for itself and −16 for each rival");
  // The spoiler without a goal of its own here: god 1 on sevens with one 3 already. Another 3 → bits [14, 2, 14]:
  // own 30 → 56, rivals 240 → 14 × 16 = 224 each: 26 + 16 = +42, better than any other digit.
  assert.equal(act("deny", 1, [3, ...ALL7.slice(1)]).move?.value, 3);
  // deny for the 7s god on fifteen 3s and its one 7 (bits [1, 15, 1], points [16, 30, 16]). Erasing its own 7 with a
  // low digit gives bits [0, 15, 0] and points [0, 0, 0]: own −16, rivals' mean −23: +7. A second 7 gives [2, 14, 2],
  // points [32, 56, 32]: own +16, rivals' mean +21: −5. So the spoiler wrecks its own cell to zero the table.
  const wreck = act("deny", 0, [7, ...new Array(15).fill(3)]);
  assert.deepEqual([wreck.move?.cell, wreck.after?.bits], [0, [0, 15, 0]]);
  assert.equal(act("cooperator", 0, [7, ...new Array(15).fill(3)]).after?.bits[0], 2, "the cooperator adds a 7 instead: 62 → 120 points");

  // The defender repairs its own bits first; with nothing to repair it raises the others without lowering itself.
  assert.equal(act("defender", 0, [0, ...ALL7.slice(1)]).move?.value, 7);
  assert.equal(act("defender", 0, ALL7).move, null, "every change lowers its own bits");
  const built = act("defender", 1, [3, ...ALL0.slice(1)]); // own 1; a 7 on a zero cell raises gods 0 and 2 by 1 each
  assert.equal(built.move?.value, 3, "its own bits can still rise: it takes that first");
  const full = act("defender", 1, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0].map((s, k) => (k === 15 ? 0 : s)));
  assert.equal(full.move?.value, 3);

  // The commit clause, with no noise: the 3 on sevens raises its points 0 → 30, so it commits; for the 7s god on all
  // sevens but one 3 (bits [15, 1, 15], points 240) a 7 gives [16, 0, 16], points 256: commits. For the "high" god
  // on [7, 3 × 15] (bits [1, 15, 1]) greedy writes a high digit over a 3: [1, 14, 2], its points 16 → 30: commits;
  // with the others' sum hidden under heavy noise the clause decides by the noise, so some boards are refused.
  const quiet = econ({ peerNoiseBits: 0 });
  assert.equal(act("clause", 1, ALL7, quiet).move?.value, 3);
  assert.equal(act("clause", 0, [3, ...ALL7.slice(1)], quiet).after?.bits[0], 16);
  // Own bits up but points down: the 3s god on [7 × 15, 3] with rivals at 15 each… a second 3 gives [14, 2, 14]:
  // 30 → 56, commits. The 7s god on fifteen 3s and a 7 adding a 7: 16 → 2 × 16 = 32, commits. A refusal needs the
  // others to fall faster than it rises: god 2 ("high") on [9, 3 × 15] has bits [0, 15, 1], points 15; a high digit
  // over a 3 gives [0, 14, 2], points 28: commits. So refusals here come only from noise:
  const refused = Array.from({ length: 40 }, (_, k) => act("clause", 1, [k % 10, ...ALL7.slice(1)].map((x, c) => (c === 5 ? (k >> 1) % 10 : x)), econ({ peerNoiseBits: 64 })).move === null);
  assert.ok(refused.some(Boolean) && !refused.every(Boolean), "heavy noise refuses some improving changes and keeps others");

  // Before it knows the others' rules an informed policy plays greedy.
  assert.equal(act("considerate", 1, ALL7, econ(), { informed: false }).move?.value, 3);
  // The hoarder wants ≥ 2 points per energy bit: +30 points for 16.3 bits is not enough; on fifteen 7s and one 3 a
  // 3 → 7 flip is own-neutral for god 2 ([15,1,15] → [16,0,16]: 15 × 16 = 240 → 256, +16): not enough either.
  assert.equal(act("hoarder", 1, ALL7).move, null);
  // The sniper waits, reading nothing, then plays deny.
  const waiting = act("sniper", 1, ALL7, econ(), { remaining: 31 });
  assert.equal(waiting.move, null); assert.equal(waiting.readBits, 0);
  assert.equal(act("sniper", 1, ALL7, econ(), { remaining: 29 }).move?.value, 3);
});

test("under min the spoiler's 3 on a board of 7s gains it nothing it could not get by building", () => {
  // min: all sevens pays [16 × 2 × 0, 0, 0] = 0 to everyone (god 1 has no bits). A 3 → bits [15, 1, 15]:
  // points [15 × 2 × 1, 1 × 2 × 15, 30] = [30, 30, 30]: the "spoiling" move is the one that pays everybody.
  const e = econ({ aggregate: "min" });
  const d = act("cooperator", 1, ALL7, e);
  assert.equal(d.move?.value, 3);
  assert.deepEqual(d.after?.pay, [30, 30, 30]);
});

test("the energy loop: one blind agent per god acts as often as its power pays for, and no more than 4 times a second", () => {
  const e = econ({ durationSeconds: 20 });
  const r = playGame(RULES, ["random", "random", "random"], sp, e, seededRng("energy"));
  const price = (4 + 2 * Math.log2(10)) * (1 + 0.05 * (4 + 2 * Math.log2(10))); // W + βW² = 16.31
  for (let g = 0; g < 3; g++) {
    near(r.changeSpent[g], r.changes[g] * price, 1e-6);
    assert.equal(r.readSpent[g], 0);
    assert.ok(r.changeSpent[g] <= 64 * 20 + price, "never more than its income plus one act of debt");
    assert.ok(r.acts[g] <= 4 * 20 && r.acts[g] >= 0.9 * 64 * 20 / price, `acts ${r.acts[g]}`);
  }
  assert.equal(r.opportunities, 25 * 20);
});

test("no power, no acts: the world stands still, so the time-average equals the end", () => {
  const r = playGame(RULES, ["greedy", "greedy", "greedy"], sp, econ({ powerPerSecond: 0, scoring: "integral" }), seededRng("still"));
  assert.deepEqual(r.acts, [0, 0, 0]);
  r.final.forEach((x, g) => near(r.average[g], x, 1e-9));
  assert.deepEqual(r.score, r.average);
});

test("a summon price delays a god's agents by price / power seconds", () => {
  // 640 bits at 64 bits/s: nothing for 10 of the 20 seconds, so about half the acts of a free agent.
  const e = econ({ durationSeconds: 20 });
  const free = playGame(RULES, ["random", "random", "random"], sp, e, seededRng("summon"));
  const priced = playGame(RULES, ["random", "random", "random"], sp, e, seededRng("summon"), { ...DEFAULT_TUNING, summonBits: { random: 840 }, startingEnergy: 200 });
  for (let g = 0; g < 3; g++) {
    assert.ok(priced.changeSpent[g] <= 64 * 10 + 17, `spent ${priced.changeSpent[g]}`);
    assert.ok(Math.abs(priced.acts[g] / free.acts[g] - 0.5) < 0.1, `${priced.acts[g]} of ${free.acts[g]}`);
  }
});

test("a capacity caps what waiting saves: the sniper's last 2 seconds", () => {
  // Uncapped it saves 8 s × 64 = 512 bits and spends them at up to 4 acts a second; capped at 1 s of income (64 bits)
  // it can afford at most (64 + 2 × 64) / 16.3 + 1 changes.
  const base = { durationSeconds: 10, startingObjectCount: 10 }, tuning = { ...DEFAULT_TUNING, sniperSeconds: 2 };
  const free = playGame(RULES, ["sniper", "greedy", "greedy"], sp, econ(base), seededRng("cap"), tuning);
  const capped = playGame(RULES, ["sniper", "greedy", "greedy"], sp, econ({ ...base, capacitySeconds: 1 }), seededRng("cap"), tuning);
  assert.ok(free.acts[0] > 0 && capped.acts[0] > 0);
  assert.ok(capped.readSpent[0] + capped.changeSpent[0] <= 64 * 3 + 20, `capped spent ${capped.readSpent[0] + capped.changeSpent[0]}`);
  assert.ok(free.changeSpent[0] >= capped.changeSpent[0]);
});

test("win shares split ties; profiles are multisets", () => {
  assert.deepEqual(winShares([5, 5, 3]), [0.5, 0.5, 0]);
  assert.deepEqual(winShares([1, 9, 3]), [0, 1, 0]);
  assert.equal(profiles(["greedy", "deny", "payoff"], 3).length, 10);
  assert.equal(profileKey(["payoff", "deny", "payoff"]), "deny+payoff+payoff");
});

test("the equilibrium finder on a hand-made dilemma: spoiling is the only equilibrium although building pays more", () => {
  const stats = (policies: Policy[], score: number[]): TableStats => ({ policies, games: 1, score, win: score.map(() => 0), relative: score, welfare: score.reduce((a, b) => a + b, 0),
    actsPerSecond: [], skipShare: [], readShare: 0, destroyedPerChange: [], ownBits: [], idleShare: 0 });
  const table = new Map([
    [profileKey(["cooperator", "cooperator"]), stats(["cooperator", "cooperator"], [3, 3])],
    [profileKey(["cooperator", "deny"]), stats(["cooperator", "deny"], [0, 5])],
    [profileKey(["deny", "deny"]), stats(["deny", "deny"], [1, 1])],
  ]);
  const found = equilibria(["cooperator", "deny"], 2, table, "score", 0);
  assert.deepEqual(found.filter(e => e.equilibrium).map(e => e.profile), [["deny", "deny"]]);
  const coop = found.find(e => e.profile.every(p => p === "cooperator"))!;
  assert.deepEqual(coop.best, { from: "cooperator", to: "deny", gain: 2 });
});
