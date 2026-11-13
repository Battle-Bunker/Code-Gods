/**
 * 🫅 Kings and Subjects (src/families/grid/layered/royal_court.ts): the base on hand-checked boards, its disjoint units
 * against the card, the tiers' operators on a hand-checked board of four courts, the gate, and the liveness of every
 * dealt tier.
 *
 * What would break: a tie for biggest crowning a king (the all-zero board and the 0/k checkerboards would then top the
 * rule: docs/layered-rules-design.md §10 finding 1); unit scores that do not add up to the card's ordinal (the hybrid
 * table would calibrate another rule); a path or road operator that counts something other than the card says; a tier
 * that counts below the gate; a dealt value that is dead, maxed by most boards or outside the 6–20 bit band.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { instantiate, objectType, seededRng } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";
import { explainer } from "../src/explain/index.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { withTiers, type TierValue } from "../src/families/grid/tiers.ts";
import { hybridLawOf, tierLiveness } from "../src/families/grid/tiers-hybrid.ts";
import { courtTiers, type CourtP } from "../src/families/grid/layered/royal_court.ts";

const ID = "kings_and_subjects";
const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const ctx = context(inst), g = gridSpec(ctx);
const CORNERS: CourtP = { squares: "corners" }, ALL: CourtP = { squares: "all" };
/** "9291/3434/5500/5073" → the wire value on the mono board. */
const wire = (rows: string) => rows.split("/").map(r => [...r].map(d => `${d}K`).join(",")).join("/");
const letter = (() => { const probe = family(ID).exemplar!(CORNERS as never, ctx) as string; return probe[1]; })();
const board = (rows: string) => wire(rows).replaceAll("K", letter);
const score = (p: object) => { const u = evaluator({ familyId: ID, params: p as never }, inst); return (rows: string) => u(board(rows)); };
const tiered = (v: TierValue) => withTiers(courtTiers, CORNERS, [v], g);

// Boxes of A: 9 2 / 3 4 (a court); 9 1 / 3 4 (king 9, subjects 8: 1 away); 5 5 / 5 0 (a tie: no king, 20 off);
// 0 0 / 7 3 (king 7, subjects 3: 4 away).
const A = "9291/3434/5500/5073";
// Four courts: kings 9 at (0,0), 6 at (0,3), 5 at (3,0), 4 at (2,2).
const C = "9216/3423/1140/5313";

test("the base: a court is a single biggest number that equals the other three added up; gaps and ties deduct", () => {
  const u = score(CORNERS);
  assert.deepEqual(u(A), [1, -25]);
  assert.deepEqual(u(C), [4, 0]);
  assert.deepEqual(u("9292/3434/9292/3434"), [4, 0], "the exemplar's boxes");
  assert.deepEqual(u("8292/3434/9292/3434"), [3, -1], "one king one short");
});

test("a tie for biggest crowns no king: uniform boards and 0/k checkerboards are the worst boards, not the best", () => {
  const u = score(CORNERS);
  assert.deepEqual(u("0000/0000/0000/0000"), [0, -80]);
  assert.deepEqual(u("7777/7777/7777/7777"), [0, -80]);
  assert.deepEqual(u("0505/5050/0505/5050"), [0, -80]);
  assert.deepEqual(u("0770/7007/7007/0770"), [0, -80]);
  // 0 0 / 0 0 would be a "court" if ties counted (0 = 0 + 0 + 0); 5 0 / 0 5 likewise (5 = 0 + 0 + 5).
  assert.deepEqual(score(ALL)("0505/5050/0505/5050"), [0, -180]);
});

test("the expert variant scores all 9 overlapping squares", () => {
  // Squares of A, row by row: court, court (2 9 / 4 3), 1 away; tie, 2 away, 1 away; tie, 2 away, 4 away.
  assert.deepEqual(score(ALL)(A), [2, -50]);
  assert.deepEqual(score(ALL)("2202/7313/0404/2222"), [9, 0]);
  assert.deepEqual(family(ID).support(ctx), [CORNERS], "the expert variant is never dealt by default");
  assert.equal(courtTiers.base(ALL, g), null, "overlapping squares are not disjoint units: no tiers");
  assert.deepEqual(family(ID).tiered!(ctx, 1).filter(p => (p as CourtP).squares !== "corners"), []);
});

test("the disjoint units' scores add up to the card's base ordinal on 500 random boards", () => {
  const base = courtTiers.base(CORNERS, g)!, u = evaluator({ familyId: ID, params: CORNERS as never }, inst), rng = seededRng("royal-court-units");
  for (let i = 0; i < 500; i++) {
    const cells = Array.from({ length: 16 }, () => rng.int(10));
    const rows = [0, 1, 2, 3].map(r => cells.slice(4 * r, 4 * r + 4).join("")).join("/");
    const sum = base.units.map(unit => base.score(unit.map(c => cells[c]))).reduce((a, s) => [a[0] + s[0], a[1] + s[1]]);
    assert.deepEqual(u(board(rows)), sum, rows);
  }
});

test("paths between kings: every shortest path whose numbers, kings included, add up to x", () => {
  // 9–6 along the top row: 18. 9–5 down the first column: 18. 9–4: 18, 21, 20, 22, 21, 18. 6–4: 13, 15, 13.
  // 5–4: 11, 13, 13. 6–5: at least 20, and exactly 20 on 4 paths.
  assert.deepEqual(score(tiered({ id: "paths", x: 13 }))(C), [4, 0, 4]);
  assert.deepEqual(score(tiered({ id: "paths", x: 18 }))(C), [4, 0, 4]);
  assert.deepEqual(score(tiered({ id: "paths", x: 20 }))(C), [4, 0, 5]);
  assert.deepEqual(score(tiered({ id: "paths", x: 12 }))(C), [4, 0, 0]);
});

test("pairs of kings: a pair counts once however many of its paths have x in between; the paths break ties", () => {
  // In between: 9–6: 3. 9–5: 4. 9–4: 5, 8, 7, 9, 8, 5. 6–4: 3, 5, 3. 5–4: 2, 4, 4. 6–5: 9 or more.
  assert.deepEqual(score(tiered({ id: "pathPairs", x: 3 }))(C), [4, 0, 2, 3]);
  assert.deepEqual(score(tiered({ id: "pathPairs", x: 5 }))(C), [4, 0, 2, 3]);
  assert.deepEqual(score(tiered({ id: "pathPairs", x: 2 }))(C), [4, 0, 1, 1]);
});

test("roads of subjects: the 12 subjects of C make one road; only the two 1s side by side make a same-number road", () => {
  assert.deepEqual(score(tiered({ id: "roads", y: 12 }))(C), [4, 0, 1]);
  assert.deepEqual(score(tiered({ id: "roads", y: 11 }))(C), [4, 0, 0]);
  assert.deepEqual(score(tiered({ id: "longestRoad" }))(C), [4, 0, 12]);
  assert.deepEqual(score(tiered({ id: "sameRoad" }))(C), [4, 0, 2]);
  assert.deepEqual(score(tiered({ id: "sameRoads", y: 2 }))(C), [4, 0, 1]);
  assert.deepEqual(score(tiered({ id: "sameRoads", y: 1 }))(C), [4, 0, 10]);
});

test("below the gate the tier is 0 and the rule is its base", () => {
  const gate = courtTiers.gate(g);
  assert.equal(gate, 4);
  // Three courts and one box 1 away: kings 9, 6 and 4 are courts, and their paths would count without the gate.
  const three = "9216/3423/1140/6313";
  assert.deepEqual(score(CORNERS)(three), [3, -1]);
  for (const v of [...courtTiers.dealt(g), ...courtTiers.lab!(g)]) assert.deepEqual(score(tiered(v))(three), [3, -1, 0], JSON.stringify(v));
  assert.deepEqual(score(withTiers(courtTiers, CORNERS, [{ id: "paths", x: 13 }], g, "plain"))(three), [3, -1, 2], "ungated, the same paths count");
});

test("the card says the base first, then the ★ block with the gate", () => {
  const dealt = courtTiers.dealt(g);
  assert.ok(dealt.length >= 3, "tiers are dealt on 4×4 digits");
  const text = family(ID).summary(tiered(dealt[0]) as never, ctx);
  assert.match(text, /^Try to make each of the 4 corner boxes a court\./);
  assert.match(text, /★ To score even higher: First get 4 courts\. .* scores 1 tertiary point\./);
  for (const lang of ["python", "typescript"] as const) assert.match(family(ID).card[lang](tiered(dealt[0]) as never, ctx), /GATE = 4/);
});

test("the lens: one unit per box with its points and its king marked; the units add up to the card's base", () => {
  const e = explainer({ familyId: ID, params: CORNERS as never }, inst)!.explain(board(A))!;
  assert.ok(e.verified);
  assert.deepEqual(e.parts.map(p => [p.id, p.title, p.points]), [
    ["box:0,0", "a court", [1, 0]], ["box:0,2", "1 away", [0, -1]], ["box:2,0", "no king", [0, -20]], ["box:2,2", "4 away", [0, -4]],
  ]);
  assert.deepEqual(e.parts.map(p => p.spots?.[0]?.cell ?? null), [{ r: 0, c: 0 }, { r: 0, c: 2 }, null, { r: 3, c: 2 }]);
  assert.deepEqual(e.parts[1].facts, [
    { text: "king 9, subjects 1 + 3 + 4 = 8", ok: false }, { text: "the king is 1 away from 8: deducts 1", ok: false, tier: 1 },
  ]);
  // The expert variant has 9 overlapping squares; a tiered draw is explained by its base's units.
  const all = explainer({ familyId: ID, params: ALL as never }, inst)!.explain(board(A))!;
  assert.ok(all.verified);
  assert.equal(all.parts.length, 9);
  const withTier = explainer({ familyId: ID, params: tiered({ id: "pairs", x: 3 }) as never }, inst)!.explain(board(C))!;
  assert.ok(withTier.verified);
  assert.deepEqual(withTier.ordinal, [4, 0, 2]);
});

// The Python cards against the host (TypeScript) evaluator: base, expert variant, and every tier's nested function.
const PY = `
import json, sys
data = json.load(sys.stdin)
out = []
for case in data["cases"]:
    scope = {"__name__": "card"}
    exec(data["prelude"], scope)
    exec(case["source"], scope)
    got = [scope["utility"](scope["__decode"](w)) for w in data["wires"]]
    out.append([list(o) for o in got])
print(json.dumps(out))
`;
const hasPython = spawnSync("python3", ["-c", "pass"]).status === 0;
test("the Python cards return exactly the host's ordinals: both squares, every interaction", { skip: !hasPython && "python3 not available" }, () => {
  const rng = seededRng("royal-court-python");
  // Random boards rarely hold four courts, so most boards here are four courts with shuffled corners; every sixth is random.
  const courts = [[9, 2, 3, 4], [6, 1, 2, 3], [5, 1, 1, 3], [4, 0, 1, 3], [3, 1, 1, 1], [8, 2, 2, 4], [7, 0, 0, 7], [2, 1, 1, 0], [9, 3, 3, 3]];
  const rows: string[] = [A, C, "1111/1331/1331/1111"];
  for (let i = 0; i < 60; i++) {
    const cells = new Array<number>(16).fill(0);
    for (const [r, c] of [[0, 0], [0, 2], [2, 0], [2, 2]]) {
      const box = courts[rng.int(courts.length)].slice(), at = [r * 4 + c, r * 4 + c + 1, r * 4 + c + 4, r * 4 + c + 5];
      for (let j = 3; j > 0; j--) { const m = rng.int(j + 1); [box[j], box[m]] = [box[m], box[j]]; }
      at.forEach((cell, j) => { cells[cell] = i % 6 === 5 ? rng.int(10) : box[j]; });
    }
    rows.push([0, 1, 2, 3].map(r => cells.slice(4 * r, 4 * r + 4).join("")).join("/"));
  }
  const values: TierValue[] = [{ id: "paths", x: 13 }, { id: "paths", x: 18 }, { id: "pairs", x: 3 }, { id: "pathPairs", x: 4 }, { id: "roads", y: 6 },
    { id: "sameRoads", y: 2 }, { id: "longestRoad" }, { id: "sameRoad" }, ...courtTiers.dealt(g)];
  const params: object[] = [CORNERS, ALL, ...values.map(tiered), withTiers(courtTiers, CORNERS, [{ id: "pairs", x: 3 }], g, "plain")];
  const wires = rows.map(board);
  const cases = params.map(p => ({ source: family(ID).card.python(p as never, ctx) }));
  const run = spawnSync("python3", ["-c", PY], { input: JSON.stringify({ prelude: objectType("Grid").prelude(inst).python, wires, cases }), encoding: "utf8", maxBuffer: 1 << 26 });
  assert.equal(run.status, 0, run.stderr);
  const got = JSON.parse(run.stdout) as number[][][];
  params.forEach((p, i) => {
    const u = evaluator({ familyId: ID, params: p as never }, inst);
    assert.deepEqual(got[i], wires.map(w => u(w)), JSON.stringify(p));
  });
  const full = evaluator({ familyId: ID, params: tiered({ id: "pairs", x: 3 }) as never }, inst);
  assert.ok(wires.filter(w => (full(w) as number[])[0] === 4).length >= 40, "most boards exercise the tier");
});

test("every dealt tier is alive on 4×4 digits: it varies at the base's top, few boards max it, it adds 6 to 20 bits", () => {
  for (const v of courtTiers.dealt(g)) {
    const p = tiered(v), live = tierLiveness(ID, courtTiers, p, ctx)!;
    assert.deepEqual(live.problems, [], `${JSON.stringify(v)}: ${live.problems.join("; ")}`);
    const law = hybridLawOf(ID, courtTiers, p, ctx)!;
    assert.deepEqual(law.baseLevels[law.baseLevels.length - 1][0], [4, 0]);
  }
});
