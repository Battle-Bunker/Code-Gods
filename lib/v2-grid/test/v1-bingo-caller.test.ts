import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateSite, type Q } from "@workspace/v2-core";
import { gridType, gridType2, grid2, grid4, gridPresets, type GridState } from "../src/index.ts";
import { board } from "./helpers.ts";

const fam = gridType.families.find(f => f.id === "bingo-caller")!;
const LOW = { called: [0, 1, 2, 3] };
const terms = (s: GridState, params: unknown = LOW) =>
  Object.fromEntries(evaluateSite(gridType, fam, params, s, grid4, 0, null).terms.map(t => [t.id, Number((t.value as Q).n)]));

test("Bingo Caller: a dab scores 1, each complete row, column or long diagonal 4 more", () => {
  // No dabs.
  assert.deepEqual(terms(board("9999", "9999", "9999", "9999")), { bingo: 0, "near-bingo": 0, "big-dabs": 0, "diagonal-dabs": 0 });
  // Row 0 dabbed (BINGO): 4 + 4. Columns and the diagonals each hold one dab.
  assert.deepEqual(terms(board("0123", "9999", "9999", "9999")), { bingo: 8, "near-bingo": 0, "big-dabs": 6, "diagonal-dabs": 2 });
  // Every cell dabbed: 16 dabs and 10 BINGOs.
  assert.deepEqual(terms(board("3333", "3333", "3333", "3333")), { bingo: 56, "near-bingo": 0, "big-dabs": 48, "diagonal-dabs": 8 });
  // The main diagonal and row 0 dabbed except the top-left cell: 6 dabs, no BINGO; row 0 and the diagonal one short.
  assert.deepEqual(terms(board("9123", "9199", "9929", "9993")), { bingo: 6, "near-bingo": 2, "big-dabs": 12, "diagonal-dabs": 4 });
});

test("Bingo Caller: the called numbers are the dealt parameter", () => {
  const s = board("6789", "0000", "0000", "0000");
  assert.equal(terms(s, { called: [6, 7, 8, 9] }).bingo, 8);
  assert.equal(terms(s, LOW).bingo, 12 + 3 * 4);   // rows 1–3 BINGO; nothing else complete
});

test("Bingo Caller: v1's support (every set of 4 of the 10 digits, the dealt set first) and its card", () => {
  const ps = fam.dealable(grid4) as { called: number[] }[];
  assert.equal(ps.length, 210);
  assert.equal(new Set(ps.map(p => p.called.join())).size, 210);
  assert.deepEqual(ps.slice(0, 2), [{ called: [1, 4, 6, 9] }, LOW]);
  assert.equal(gridType2.families.find(f => f.id === "bingo-caller")!.dealable(grid2).length, 3);   // 1 of 0–2
  assert.equal(fam.card({ called: [1, 4, 6, 9] }, null),
    "Your called numbers are 1, 4, 6 and 9. Dab every cell showing one of them: each dab scores 1 point. A complete row, column or long diagonal of dabs is BINGO and scores 4 more points. Score as many points as possible.");
  assert.match(fam.card(LOW, "near-bingo"), /Secondary: As many rows, columns and long diagonals as possible should be one dab short of BINGO\.$/);
  assert.deepEqual(fam.tieBreakers.map(t => t.id), ["near-bingo", "big-dabs", "diagonal-dabs"]);
});

test("Bingo Caller is dealt in Grids · more rules with one called set and its three tie-breakers", () => {
  const rules = gridPresets.find(p => p.id === "grids-more-rules")!.rules.filter(r => r.family === "bingo-caller");
  assert.deepEqual(rules, [{ family: "bingo-caller", params: { called: [1, 4, 6, 9] }, tieBreakers: ["near-bingo", "big-dabs", "diagonal-dabs"] }]);
});
