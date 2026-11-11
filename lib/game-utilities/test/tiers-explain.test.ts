/**
 * Annotations of tiered draws (src/explain/tier-lenses.ts; docs/layered-rules-design.md §4): a tiered draw is explained
 * by its base's lens plus one tier lens per interaction, with no per-family code. For 🙃 Opposite Nines on 4×4 digits
 * (ordinal [nines, −distance, tier], the tier counting once nines ≥ the gate) every board's units add up to the card
 * program's own ordinal on all three components, a board below the gate has no tier units, and the board can point at
 * every unit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate, seededRng } from "@workspace/game-types";
import { context, evaluator, family, paramsKey } from "../src/catalog.ts";
import { addsUp, aimAt, explainer, groupOf, hitTest, lensFor, readBoard, type Explanation } from "../src/explain/index.ts";
import { TIER_LENSES, tieredLens } from "../src/explain/tier-lenses.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { withTiers } from "../src/families/grid/tiers.ts";
import { ninesTiers } from "../src/families/grid/beginner/opposite_nines.ts";
import type { Params } from "../src/types.ts";

const INST = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const CTX = context(INST), G = gridSpec(CTX), F = family("opposite_nines");
const GATE = 6;

const wireOf = (digits: number[]) => Array.from({ length: 4 }, (_, r) => digits.slice(r * 4, r * 4 + 4).map(d => `${d}P`).join(",")).join("/");
const digitsOf = (wire: string) => wire.split("/").flatMap(row => row.split(",").map(t => Number(t[0])));
/** Every opposite pair on 9 and every row, column and long diagonal on 18. */
const MAGIC = [8, 1, 2, 7, 3, 6, 5, 4, 5, 4, 3, 6, 2, 7, 8, 1];

/** Random boards, the exemplar (every pair on 9), and the exemplar with 1 to 4 cells changed (around the gate). */
function boards(p: Params): string[] {
  const rng = seededRng(`tiers-explain:${paramsKey(p)}`);
  const out = Array.from({ length: 200 }, () => wireOf(Array.from({ length: 16 }, () => rng.int(10))));
  // The base's exemplar (the family's exemplar of a tiered draw is a search, seconds long: checked once, below).
  const top = String(F.exemplar!({} as never, CTX));
  out.push(top, wireOf(MAGIC));
  for (let k = 0; k < 120; k++) {
    const d = digitsOf(k % 2 ? top : wireOf(MAGIC));
    for (let j = 0; j <= k % 4; j++) d[rng.int(16)] = rng.int(10);
    out.push(wireOf(d));
  }
  return out;
}

const sums = (e: Explanation) => e.components.map((_, k) => e.parts.reduce((s, part) => s + part.points[k], 0));
const allGated = F.tiered!(CTX, 1) as Params[];
const xOf = (p: Params) => (p.tiers as { x: number }[])[0].x;
/** A sample of the dealt line totals (every third, and 18: the middle total, where the exemplar's lines all score). */
const gated = allGated.filter((p, i) => i % 3 === 0 || xOf(p) === 18);
const squares = withTiers(ninesTiers, {}, [{ id: "squares", x: 18 }], G) as Params;

test("the tiered draws of Opposite Nines exist on 4×4 digits and their interactions have a tier lens", () => {
  assert.ok(gated.length >= 3);
  for (const p of [...gated, squares]) for (const t of p.tiers as { id: string; gate: number }[]) {
    assert.ok(TIER_LENSES[t.id], `a tier lens for ${t.id}`);
    assert.equal(t.gate, GATE);
  }
});

test("a tiered draw's units add up to the card's ordinal on all three components; below the gate no unit carries tier points", () => {
  let above = 0, below = 0, tierPoints = 0;
  for (const p of gated) {
    const draw = { familyId: "opposite_nines", params: p }, goal = explainer(draw, INST)!, card = evaluator(draw, INST);
    assert.ok(goal?.rich, "a tiered draw has a rich annotation");
    for (const value of boards(p)) {
      const e = goal.explain(value), where = `${paramsKey(p)} ${value}`;
      assert.ok(e, where);
      const ord = card(value) as number[];
      assert.equal(e.components.length, 3, where);
      assert.deepEqual(sums(e), ord, where);
      assert.ok(e.verified, where);
      for (const part of e.parts) assert.equal(part.points.length, 3, where);
      const tier = e.parts.filter(part => part.points[2] !== 0), status = e.tiers?.[0];
      assert.ok(status, "the explanation says where its tier stands");
      assert.equal(status.id, (p.tiers as { id: string }[])[0].id);
      assert.equal(status.index, 2);
      if (ord[0] < GATE) {
        below++;
        assert.equal(tier.length, 0, where);
        assert.ok(e.parts.every(part => !part.id.startsWith("tier")), `no tier units below the gate: ${where}`);
        assert.equal(status.open, false);
        assert.equal(status.short, GATE - ord[0]);
        assert.match(status.note, new RegExp(`^${GATE - ord[0]} more opposite pairs? `), where);
      } else {
        above++;
        tierPoints += ord[2];
        assert.equal(status.open, true);
        assert.equal(status.short, 0);
        assert.ok(e.parts.some(part => part.id.startsWith("tier")), `tier units (hits and near misses) from the gate on: ${where}`);
        // Tier units score the tier only, never the base.
        for (const part of e.parts.filter(x => x.id.startsWith("tier"))) assert.deepEqual(part.points.slice(0, 2), [0, 0], where);
      }
      // The board can point at every unit: each is in exactly one hover mode, and aiming at it there picks it.
      const modes = goal.hover(value)!.modes;
      for (const part of e.parts) {
        const mine = modes.filter(m => m.groups.includes(groupOf(part)));
        assert.equal(mine.length, 1, `${part.id} is in one hover mode: ${where}`);
        assert.equal(hitTest(e.parts, mine[0], aimAt(part))?.id, part.id, `${part.id} can be pointed at: ${where}`);
      }
      assert.equal(new Set(e.parts.map(part => part.id)).size, e.parts.length, "unit ids are unique");
    }
  }
  assert.ok(above > 100 && below > 500 && tierPoints > 50, `boards above ${above}, below ${below}, tier points ${tierPoints}`);
});

test("hand-derived: every pair on 9 and every line on 18 scores (8, 0, 10), one unit per line", () => {
  //   8 1 2 7     opposite pairs: 8+1, 1+8, 2+7, 7+2, 3+6, 6+3, 5+4, 4+5: all 9, so 8 primary points, 0 away.
  //   3 6 5 4     rows 18 18 18 18; columns 8+3+5+2, 1+6+4+7, 2+5+3+8, 7+4+6+1: all 18;
  //   5 4 3 6     diagonals 8+6+3+1 = 18 and 7+5+4+2 = 18: 10 lines, 10 tertiary points.
  //   2 7 8 1
  const p = gated.find(x => xOf(x) === 18)!;
  const goal = explainer({ familyId: "opposite_nines", params: p }, INST)!;
  const value = wireOf(MAGIC);
  const e = goal.explain(value)!;
  assert.deepEqual(e.ordinal, [8, 0, 10]);
  assert.deepEqual(e.components, ["opposite pairs adding up to 9", "how far the pairs are from 9", "rows, columns and long diagonals adding up to 18"]);
  const lines = e.parts.filter(part => part.points[2] === 1);
  assert.equal(lines.length, 10);
  assert.ok(lines.every(l => l.shape === "line" && l.cells.length === 4));
  const row2 = lines.find(l => l.title === "Row 2 adds up to 18")!;
  assert.deepEqual(row2.cells, [0, 1, 2, 3].map(c => ({ r: 1, c })));
  assert.deepEqual(row2.facts, [{ text: "3 + 6 + 5 + 4 = 18", ok: true, tier: 2 }]);
  // The toggle above the board offers the base's units, then the tier's.
  assert.deepEqual(goal.hover(value)!.modes.map(m => m.label), ["Opposite pairs", "★ Rows", "★ Columns", "★ Diagonals"]);

  // One cell off: 8 → 7 in the corner. Its pair makes 8 (1 away): (7, −1, …) and row 1, column 1 and a diagonal miss by 1.
  const near = goal.explain(wireOf([7, ...MAGIC.slice(1)]))!;
  assert.deepEqual(near.ordinal, [7, -1, 7]);
  const row1 = near.parts.find(part => part.id === "tier2:row:0")!;
  assert.deepEqual(row1.points, [0, 0, 0]);
  assert.equal(row1.title, "Row 1: 1 short of 18");
  assert.deepEqual(row1.facts, [{ text: "7 + 1 + 2 + 7 = 17, not 18", ok: false, tier: 2 }]);
});

test("the 2×2 squares tier (an interaction the family does not deal today): its lens adds up to the card too", () => {
  // Not in the family's dealt params, so no explainer: the tiered lens directly, against the card program.
  const l = tieredLens(lensFor("opposite_nines")!, q => F.cardTiers!(q as never, CTX)), card = evaluator({ familyId: "opposite_nines", params: squares }, INST);
  let scored = 0;
  for (const value of boards(squares)) {
    const b = readBoard(INST, value)!, parts = l.parts(squares, b), ord = card(value) as number[];
    assert.ok(addsUp(parts, l.components(squares, b).length, ord), value);
    assert.equal(l.components(squares, b).length, 3);
    assert.equal(parts.some(part => part.shape === "block"), ord[0] >= GATE, value);
    const items = l.breakdown(squares, b, parts).items;
    assert.deepEqual([0, 1, 2].map(k => items.reduce((s, it) => s + it.points[k], 0)), ord, `the breakdown adds up: ${value}`);
    scored += ord[2];
  }
  assert.ok(scored > 20, `2×2 squares scored ${scored} points in all`);
});

test("a base draw is explained exactly as before (no tier fields)", () => {
  const goal = explainer({ familyId: "opposite_nines", params: {} }, INST)!;
  const e = goal.explain(wireOf(MAGIC))!;
  assert.deepEqual(e.ordinal, [8, 0]);
  assert.equal(e.components.length, 2);
  assert.equal(e.tiers, undefined);
  assert.ok(e.parts.every(part => part.points.length === 2));
  assert.deepEqual(goal.hover(wireOf(new Array(16).fill(0)))!.modes.map(m => m.label), ["All"]);
});

test("the goal example of a tiered draw adds up too", () => {
  const goal = explainer({ familyId: "opposite_nines", params: gated[0] }, INST)!;
  const ex = goal.example()!;
  assert.ok(ex);
  assert.ok(goal.explain(ex.value)!.verified);
});
