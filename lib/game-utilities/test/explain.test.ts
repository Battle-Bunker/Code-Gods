/**
 * Goal annotations (src/explain, docs/annotations-design.md). Two kinds of test:
 *   - exhaustive agreement: for every lens, on every playable Grid shape where its family is applicable, for every param
 *     of its support, on seeded random boards, the exemplar and the goal example, the parts add up to the card's own
 *     ordinal (the program the engine scores with), so an annotation can never disagree with the score;
 *   - hand-derived cases on one literal First Steps board (4×4, base 10, rgb), each expectation worked out from the
 *     card's text by hand in the comments, for what a kid sees: which pieces a focus expands, their facts and points.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeGrid, gridArgs, instantiate, seededRng, type Instantiation } from "@workspace/game-types";
import { applicable, canonicalSupport, context, evaluator, family, paramsKey } from "../src/catalog.ts";
import { playableInstantiations } from "../src/calibration.ts";
import { LENSES, addsUp, explainer, lensFor, toneOf, type Explanation, type FocusView, type Part } from "../src/explain/index.ts";
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
  return { e, at: (r: number, c: number): FocusView => goal.focus(value, e, { r, c })! };
}
const ids = (v: FocusView) => v.parts.map(p => p.id);
const total = (e: Explanation, k = 0) => e.parts.reduce((s, p) => s + p.points[k], 0);

test("Parity Painter (even red, odd green): one piece per cell, and the outcome table rings the focus's kind and colour", () => {
  const { e, at } = look("parity_painter", { P: 0, Q: 1, key: "parity" });
  // +1: 2R 8R 1G 4R 7G 3G 5G (7 cells); −1: 5R 4G 9R 1R (4 cells); 0: the blue cells. 7 − 4 = 3.
  assert.equal(e.ordinal, 3);
  assert.equal(e.parts.length, 16);
  const v = at(0, 1); // 5R: odd, wears red, the even numbers' colour: −1
  assert.deepEqual(v.parts.map(p => p.points), [[-1]]);
  assert.deepEqual(v.parts[0].facts.map(f => f.ok), [true, false]);
  assert.match(v.parts[0].facts[1].text, /odd numbers should be green: this one is red/);
  assert.equal(v.headline, "Row 1, column 2: a red 5");
  const t = v.table!;
  assert.deepEqual(t.rows, ["even numbers", "odd numbers"]);
  assert.deepEqual(t.cols, ["red", "green", "blue"]);
  assert.deepEqual(t.entries.map(row => row.map(x => x.points)), [[1, -1, 0], [-1, 1, 0]]);
  assert.deepEqual(t.at, [1, 0], "odd row, red column");
  assert.equal(t.entries[1][0].sample.sym, 5, "the focus's own symbol represents its kind");
  assert.equal(t.entries[0][2].sample.sym % 2, 0, "the other kind is shown with an even symbol");
  assert.equal(toneOf(at(1, 1).parts[0].points), "zero", "4B: blue is neither kind's colour");
});

test("Set Spotter: a focus expands the trios that END at it, never ones where it is the middle", () => {
  const { e, at } = look("set_spotter", { diag: false });
  // SETs: 2R 5R 8R (row 1: same colour, +3 steps), 4G 4B 4R (row 2: all colours, same number),
  // 2R 4G 6B (column 1: all colours, +2 steps), 5R 4B 3G (column 2: all colours, −1 steps). Nothing else.
  assert.equal(e.ordinal, 4);
  assert.deepEqual(ids(at(0, 0)), ["trio:0,0:right", "trio:0,0:down"]);
  assert.deepEqual(at(0, 0).parts.map(p => p.title), ["SET", "SET"]);
  // 5R is the middle of 2R 5R 8R: that trio belongs to 2R and 8R, not to it.
  assert.deepEqual(ids(at(0, 1)).sort(), ["trio:0,1:down", "trio:0,1:right"]);
  assert.ok(!ids(at(0, 1)).includes("trio:0,0:right"));
  // 8R ends 2R 5R 8R (a SET) and starts 8R 4R 9R (same colour, not evenly spaced).
  const v = at(0, 2);
  assert.deepEqual(ids(v), ["trio:0,0:right", "trio:0,2:down"], "the SET first");
  const miss = v.parts[1];
  assert.equal(miss.title, "not a SET");
  assert.deepEqual(miss.facts, [{ text: "colours all the same (red)", ok: true }, { text: "numbers not evenly spaced (8, 4, 9)", ok: false }]);
  assert.deepEqual(at(1, 0).parts.find(p => p.id === "trio:1,0:right")!.facts,
    [{ text: "all 3 colours used (green, blue, red)", ok: true }, { text: "numbers all the same (4, 4, 4)", ok: true }]);
  assert.deepEqual(at(3, 0).parts.find(p => p.id === "trio:3,0:right")!.facts[0], { text: "two colours match and one doesn't (red, blue, blue)", ok: false });
});

test("Number Bonds: the pairs touching the focus, with their sums", () => {
  const { e, at } = look("number_bonds", { mode: "any" });
  // 7 + 3 (row 4), 4 + 6 (column 1), 3 + 7 (column 2) make 10.
  assert.equal(e.ordinal, 3);
  const v = at(2, 1); // 3G touches 6B (left), 9R (right), 4B (up), 7B (down)
  assert.deepEqual(v.parts.map(p => [p.id, p.points[0]]), [["pair:2,1:down", 1], ["pair:1,1:down", 0], ["pair:2,0:right", 0], ["pair:2,1:right", 0]],
    "the bond first, then the others in reading order");
  assert.deepEqual(v.parts[0].facts, [{ text: "3 + 7 = 10", ok: true }]);
  assert.deepEqual(v.parts[3].facts, [{ text: "3 + 9 = 12, not 10", ok: false }]);
  const same = look("number_bonds", { mode: "same" });
  assert.equal(same.e.ordinal, 1, "only 7B + 3B are the same colour");
  assert.deepEqual(same.at(2, 1).parts.find(p => p.id === "pair:2,1:down")!.facts.map(f => f.ok), [true, false], "3G + 7B: right sum, different colours");
});

test("Chessmaster: blocks score, seams are the tie-break", () => {
  const { e, at } = look("chessmaster", { A: 0, B: 1 });
  // No 2×2 block alternates red and green; four red–green touches: 8R|1G, 4R|7G, 3G|9R, 2R over 4G.
  assert.deepEqual(e.ordinal, [0, 4]);
  assert.equal(total(e, 1), 4);
  const v = at(0, 2); // 8R: blocks at (0,1) and (0,2); seam 8R|1G
  assert.deepEqual(ids(v), ["block:0,1", "block:0,2", "seam:0,2:right"]);
  assert.deepEqual(v.parts[1].facts.map(f => f.ok), [true, false, false], "8R 1G alternate on top; 8R over 4R does not; 8R vs 7G corners differ");
  const small = look("chessmaster", { A: 0, B: 1 }, "1R,1G,1R,1R/1G,1R,1R,1R/1R,1R,1R,1R/1R,1R,1R,1R");
  // One chessboard at the top-left; touches: 1R|1G, 1G|1R in row 1, 1G|1R in row 2, and the three downward ones.
  assert.deepEqual(small.e.ordinal, [1, 6]);
  assert.equal(small.at(0, 0).parts[0].title, "a little chessboard");
});

test("Honest Minesweeper: the focus's own 3×3 window; a mine shows the cells that count it", () => {
  const { e, at } = look("honest_minesweeper", { X: 0 });
  // Only 3G (row 3) is honest: it touches 5R? no — 4R, 9R and 1R: 3 mines. It scores 3.
  assert.equal(e.ordinal, 3);
  const v = at(2, 1);
  assert.deepEqual(ids(v), ["window:2,1"]);
  assert.deepEqual(v.parts[0].facts, [{ text: "shows 3, touches 3 mines", ok: true }]);
  assert.deepEqual(v.parts[0].spots!.map(s => [s.cell.r, s.cell.c]), [[1, 2], [2, 2], [3, 0]]);
  const mine = at(2, 2); // 9R is a mine
  assert.match(mine.note!, /mine: it scores nothing itself/);
  assert.equal(mine.parts[0].id, "window:2,1", "the honest cell that counts it comes first");
  assert.equal(mine.parts.length, 3, "a mine shows at most 3 of the cells that count it");
  assert.equal(v.parts[0].title, "this 3 is honest");
  assert.ok(mine.parts.every(p => p.cells.slice(1).some(x => x.r === 2 && x.c === 2)));
});

test("Magic Accountant: the focus's row against the magic number, with the tie-break distance", () => {
  const { e, at } = look("magic_accountant", { axis: "rows", T: 16 });
  // Row totals 16, 19, 18, 16: two rows make 16; distance 0 + 3 + 2 + 0 = 5.
  assert.deepEqual(e.ordinal, [2, -5]);
  assert.deepEqual(at(1, 3).parts.map(p => [p.title, p.points]), [["row 2: 3 over", [0, -3]]]);
  assert.deepEqual(at(1, 3).parts[0].facts, [{ text: "4 + 4 + 4 + 7 = 19, not 16", ok: false }]);
  assert.deepEqual(look("magic_accountant", { axis: "both", T: 16 }).at(0, 0).parts.map(p => p.id), ["line:row 1", "line:column 1"]);
});

test("Kingdom: the focus's patch, and the biggest patch, which alone scores", () => {
  const { e, at } = look("kingdom", { C: 0 });
  // Red patches: 2R 5R 8R 4R 9R (5 cells) and 1R (1 cell). The biggest scores 5.
  assert.equal(e.ordinal, 5);
  assert.deepEqual(at(3, 0).parts.map(p => [p.cells.length, p.points[0]]), [[1, 0], [5, 5]]);
  assert.match(at(1, 1).note!, /This cell is blue: only red patches count/);
  assert.deepEqual(at(1, 1).parts.map(p => p.points[0]), [5], "a non-red focus still sees what scores");
  const tie = look("kingdom", { C: 0 }, "1R,1R,1G,1G/1G,1G,1G,1G/1G,1G,1G,1G/1G,1G,1R,1R");
  assert.equal(tie.e.ordinal, 2);
  assert.deepEqual(tie.e.parts.map(p => p.points[0]), [2, 0], "two biggest patches: only one scores");
  assert.match(tie.e.parts[1].facts[1].text, /as big as the biggest \(2\), but only one patch scores/);
});

test("Picture Frame: the whole edge, its breakers, and a note for cells that never matter", () => {
  const { e, at } = look("picture_frame", { X: 0 });
  assert.equal(e.ordinal, 0);
  const v = at(1, 1);
  assert.equal(v.note, "This cell is inside the frame: it never changes your score.");
  assert.deepEqual(v.parts[0].facts, [{ text: "4 of 12 edge cells are red", ok: false }]);
  assert.equal(v.parts[0].spots!.length, 8);
  assert.match(at(0, 3).note!, /green: it breaks the frame/);
  assert.equal(look("picture_frame", { X: 0 }, "1R,1R,1R,1R/1R,1G,1B,1R/1R,1B,1G,1R/1R,1R,1R,1R").e.ordinal, 1);
});

test("Mirrormancer: the focus's row folded onto itself, pairs as ✓/✗ arcs", () => {
  const { e, at } = look("mirrormancer", { axis: "LR", layer: "colour" });
  // Rows: R R R G (1st/last R,G ✗; 2nd/3rd R,R ✓), G B R G (✓, ✗), B G R B (✓, ✗), R B B G (✗, ✓). No mirror; 4 pairs.
  assert.deepEqual(e.ordinal, [0, 4]);
  const v = at(1, 2);
  assert.deepEqual(v.parts.map(p => p.id), ["line:row:1"]);
  assert.deepEqual(v.parts[0].facts, [{ text: "1st and last: green, green", ok: true }, { text: "2nd and 2nd-last: blue, red", ok: false }]);
  assert.deepEqual(v.parts[0].links!.map(l => [l.from.c, l.to.c, l.ok]), [[0, 3, true], [1, 2, false]]);
  assert.deepEqual(look("mirrormancer", { axis: "TB", layer: "symbol" }).at(0, 0).parts[0].id, "line:column:0");
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
      assert.ok(tones.size >= 2 || l.familyId === "picture_frame", `${l.familyId} ${paramsKey(p)}: the example shows a piece that doesn't score too`);
      assert.match(a.caption, /^This board scores \d+ points?/);
      const v = goal.focus(a.value, e, a.focus)!;
      assert.ok(v.parts.length > 0 || v.table, `${l.familyId}: the default focus expands something`);
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
  const goal = explainer({ familyId: "set_spotter", params: { diag: false } }, FIRST_STEPS)!;
  assert.equal(goal.explain("1R,1R,1R/1R,1R,1R/1R,1R,1R"), null);
  assert.equal(goal.explain(42), null);
  assert.equal(explainer({ familyId: "digit-devotee", params: { d: 0 } }, instantiate("Int", {})), null);
});
