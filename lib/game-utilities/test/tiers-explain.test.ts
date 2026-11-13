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
import { context, evaluator, family, FAMILIES, paramsKey } from "../src/catalog.ts";
import { addsUp, aimAt, explainer, groupOf, hitTest, lensFor, readBoard, type Explanation } from "../src/explain/index.ts";
import { TIER_LENSES, tieredLens } from "../src/explain/tier-lenses.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { baseParams, withTiers } from "../src/families/grid/tiers.ts";
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

// ------------------------------------------------------------------------------------------------
// every family with tiers: each dealt interaction has a tier lens whose units add up to the card
// ------------------------------------------------------------------------------------------------

const TIERED_FAMILIES = ["opposite_nines", "mirrormancer", "kings_and_subjects"];
const rowsOf = (wire: string) => wire.split("/").map(row => row.split(",").map(t => Number(t[0])));

/** Boards around and above a draw's gate: its base's exemplar, the exemplar reshuffled so the tier varies, and 1 to 3 cells changed. */
function gateBoards(familyId: string, p: Params, hand: number[][]): string[] {
  const f = family(familyId), rng = seededRng(`tiers-explain-all:${familyId}:${paramsKey(p)}`);
  const { tiers: _tiers, ...base } = p as Params & { tiers: unknown };
  const out = Array.from({ length: 60 }, () => wireOf(Array.from({ length: 16 }, () => rng.int(10))));
  const tops = [digitsOf(String(f.exemplar!(base as never, CTX))), ...hand];
  for (const top of tops) {
    out.push(wireOf(top));
    for (let k = 0; k < 40; k++) {
      const d = top.slice();
      for (let j = 0; j < k % 4; j++) d[rng.int(16)] = rng.int(10);
      out.push(wireOf(d));
    }
  }
  return out;
}

/** Boards at each family's top that also score tier points, by hand (the tier's sums are in the tests below). */
const HAND: Record<string, (p: Params) => number[][]> = {
  opposite_nines: () => [MAGIC],
  // Four different mirrors along the axis; halves 0+7, 1+6, 2+7, 3+6 …; pairs of digits so "exactly two ys" hits.
  mirrormancer: p => {
    const lines = [[0, 7, 7, 0], [1, 6, 6, 1], [2, 7, 7, 2], [3, 6, 6, 3], [4, 5, 5, 4], [1, 8, 8, 1], [2, 9, 9, 2], [3, 5, 5, 3], [4, 4, 4, 4], [1, 9, 9, 1], [2, 8, 8, 2], [0, 7, 7, 0]];
    const boards: number[][] = [];
    for (let k = 0; k + 4 <= lines.length; k += 2) {
      const four = lines.slice(k, k + 4);
      boards.push((p.axis === "TB" ? Array.from({ length: 4 }, (_, r) => four.map(line => line[r])) : four).flat());
    }
    return boards;
  },
  // Every corner box a court, kings in different corners of their boxes, subjects repeating so roads form.
  kings_and_subjects: () => [
    [9, 2, 2, 9, 3, 4, 4, 3, 3, 4, 4, 3, 9, 2, 2, 9],
    [2, 3, 3, 2, 4, 9, 9, 4, 4, 9, 9, 4, 2, 3, 3, 2],
    [6, 2, 1, 1, 2, 2, 1, 3, 1, 1, 5, 1, 3, 1, 1, 3],
    [1, 1, 2, 2, 1, 3, 6, 2, 3, 1, 1, 1, 1, 1, 3, 1],
    [3, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 3],
  ],
};

test("every family with tiers: every dealt interaction has a tier lens", () => {
  const ids = new Set<string>();
  for (const id of TIERED_FAMILIES) {
    const dealt = family(id).tiered!(CTX, 1) as Params[];
    assert.ok(dealt.length > 0, `${id} deals tiers on 4×4 digits`);
    for (const p of dealt) for (const t of p.tiers as { id: string }[]) { ids.add(t.id); assert.ok(TIER_LENSES[t.id], `a tier lens for ${id}'s ${t.id}`); }
  }
  assert.deepEqual([...ids].sort(), ["halves", "holding", "lines", "pairs", "sameRoads", "squares"]);
});

for (const familyId of TIERED_FAMILIES.filter(id => id !== "opposite_nines")) {
  test(`${familyId}: every tiered draw's units and breakdown add up to the card on every component, below and above the gate`, () => {
    const f = family(familyId), dealt = f.tiered!(CTX, 1) as Params[], seen = new Map<string, { above: number; points: number }>();
    for (const p of dealt) {
      const draw = { familyId, params: p }, goal = explainer(draw, INST)!, card = evaluator(draw, INST);
      const l = tieredLens(lensFor(familyId)!, q => f.cardTiers!(q as never, CTX));
      const tier = (p.tiers as { id: string; gate: number }[])[0], tally = seen.get(tier.id) ?? { above: 0, points: 0 };
      seen.set(tier.id, tally);
      assert.ok(goal?.rich, "a tiered draw has a rich annotation");
      for (const value of gateBoards(familyId, p, HAND[familyId](p))) {
        const e = goal.explain(value), where = `${familyId} ${paramsKey(p)} ${value}`;
        assert.ok(e, where);
        const ord = card(value) as number[];
        assert.equal(e.components.length, ord.length, `every component is explained: ${where}`);
        assert.deepEqual(sums(e), ord, where);
        assert.ok(e.verified, where);
        const status = e.tiers?.[0], last = ord.length - 1;
        assert.ok(status, where);
        assert.equal(status.open, ord[0] >= tier.gate, where);
        const units = e.parts.filter(part => part.id.startsWith("tier"));
        if (ord[0] < tier.gate) assert.equal(units.length, 0, `no tier units below the gate: ${where}`);
        else { tally.above++; tally.points += ord[last]; }
        // Tier units score the tier only; a unit scores 0 or 1.
        for (const part of units) {
          assert.deepEqual(part.points.slice(0, last), new Array(last).fill(0), where);
          assert.ok(part.points[last] === 0 || part.points[last] === 1, where);
        }
        // The breakdown is the score too.
        const b = readBoard(INST, value)!, items = l.breakdown(p, b, e.parts).items;
        assert.deepEqual(ord.map((_, k) => items.reduce((s, it) => s + it.points[k], 0)), ord, `the breakdown adds up: ${where}`);
        // The board can point at every unit.
        const modes = goal.hover(value)!.modes;
        for (const part of e.parts) {
          const mine = modes.filter(m => m.groups.includes(groupOf(part)));
          assert.equal(mine.length, 1, `${part.id} is in one hover mode: ${where}`);
          assert.equal(hitTest(e.parts, mine[0], aimAt(part))?.id, part.id, `${part.id} can be pointed at: ${where}`);
        }
        assert.equal(new Set(e.parts.map(part => part.id)).size, e.parts.length, "unit ids are unique");
      }
    }
    for (const [id, t] of seen) assert.ok(t.above > 30 && t.points > 5, `${familyId} ${id}: ${t.above} boards above the gate, ${t.points} tier points`);
  });
}

test("hand-derived: Mirrormancer's mirrors holding exactly two 7s, and mirrors whose half adds up to 7", () => {
  //   0 7 7 0   rows are the lines (axis LR). All four are mirrors: (4, 8, …).
  //   1 6 6 1   holding two 7s: rows 1 and 3 (0 7 7 0, twice the same reading) and row 4 (2 7 7 2): 2 different mirrors.
  //   0 7 7 0   halves on 7: 0+7, 1+6, 0+7 again, 2+7 = 9: rows 1 and 2 count, row 3 repeats row 1, row 4 misses: 2.
  //   2 7 7 2
  const value = wireOf([0, 7, 7, 0, 1, 6, 6, 1, 0, 7, 7, 0, 2, 7, 7, 2]);
  const dealt = family("mirrormancer").tiered!(CTX, 1) as Params[];
  const of = (id: string, k: string, n: number) => dealt.find(p => p.axis === "LR" && (p.tiers as Record<string, unknown>[])[0].id === id && (p.tiers as Record<string, unknown>[])[0][k] === n)!;
  const hold = explainer({ familyId: "mirrormancer", params: of("holding", "y", 7) }, INST)!, e = hold.explain(value)!;
  assert.deepEqual(e.ordinal, [4, 8, 2]);
  assert.ok(e.verified);
  const units = e.parts.filter(part => part.id.startsWith("tier"));
  assert.deepEqual(units.map(u => u.points[2]), [1, 0, 0, 1]);
  assert.deepEqual(units.map(u => u.title), ["Row 1: a mirror holding exactly two 7s", "Row 2: a mirror, but without exactly two 7s", "Row 3 repeats row 1", "Row 4: a mirror holding exactly two 7s"]);
  assert.deepEqual(units[0].cells, [0, 1, 2, 3].map(c => ({ r: 0, c })));
  assert.deepEqual(hold.hover(value)!.modes.map(m => m.label).slice(-1), ["★ Mirrors"]);
  const half = explainer({ familyId: "mirrormancer", params: of("halves", "x", 7) }, INST)!.explain(value)!;
  assert.deepEqual(half.ordinal, [4, 8, 2]);
  const hu = half.parts.filter(part => part.id.startsWith("tier"));
  assert.deepEqual(hu.map(u => u.points[2]), [1, 1, 0, 0]);
  assert.deepEqual(hu[1].facts, [{ text: "its half: 1 + 6 = 7", ok: true, tier: 2 }]);
  assert.equal(hu[3].title, "Row 4: a mirror, but its half does not add up to 7");
});

test("hand-derived: Kings and Subjects' pairs of kings with 4 between them, and same-number roads of 4 subjects", () => {
  //   9 2 2 9   every corner box is 9 with 2, 3, 4: four courts, kings in the four corners: (4, 0, …).
  //   3 4 4 3   pairs with 4 between: top kings (0,0)-(0,3): 2 + 2 = 4 ✓. Bottom kings the same ✓.
  //   3 4 4 3   left kings (0,0)-(3,0): 3 + 3 = 6 ✗; right the same ✗. The diagonals walk 5 cells in between: the
  //   9 2 2 9   smallest sum is 2+2+3+3+2 = 12 ✗. So 2 pairs.
  //   roads of subjects with one number: the 2s (0,1)-(0,2) and (3,1)-(3,2): 2 subjects each ✓ ✓; the 3s (1,0)-(2,0)
  //   and (1,3)-(2,3): 2 each ✓ ✓; the four 4s in the middle: one road of 4 ✗. So 1 road of exactly 4 (and four roads of 2, which miss).
  const value = wireOf([9, 2, 2, 9, 3, 4, 4, 3, 3, 4, 4, 3, 9, 2, 2, 9]);
  const dealt = family("kings_and_subjects").tiered!(CTX, 1) as Params[];
  const of = (id: string, k: string, n: number) => dealt.find(p => (p.tiers as Record<string, unknown>[])[0].id === id && (p.tiers as Record<string, unknown>[])[0][k] === n)!;
  const goal = explainer({ familyId: "kings_and_subjects", params: of("pairs", "x", 4) }, INST)!, e = goal.explain(value)!;
  assert.deepEqual(e.ordinal, [4, 0, 2]);
  assert.ok(e.verified);
  const units = e.parts.filter(part => part.id.startsWith("tier"));
  assert.equal(units.length, 6);
  const top = units.find(u => u.id === "tier2:pair:0,0-0,3")!;
  assert.deepEqual(top.points, [0, 0, 1]);
  assert.deepEqual(top.cells, [0, 1, 2, 3].map(c => ({ r: 0, c })));
  assert.equal(top.title, "kings 9 and 9: 4 between them");
  assert.deepEqual(top.facts, [{ text: "in between: 2 + 2 = 4", ok: true, tier: 2 }]);
  const left = units.find(u => u.id === "tier2:pair:0,0-3,0")!;
  assert.deepEqual(left.points, [0, 0, 0]);
  assert.deepEqual(left.facts, [{ text: "the nearest path: 3 + 3 = 6, not 4", ok: false, tier: 2 }]);
  assert.deepEqual(goal.hover(value)!.modes.map(m => m.label).slice(-1), ["★ Pairs of kings"]);

  const roads = explainer({ familyId: "kings_and_subjects", params: of("sameRoads", "y", 4) }, INST)!.explain(value)!;
  assert.deepEqual(roads.ordinal, [4, 0, 1]);
  const ru = roads.parts.filter(part => part.id.startsWith("tier"));
  // In board order: the top 2s, the left 3s, the middle 4s, the right 3s, the bottom 2s.
  assert.deepEqual(ru.map(u => [u.cells.length, u.points[2]]), [[2, 0], [2, 0], [4, 1], [2, 0], [2, 0]]);
});

test("a draw whose units cannot add up to its ordinal is annotated like a family without a lens", () => {
  // The unlocked composition's first component is min(base, gate): a clamp, not a sum of units, so no additive
  // annotation can verify against it. The card still shows an example board and its score, as a lensless family does.
  const f = family("opposite_nines");
  for (const compose of ["gated", "plain", "unlock"] as const) {
    const p = f.tiered!(CTX, 1, compose)[0], e = explainer({ familyId: f.id, params: p }, INST)!;
    const rich = compose !== "unlock";
    assert.equal(e.rich, rich, compose);
    assert.ok(e.example(), `${compose}: an example board either way`);
    const ex = e.explain(f.exemplar!(baseParams(p), CTX));
    if (rich) assert.ok(ex?.verified, `${compose}: its units add up`);
    else assert.equal(ex, null, "unlock: no units rather than units that do not add up");
  }
});

test("a tiered draw's goal example scores its ★ tier, for nearly every draw of every tiered family", () => {
  // The example board is the card's one worked example, so a tiered draw whose example scores nothing on the ★ tier
  // teaches the player only half the rule. The ordinary search never found one for ✌️ Two Pair's linked boxes (1 of 35
  // draws): one ★ point is worth less than the rest of what makes a board teach well, and a cell change anywhere on
  // the board almost never moves one of these units. `climbTier` in explain/index.ts goes looking for one on purpose.
  const want: Record<string, number> = { opposite_nines: 1, mirrormancer: 0.7, kings_and_subjects: 0.8, two_pair: 0.9, crosswise_threes: 0.9 };
  for (const [familyId, least] of Object.entries(want)) {
    const f = family(familyId), dealt = f.tiered!(CTX, 1) as Params[];
    let scored = 0;
    for (const params of dealt) {
      const draw = { familyId, params }, example = explainer(draw, INST)!.example();
      assert.ok(example, `${familyId} ${paramsKey(params)}: an example board`);
      const ord = evaluator(draw, INST)(example.value) as number[];
      if (f.cardTiers!(params as never, CTX).some(t => ord.slice(t.index, t.index + t.arity).some(x => x > 0))) scored++;
    }
    assert.ok(scored >= Math.ceil(dealt.length * least),
      `${familyId}: only ${scored} of ${dealt.length} examples score the ★ tier (want ${least * 100}%)`);
  }
});

test("the search for one never hands back a board below the gate, on any shape (the ★ tier has no units there)", () => {
  // Below the gate a board has no ★ units at all. Reading that as "nothing to improve" let the tier climb return a
  // board whose base was unfinished, ahead of the better board the ordinary climb had found: on Grid(4,base10,rgby)
  // Kings and Subjects' roads of 4 lost its above-gate example for one scoring [3, −20, 0].
  for (const colours of ["mono", "rgb", "rgby", "rainbow6"]) {
    const inst = instantiate("Grid", { size: 4, symbols: "base10", colours });
    const ctx = context(inst);
    let checked = 0;
    for (const f of FAMILIES) {
      if (f.objectType !== inst.objectType || !f.tiered) continue;
      for (const params of f.tiered(ctx, 1)) {
        const draw = { familyId: f.id, params }, example = explainer(draw, inst)!.example();
        assert.ok(example, `${f.id} ${paramsKey(params)} on ${colours}: an example board`);
        const ord = evaluator(draw, inst)(example.value) as number[];
        const gate = f.cardTiers!(params as never, ctx)[0].gate;
        assert.ok(ord[0] >= gate, `${f.id} ${paramsKey(params)} on ${colours}: the example's base is ${ord[0]}, below the gate of ${gate}`);
        checked++;
      }
    }
    assert.ok(checked > 90, `${colours}: only ${checked} draws checked`);
  }
});
