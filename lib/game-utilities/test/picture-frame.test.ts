/**
 * 🖼️ Picture Frame (owner's redesign, 2026-11-03): a dealt colour and a dealt symbol. Each edge cell scores +1 with the
 * colour or the symbol and +4 with both; each middle cell loses the same (the "clear middle", FRAME_POINTS). What would
 * break: a cell scored by another table, a "most common" inference creeping back, or the lens disagreeing with the card.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { card, context, evaluator, explainer, family } from "../src/index.ts";
import { FRAME_POINTS } from "../src/families/grid/strategy.ts";

const rgb = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" });
const draw = { familyId: "picture_frame", params: { colour: "red", symbol: "7" } };
const u = evaluator(draw, rgb);
// Every cell "0B": neither red nor 7, so a board of them scores 0.
const blank = () => Array.from({ length: 4 }, () => Array<string>(4).fill("0B"));
const wire = (cells: string[][]) => cells.map(r => r.join(",")).join("/");
const withCell = (r: number, c: number, cell: string) => { const b = blank(); b[r][c] = cell; return wire(b); };
const HAS: Record<string, string> = { none: "0B", colour: "0R", symbol: "7B", both: "7R" };

test("the scoring table: edge +0/+1/+1/+4, middle 0/−1/−1/−4 for none, colour, symbol, both", () => {
  assert.deepEqual(FRAME_POINTS, { edge: { none: 0, one: 1, both: 4 }, middle: { none: 0, one: -1, both: -4 } });
  assert.equal(u(wire(blank())), 0);
  const expected = { edge: { none: 0, colour: 1, symbol: 1, both: 4 }, middle: { none: 0, colour: -1, symbol: -1, both: -4 } };
  for (const [where, [r, c]] of [["edge", [0, 2]], ["middle", [1, 2]]] as const) {
    for (const has of ["none", "colour", "symbol", "both"] as const) {
      assert.equal(u(withCell(r, c, HAS[has])), expected[where][has], `${where} ${has}`);
    }
  }
  // Additive over cells: a full frame of both, a clear middle, is the top.
  const frame = blank().map((row, r) => row.map((x, c) => (r === 0 || c === 0 || r === 3 || c === 3 ? "7R" : x)));
  assert.equal(u(wire(frame)), 4 * 12);
  assert.equal(family("picture_frame").top!(draw.params, context(rgb)), 48);
});

test("both the colour and the symbol are dealt params, typed, with no 'most common' inference", () => {
  const f = family("picture_frame"), fields = f.params!(context(rgb));
  assert.deepEqual(fields.map(x => [x.key, x.kind]), [["colour", "colour"], ["symbol", "symbol"]]);
  assert.equal(f.support(context(rgb)).length, 3 * 10);
  // The symbol is fixed by the params: a board full of another symbol on the edge earns it nothing.
  assert.equal(u(wire(blank().map((row, r) => row.map((x, c) => (r === 0 ? "3B" : x))))), 0);
  const c = card(draw, context(rgb));
  assert.match(c.source.typescript, /MY_SYMBOL = "7"/);
  assert.match(c.summary, /red/);
  assert.match(c.summary, /7/);
  assert.doesNotMatch(c.summary, /best|most common/i);
});

test("the lens explains each cell: +1 right colour, +1 right symbol, +4 both, and adds up to the card", () => {
  const board = wire([["7R", "0R", "7B", "0B"], ["0B", "7R", "0R", "0B"], ["0B", "7B", "0B", "0B"], ["0B", "0B", "0B", "7R"]]);
  const goal = explainer(draw, rgb)!, e = goal.explain(board)!;
  assert.equal(e.verified, true);
  assert.equal(e.ordinal, 4 + 1 + 1 - 4 - 1 - 1 + 4);
  const title = (r: number, c: number) => e.parts.find(p => p.cells[0].r === r && p.cells[0].c === c)!.title;
  assert.match(title(0, 0), /\+4 both/);
  assert.match(title(0, 1), /\+1 right colour/);
  assert.match(title(0, 2), /\+1 right symbol/);
  assert.match(title(1, 1), /−4 both/);
  assert.match(title(1, 2), /−1 right colour/);
});
