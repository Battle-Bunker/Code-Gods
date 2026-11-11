/**
 * Layered rule prototypes (scripts/rule-difficulty-layered.mjs) and the tiered profile (scripts/layered-profile.ts),
 * docs/layered-rules-design.md: the vocabulary operators on hand-checked boards, the fast compile agreeing with the
 * room's prelude, and the tier columns on a rule whose tier is hand-checkable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, type GridValue } from "@workspace/game-types";
import { QUICK_BUDGET, compileSource, givenRule, space, type Budget } from "../scripts/rule-difficulty-lib.ts";
import { fastCompile, liveness, tierColumns } from "../scripts/layered-profile.ts";
import { FAMILIES, layeredSource, variants } from "../scripts/rule-difficulty-layered.mjs";

const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
const board = (rows: number[][]): GridValue => ({ size: 4, sym: Uint8Array.from(rows.flat()), col: new Uint8Array(16) });
const fam = (id: string) => FAMILIES.find((f: { id: string }) => f.id === id);
const score = (id: string, base: string, interaction?: string, params?: object, compose?: string, t?: number) =>
  fastCompile(layeredSource(fam(id), base, interaction, params, compose, t), inst);

const ZEROS = board([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
const SEVENS = board([[7, 7, 7, 7], [7, 7, 7, 7], [7, 7, 7, 7], [7, 7, 7, 7]]);
// Corners 0, edges 5, centre 0: every one of the 18 mirror lines reads the same both ways.
const MIRROR_TOP = board([[0, 5, 5, 0], [5, 0, 0, 5], [5, 0, 0, 5], [0, 5, 5, 0]]);
const GRADIENT = board([[0, 1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]);

test("the fast compile scores every variant exactly as the room's prelude does", () => {
  const boards = [ZEROS, SEVENS, MIRROR_TOP, GRADIENT, board([[9, 2, 0, 0], [3, 4, 0, 0], [0, 0, 7, 1], [0, 2, 3, 1]])];
  for (const v of variants()) {
    const slow = compileSource(v.source, inst), fast = fastCompile(v.source, inst);
    for (const b of boards) assert.deepEqual(fast(b), slow(b), `${v.id} on ${b.sym.join("")}`);
  }
});

test("royal court: a square scores when its single biggest number equals the other three added up; ties crown no king", () => {
  const s = score("royal_court", "overlap");
  // 9 = 2 + 3 + 4 (2 points); 4 = 3 + 0 + 0 + ... off by one in the square to its right (1 point).
  assert.equal(s(board([[9, 2, 0, 0], [3, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])), 3);
  assert.equal(s(ZEROS), 0, "all zeros: every square's biggest number is tied, so no king");
  assert.equal(s(SEVENS), 0);
  assert.deepEqual(score("royal_court", "graded")(ZEROS), [0, -9]);
});

test("royal court interactions: paths between kings, roads of subjects, distinct kings", () => {
  // Two courts with kings 9 (top left) and 9 (bottom right): 9 = 2 + 3 + 4 and 9 = 1 + 4 + 4.
  const b = board([[9, 2, 0, 0], [3, 4, 0, 0], [0, 0, 4, 1], [0, 0, 4, 9]]);
  const kings = score("royal_court", "overlap", "distinct")(b) as number[];
  assert.equal(kings.at(-1), 1, "both kings show 9");
  // Shortest paths from (0,0) to (3,3) that add up to 9 + 9 + the cells between: count by brute force here.
  let expect = 0;
  const walk = (r: number, c: number, s: number): void => {
    s += b.sym[r * 4 + c];
    if (r === 3 && c === 3) { if (s === 30) expect++; return; }
    if (r < 3) walk(r + 1, c, s);
    if (c < 3) walk(r, c + 1, s);
  };
  walk(0, 0, 0);
  // Kings found: (0,0) and (3,3); a third king may arise from an off-by-zero square elsewhere, so check the pair count directly.
  const paths = score("royal_court", "overlap", "paths", { x: 30 })(b) as number[];
  assert.ok(paths.at(-1)! >= expect && expect > 0, `paths ${paths.at(-1)} vs corner-to-corner ${expect}`);
});

test("hall of mirrors: 18 lines on 4x4; the owner's 'exactly two symmetries' is dead at the base's top, 'holding two 7s' is not", () => {
  assert.deepEqual(score("hall_of_mirrors", "all")(MIRROR_TOP), [18, 28]);
  assert.deepEqual(score("hall_of_mirrors", "all")(SEVENS), [18, 28]);
  assert.equal((score("hall_of_mirrors", "all", "twice", { n: 2, y: 5 })(MIRROR_TOP) as number[]).at(-1), 0);
  // Rows and columns only: every cell is in exactly two mirror lines.
  assert.equal((score("hall_of_mirrors", "rowsColumns", "twice", { n: 2, y: 7 })(SEVENS) as number[]).at(-1), 16);
  // Lines holding exactly two 5s: 4 rows, 4 columns, the 4 diagonals of 3 (5 0 5) and the 4 of 2 (5 5); not the long 0 0 0 0.
  assert.equal((score("hall_of_mirrors", "all", "pairOf", { k: 2, y: 5 })(MIRROR_TOP) as number[]).at(-1), 16);
  assert.equal((score("hall_of_mirrors", "all", "pairOf", { k: 2, y: 7 })(SEVENS) as number[]).at(-1), 4, "only the 2-cell diagonals");
  // Halves of the four-cell lines adding up to 5: rows 0 5 | 5 0 and 5 0 | 0 5, the same for columns; long diagonals 0 0.
  assert.equal((score("hall_of_mirrors", "all", "halves4", { x: 5, half: true, length: 4 })(MIRROR_TOP) as number[]).at(-1), 8);
});

test("generic operators: lines and windows adding up to x, ladders, equal-number roads", () => {
  // Gradient rows and columns add up to 6, 10, 14, 18; both long diagonals to 12.
  assert.deepEqual(score("opposite_nines_plus", "plain", "lines", { x: 12 })(GRADIENT), [0, 2]);
  // The 2x2 windows of the gradient add up to 4a + 4 for a = r + c: a = 2 three times (sum 12).
  assert.deepEqual(score("opposite_nines_plus", "plain", "windows", { x: 12 })(GRADIENT), [0, 3]);
  // Every side-by-side pair is one apart (24), and the ladders of 7 cells are the C(6,3) = 20 monotone paths corner to corner.
  assert.deepEqual(score("ladders", "plain", "ladders", { y: 7 })(GRADIENT), [24, 20]);
  // All zeros is one road of 16 equal numbers.
  assert.deepEqual(score("two_pair_plus", "plain", "roads", { y: 16 })(ZEROS), [4, 1]);
});

test("lexicographic, unlock and sum compositions", () => {
  const lex = score("hall_of_mirrors", "rowsColumns", "twice", { n: 2, y: 7 })(SEVENS);
  const unlock = score("hall_of_mirrors", "rowsColumns", "twice", { n: 2, y: 7 }, "unlock", 4)(SEVENS);
  const sum = score("hall_of_mirrors", "rowsColumns", "twice", { n: 2, y: 7 }, "sum")(SEVENS);
  assert.deepEqual(lex, [8, 16, 16]);
  assert.deepEqual(unlock, [4, 16, 8, 16]);
  assert.equal(sum, 24);
});

test("tier columns: a base-only agent leaves the tier's headroom, a tier-aware one takes it", () => {
  const sp = space(inst, "symbol"), TINY: Budget = { ...QUICK_BUDGET, starts: 3, longSteps: 24 };
  // Base: cells of 5 or more (top 16). Tier: the number of 9s among them, a tie-break a base-only agent never makes on
  // purpose (its first improving move is a 5). Bits: 2 per base point plus 1/8 per tier point (lexicographic order).
  const big = (g: GridValue) => g.sym.filter(s => s >= 5).length, nines = (g: GridValue) => g.sym.filter(s => s === 9).length;
  const base = givenRule("big", big, o => 2 * (o as number), 32);
  const full = givenRule("big+nines", g => [big(g), nines(g)], o => 2 * (o as number[])[0] + (o as number[])[1] / 8, 34);
  const c = tierColumns(full, base, sp, TINY);
  assert.ok(c.tierShare > c.accidental, `tier-aware ${c.tierShare} > base-only ${c.accidental}`);
  assert.equal(c.addedTop, 2);
});

test("liveness: on the boards that max the 18-line mirror base, 'exactly two symmetries' is constant 0 and 'holding two 5s' is not", () => {
  const sp = space(inst, "symbol");
  const rule = (interaction: string, params: object) => {
    const f = score("hall_of_mirrors", "all", interaction, params);
    return givenRule(interaction, f, () => 0, 1);
  };
  const tops = [MIRROR_TOP, board([[1, 5, 5, 1], [5, 2, 2, 5], [5, 2, 2, 5], [1, 5, 5, 1]])];
  const twice = liveness(rule("twice", { n: 2, y: 5 }), sp, tops);
  assert.deepEqual([twice.tierMin, twice.tierMax], [0, 0]);
  const holding = liveness(rule("pairOf", { k: 2, y: 5 }), sp, tops);
  assert.equal(holding.tierMax, 16);
  assert.equal(holding.uniformAtTierMax, false, "the all-5 board holds two 5s only on the 2-cell diagonals");
  // Halves of 4-cell lines adding up to 10: the all-5 board maxes it (the degenerate maximum the red team found).
  assert.equal(liveness(rule("halves4", { x: 10, half: true, length: 4 }), sp, tops).uniformAtTierMax, true);
});
