/**
 * Goal annotations (src/explain, docs/annotations-design.md). Two kinds of test:
 *   - exhaustive agreement: for every lens, on every playable Grid shape where its family is applicable, for every param
 *     of its support, on seeded random boards, the exemplar and the goal example, the parts add up to the card's own
 *     ordinal (the program the engine scores with), so an annotation can never disagree with the score;
 *   - hand-derived cases on one literal First Steps board (4×4, base 10, rgb), each expectation worked out from the
 *     card's text by hand in the comments, for what a kid sees: which scoring units the board lists and points at, their facts and points.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeGrid, gridArgs, instantiate, seededRng, type Instantiation } from "@workspace/game-types";
import { applicable, canonicalSupport, context, evaluator, family, paramsKey } from "../src/catalog.ts";
import { playableInstantiations } from "../src/calibration.ts";
import { LENSES, addsUp, explainer, hitTest, lensFor, sortUnits, toneOf, type Explanation, type Part } from "../src/explain/index.ts";
import { readBoard } from "../src/explain/board.ts";
import type { Params } from "../src/types.ts";

const FIRST_STEPS = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });

/** A random wire value of a Grid instantiation. */
function randomWire(inst: Instantiation, seed: string): string {
  const args = gridArgs(inst), rng = seededRng(seed);
  const t = instantiate("Grid", args);
  const syms = (t.args.symbols === "cards" ? "A23456789TJQK".split("").flatMap(r => "SHDC".split("").map(s => r + s)) : "0123456789ABCDEF".slice(0, Number(String(t.args.symbols).slice(4))).split(""));
  const letters = { rgb: "RGB", rgby: "RGBY", rainbow6: "ROYGBV" }[String(args.colours)] ?? "RGB";
  const rows = Array.from({ length: args.size }, () => Array.from({ length: args.size }, () => syms[rng.int(syms.length)] + letters[rng.int(letters.length)]).join(","));
  return rows.join("/");
}

const paramsFor = (familyId: string, inst: Instantiation): Params[] => {
  const f = family(familyId), ctx = context(inst), out = new Map<string, Params>();
  for (const p of [...f.support(ctx), ...canonicalSupport(f, ctx)]) out.set(paramsKey(p), p);
  return [...out.values()];
};

test("every lens's parts add up to its card's score: every playable Grid shape, every param, seeded boards, exemplar and example", () => {
  let checked = 0;
  for (const l of LENSES) {
    const f = family(l.familyId);
    for (const inst of playableInstantiations("Grid")) {
      if (!applicable(f, inst).ok) continue;
      const params = paramsFor(l.familyId, inst);
      // Every param on First Steps; a sample of 6 elsewhere (the support of Magic Accountant has 27 per shape).
      const chosen = inst.key === FIRST_STEPS.key ? params : params.filter((_, i) => i % Math.ceil(params.length / 6) === 0);
      for (const p of chosen) {
        const goal = explainer({ familyId: l.familyId, params: p }, inst)!;
        const boards = Array.from({ length: inst.key === FIRST_STEPS.key ? 60 : 12 }, (_, i) => randomWire(inst, `explain:${l.familyId}:${paramsKey(p)}:${i}`));
        if (f.exemplar) boards.push(String(f.exemplar(p, context(inst))));
        // The example search is checked on First Steps (below and in the examples test); elsewhere random boards suffice.
        if (inst.key === FIRST_STEPS.key) boards.push(goal.example()!.value);
        for (const value of boards) {
          const e = goal.explain(value);
          assert.ok(e, `${l.familyId} explains ${value}`);
          assert.ok(e.verified, `${l.familyId} ${paramsKey(p)} on ${inst.key}: parts ${JSON.stringify(sums(e))} ≠ card ${JSON.stringify(e.ordinal)} for ${value}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 2000, `checked ${checked} boards`);
});

const sums = (e: Explanation) => e.components.map((_, k) => e.parts.reduce((s, p) => s + p.points[k], 0));

test("addsUp: a part that is off by one, or a missing component, is caught", () => {
  const part = (points: number[]): Part => ({ id: "x", shape: "cell", cells: [{ r: 0, c: 0 }], points, title: "", facts: [] });
  assert.equal(addsUp([part([1]), part([2])], 1, 3), true);
  assert.equal(addsUp([part([1]), part([2])], 1, 4), false);
  assert.equal(addsUp([part([1, -2]), part([0, -3])], 2, [1, -5]), true);
  assert.equal(addsUp([part([1, -2]), part([0, -3])], 2, [1, -4]), false, "the tie-break component is checked too");
  assert.equal(addsUp([part([1]), part([0, -3])], 2, [1, -3]), false, "every part carries every explained component");
  assert.equal(addsUp([], 1, 0), true, "no pieces, no points");
  assert.equal(addsUp([part([1])], 3, [1, 0]), false, "cannot explain more components than the score has");
});

// ------------------------------------------------------------------------------------------------
// one literal First Steps board
// ------------------------------------------------------------------------------------------------
//
//        c0   c1   c2   c3
//   r0   2R   5R   8R   1G
//   r1   4G   4B   4R   7G
//   r2   6B   3G   9R   0B
//   r3   1R   7B   3B   5G
const BOARD = "2R,5R,8R,1G/4G,4B,4R,7G/6B,3G,9R,0B/1R,7B,3B,5G";

function look(familyId: string, params: Params, value = BOARD) {
  const goal = explainer({ familyId, params }, FIRST_STEPS)!;
  const e = goal.explain(value)!;
  assert.ok(e.verified, `${familyId} adds up on the literal board`);
  const modes = goal.hover(value)!.modes;
  return {
    e, modes,
    /** The scoring unit with this id. */
    unit: (id: string): Part => e.parts.find(p => p.id === id)!,
    /** The unit the board picks with the pointer at cell (r, c)'s centre, in a hover mode (the first by default). */
    point: (r: number, c: number, mode?: string): Part | null =>
      hitTest(e.parts, mode ? modes.find(m => m.id === mode)! : modes[0], { x: c + 0.5, y: r + 0.5 }),
  };
}
const total = (e: Explanation, k = 0) => e.parts.reduce((s, p) => s + p.points[k], 0);

test("Parity Painter (even red, odd green): one unit per cell, +1 in its kind's colour, −1 in the other kind's", () => {
  const { e, point } = look("parity_painter", { even_or_red: "red", odd_or_black: "green", split: "parity" });
  // +1: 2R 8R 1G 4R 7G 3G 5G (7 cells); −1: 5R 4G 9R 1R (4 cells); 0: the blue cells. 7 − 4 = 3.
  assert.equal(e.ordinal, 3);
  assert.equal(e.parts.length, 16);
  const v = point(0, 1)!; // 5R: odd, wears red, the even numbers' colour: −1
  assert.equal(v.id, "cell:0,1");
  assert.deepEqual(v.points, [-1]);
  assert.deepEqual(v.facts.map(f => f.ok), [true, false]);
  assert.match(v.facts[1].text, /odd numbers should be green: this one is red/);
  assert.equal(toneOf(point(1, 1)!.points), "zero", "4B: blue is neither kind's colour");
  // The list: the seven +1 cells, then the four −1 cells, then the blue zeros.
  assert.deepEqual(sortUnits(e.parts).map(u => u.points[0]), [1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, 0, 0, 0, 0, 0]);
});

test("Set Spotter: one unit per trio; a hover mode per direction picks the trio centred under the pointer", () => {
  const { e, unit, point, modes } = look("set_spotter", {});
  // SETs: 2R 5R 8R (row 1: same colour, +3 steps), 4G 4B 4R (row 2: all colours, same number),
  // 2R 4G 6B (column 1: all colours, +2 steps), 5R 4B 3G (column 2: all colours, −1 steps). No diagonal trio is a SET.
  assert.equal(e.ordinal, 4);
  assert.deepEqual(modes.map(m => m.label), ["→", "↓", "↘", "↙"], "one hover mode per line direction");
  assert.deepEqual(sortUnits(e.parts).slice(0, 4).map(u => u.title), ["SET", "SET", "SET", "SET"]);
  // Pointing at 5R in the → mode picks the trio centred on it (2R 5R 8R, a SET); in ↓ mode, its column's top trio.
  assert.equal(point(0, 1, "right")!.id, "trio:0,0:right");
  assert.equal(point(1, 1, "down")!.id, "trio:0,1:down", "5R 4B 3G, centred on 4B");
  assert.equal(point(1, 1, "down-right")!.id, "trio:0,0:down-right");
  const miss = unit("trio:0,2:down");
  assert.equal(miss.title, "not a SET");
  assert.deepEqual(miss.facts, [{ text: "colours all the same (red)", ok: true }, { text: "numbers not evenly spaced (8, 4, 9)", ok: false }]);
  assert.deepEqual(unit("trio:1,0:right").facts,
    [{ text: "all 3 colours used (green, blue, red)", ok: true }, { text: "numbers all the same (4, 4, 4)", ok: true }]);
  assert.deepEqual(unit("trio:3,0:right").facts[0], { text: "two colours match and one doesn't (red, blue, blue)", ok: false });
});

test("Number Bonds: one unit per touching pair, picked on the board by the nearest shared edge", () => {
  const { e, point, unit, modes } = look("number_bonds", {});
  // 7 + 3 (row 4), 4 + 6 (column 1), 3 + 7 (column 2) make 10.
  assert.equal(e.ordinal, 3);
  assert.deepEqual(sortUnits(e.parts).slice(0, 3).map(u => u.points[0]), [1, 1, 1], "the three bonds lead the list");
  assert.deepEqual(unit("pair:2,1:down").facts, [{ text: "3 + 7 = 10", ok: true }]);
  assert.deepEqual(unit("pair:2,1:right").facts, [{ text: "3 + 9 = 12, not 10", ok: false }]);
  const near = (x: number, y: number) => hitTest(e.parts, modes[0], { x, y })!.id;
  assert.equal(near(1.5, 2.95), "pair:2,1:down", "near 3G's bottom edge: 3G + 7B");
  assert.equal(near(1.95, 2.5), "pair:2,1:right", "near its right edge: 3G + 9R");
  assert.ok(point(2, 1));
});

test("Colour Bonds: the pairs that make the target must also share a colour", () => {
  const { e, unit } = look("colour_bonds", {});
  assert.equal(e.ordinal, 1, "only 7B + 3B are the same colour");
  assert.deepEqual(unit("pair:2,1:down").facts, [{ text: "3 + 7 = 10", ok: true }, { text: "different colours (green, blue)", ok: false }],
    "3G + 7B: right sum, different colours");
});

test("Chessmaster: blocks score, touching pairs are the tie-break; two hover modes", () => {
  const { e, unit, point, modes } = look("chessmaster", { colour_a: "red", colour_b: "green" });
  // No 2×2 block alternates red and green; four red–green touches: 8R|1G, 4R|7G, 3G|9R, 2R over 4G.
  assert.deepEqual(e.ordinal, [0, 4]);
  assert.equal(total(e, 1), 4);
  assert.deepEqual(modes.map(m => m.id), ["block", "pair"]);
  assert.deepEqual(unit("block:0,2").facts.map(f => f.ok), [true, false, false], "8R 1G alternate on top; 8R over 4R does not; 8R vs 7G corners differ");
  // The block whose centre is nearest: just inside cell (1,2)'s top-left corner is block (0,1)'s centre.
  assert.equal(hitTest(e.parts, modes[0], { x: 2.05, y: 1.05 })!.id, "block:0,1");
  assert.equal(point(0, 3, "pair")!.id, "seam:0,2:right", "1G's only red touch: 8R|1G");
  const small = look("chessmaster", { colour_a: "red", colour_b: "green" }, "1R,1G,1R,1R/1G,1R,1R,1R/1R,1R,1R,1R/1R,1R,1R,1R");
  // One chessboard at the top-left; touches: 1R|1G, 1G|1R in row 1, 1G|1R in row 2, and the three downward ones.
  assert.deepEqual(small.e.ordinal, [1, 6]);
  assert.equal(sortUnits(small.e.parts)[0].title, "a little chessboard", "the chessboard leads the list");
});

test("Honest Minesweeper: one unit per non-mine cell (its 3×3 window), picked by the cell itself", () => {
  const { e, point, unit } = look("honest_minesweeper", { mine: "red" });
  // Only 3G (row 3) is honest: it touches 4R, 9R and 1R: 3 mines. It scores 3.
  assert.equal(e.ordinal, 3);
  const v = point(2, 1)!;
  assert.equal(v.id, "window:2,1", "the pointer picks the number under it, not a neighbour's window");
  assert.deepEqual(v.facts, [{ text: "shows 3, touches 3 mines", ok: true }]);
  assert.deepEqual(v.spots!.map(s => [s.cell.r, s.cell.c]), [[1, 2], [2, 2], [3, 0]]);
  assert.equal(v.title, "this 3 is honest");
  assert.equal(sortUnits(e.parts)[0].id, "window:2,1", "the one scoring number leads the list");
  assert.equal(unit("window:0,3").title, "this 1 is not honest");
});

test("Magic Accountant: one unit per line against the magic number; rows or columns, the line under the pointer", () => {
  const { e, unit, point } = look("magic_accountant", { axis: "rows", target: 16 });
  // Row totals 16, 19, 18, 16: two rows make 16; distance 0 + 3 + 2 + 0 = 5.
  assert.deepEqual(e.ordinal, [2, -5]);
  assert.deepEqual([unit("line:row 2").title, unit("line:row 2").points], ["row 2: 3 over", [0, -3]]);
  assert.deepEqual(unit("line:row 2").facts, [{ text: "4 + 4 + 4 + 7 = 19, not 16", ok: false }]);
  assert.equal(point(0, 2)!.id, "line:row 1", "the row under the pointer");
  const cols = look("magic_accountant", { axis: "cols", target: 16 });
  assert.equal(cols.point(0, 0)!.id, "line:column 1", "columns are the transposed peer: the column under the pointer");
});

test("Kingdom: one unit per patch of your colour; only the biggest scores", () => {
  const { e, point } = look("kingdom", { colour: "red" });
  // Red patches: 2R 5R 8R 4R 9R (5 cells) and 1R (1 cell). The biggest scores 5.
  assert.equal(e.ordinal, 5);
  assert.deepEqual(sortUnits(e.parts).map(p => [p.cells.length, p.points[0]]), [[5, 5], [1, 0]]);
  assert.deepEqual([point(3, 0)!.cells.length, point(0, 0)!.cells.length], [1, 5], "the patch under the pointer");
  const tie = look("kingdom", { colour: "red" }, "1R,1R,1G,1G/1G,1G,1G,1G/1G,1G,1G,1G/1G,1G,1R,1R");
  assert.equal(tie.e.ordinal, 2);
  assert.deepEqual(tie.e.parts.map(p => p.points[0]), [2, 0], "two biggest patches: only one scores");
  assert.match(tie.e.parts[1].facts[1].text, /as big as the biggest \(2\), but only one patch scores/);
});

test("Picture Frame: one piece per cell; an edge cell gains +1 for the colour or the symbol and +4 for both, a middle cell loses the same", () => {
  const p = { colour: "red", symbol: "5" };
  const { e, point } = look("picture_frame", p);
  // Edge: 2R 5R 8R 1G / 4G 7G / 6B 0B / 1R 7B 3B 5G. Middle: 4B 4R / 3G 9R.
  // Edge: 5R both (+4); 2R 8R 1R red (+1 each); 5G the symbol (+1); the other 7 neither. Middle: 4R 9R red (−1 each). 8 − 2 = 6.
  assert.equal(e.ordinal, 6);
  assert.equal(e.parts.length, 16);
  assert.deepEqual([point(0, 1)!.points], [[4]], "5R on the edge: both");
  assert.equal(point(0, 1)!.title, "an edge cell, +4 both");
  assert.deepEqual([point(3, 0)!.points], [[1]], "1R on the edge: the colour only");
  assert.equal(point(3, 0)!.title, "an edge cell, +1 right colour");
  assert.deepEqual(point(3, 3)!.facts, [{ text: "green, not red", ok: false }, { text: "shows 5: the right symbol", ok: true }]);
  assert.equal(point(3, 3)!.title, "an edge cell, +1 right symbol");
  assert.deepEqual([point(1, 2)!.points], [[-1]], "4R in the middle: red loses a point");
  assert.deepEqual(point(1, 2)!.facts, [{ text: "red: the middle should not be red", ok: false }, { text: "shows 4, not 5", ok: true }]);
  assert.equal(point(1, 1)!.title, "a clear middle cell");
  const bd = lensFor("picture_frame")!.breakdown(p, readBoard(FIRST_STEPS, BOARD)!, e.parts);
  assert.deepEqual(bd.items.map(i => [i.text, i.points[0]]), [
    ["1 red 5 edge cell: +4 each", 4],
    ["3 red edge cells without 5: +1 each", 3],
    ["1 edge cell showing 5, not red: +1 each", 1],
    ["7 edge cells neither red nor 5: no points", 0],
    ["2 red middle cells without 5: −1 each", -2],
    ["2 middle cells neither red nor 5: nothing lost", 0],
  ]);
  // The best board: every edge cell a red 1, nothing red and no 1 in the middle: 12 × 4.
  assert.equal(look("picture_frame", { colour: "red", symbol: "1" }, "1R,1R,1R,1R/1R,2G,3B,1R/1R,4G,5B,1R/1R,1R,1R,1R").e.ordinal, 48);
  // The worst: nothing on the edge, every middle cell a red 1: −4 × 4.
  assert.equal(look("picture_frame", { colour: "red", symbol: "1" }, "0G,2G,2G,3G/4G,1R,1R,5G/6G,1R,1R,7G/8G,9G,4G,5G").e.ordinal, -16);
});

test("Mirrormancer: one unit per row, folded onto itself, pairs as ✓/✗ arcs", () => {
  const { e, point } = look("mirrormancer", { axis: "LR" });
  // Rows (numbers): 2 5 8 1 (✗, ✗), 4 4 4 7 (1st/last 4,7 ✗; 2nd/3rd 4,4 ✓), 6 3 9 0 (✗, ✗), 1 7 3 5 (✗, ✗). No mirror; 1 pair.
  assert.deepEqual(e.ordinal, [0, 1]);
  const v = point(1, 2)!;
  assert.equal(v.id, "line:row:1");
  assert.deepEqual(v.facts, [{ text: "1st and last: 4, 7", ok: false }, { text: "2nd and 2nd-last: 4, 4", ok: true }]);
  assert.deepEqual(v.links!.map(l => [l.from.c, l.to.c, l.ok]), [[0, 3, false], [1, 2, true]]);
  assert.equal(look("mirrormancer", { axis: "TB" }).point(0, 0)!.id, "line:column:0");
});

test("goal examples: deterministic, in the room's own shape, verified, and they teach both sides", () => {
  for (const l of LENSES) {
    for (const p of paramsFor(l.familyId, FIRST_STEPS)) {
      const draw = { familyId: l.familyId, params: p };
      const a = explainer(draw, FIRST_STEPS)!.example()!, b = explainer(draw, FIRST_STEPS)!.example()!;
      assert.deepEqual(a, b, `${l.familyId} ${paramsKey(p)}: the same example every time`);
      decodeGrid(a.value, gridArgs(FIRST_STEPS));
      assert.equal(a.size, 4);
      const goal = explainer(draw, FIRST_STEPS)!, e = goal.explain(a.value)!;
      assert.ok(e.verified);
      const tones = new Set(e.parts.map(x => toneOf(x.points)));
      assert.ok(tones.has("gain"), `${l.familyId} ${paramsKey(p)}: the example scores something (${a.value})`);
      assert.ok(tones.size >= 2, `${l.familyId} ${paramsKey(p)}: the example shows a piece that doesn't score too`);
      assert.match(a.caption, /^This board scores \d+ points?/);
    }
  }
});

test("a family without a lens still gets an example board that scores, and no breakdown", () => {
  const draw = { familyId: "rainbow_steps", params: family("rainbow_steps").support(context(FIRST_STEPS))[0] };
  assert.equal(lensFor("rainbow_steps"), undefined);
  const goal = explainer(draw, FIRST_STEPS)!;
  assert.equal(goal.rich, false);
  const ex = goal.example()!;
  decodeGrid(ex.value, gridArgs(FIRST_STEPS));
  assert.equal(goal.explain(ex.value), null);
  assert.deepEqual(goal.score(ex.value), evaluator(draw, FIRST_STEPS)(ex.value));
  assert.match(ex.caption, /^This board scores/);
});

test("explain refuses what it cannot read: another shape's board, a non-Grid game", () => {
  const goal = explainer({ familyId: "set_spotter", params: {} }, FIRST_STEPS)!;
  assert.equal(goal.explain("1R,1R,1R/1R,1R,1R/1R,1R,1R"), null);
  assert.equal(goal.explain(42), null);
  assert.equal(explainer({ familyId: "digit-devotee", params: { digit: 0 } }, instantiate("Int", {})), null);
});
