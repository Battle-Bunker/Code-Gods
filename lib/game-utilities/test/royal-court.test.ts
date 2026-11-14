/**
 * 🫅 Kings and Subjects (src/families/grid/layered/royal_court.ts): the base on hand-checked boards, its disjoint units
 * against the card, its lens, and its Python card against the host.
 *
 * What would break: a tie for biggest crowning a king (the all-zero board and the 0/k checkerboards would then top the
 * rule: archive/engine-v1:docs/layered-rules-design.md §10 finding 1); unit scores that do not add up to the card's ordinal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { instantiate, objectType, seededRng } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";
import { explainer } from "../src/explain/index.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { courtScore, courtSquares, noKingPenalty, type CourtP } from "../src/families/grid/layered/royal_court.ts";

const ID = "kings_and_subjects";
const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" });
const ctx = context(inst), g = gridSpec(ctx);
const CORNERS: CourtP = { squares: "corners" }, ALL: CourtP = { squares: "all" };
/** "9291/3434/5500/5073" → the wire value on the mono board. */
const wire = (rows: string) => rows.split("/").map(r => [...r].map(d => `${d}K`).join(",")).join("/");
const letter = (() => { const probe = family(ID).exemplar!(CORNERS as never, ctx) as string; return probe[1]; })();
const board = (rows: string) => wire(rows).replaceAll("K", letter);
const score = (p: object) => { const u = evaluator({ familyId: ID, params: p as never }, inst); return (rows: string) => u(board(rows)); };

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
});

test("the disjoint units' scores add up to the card's base ordinal on 500 random boards", () => {
  const units = courtSquares(g.N, "corners").map(({ r, c }) => [r * g.N + c, r * g.N + c + 1, (r + 1) * g.N + c, (r + 1) * g.N + c + 1]);
  const u = evaluator({ familyId: ID, params: CORNERS as never }, inst), rng = seededRng("royal-court-units");
  for (let i = 0; i < 500; i++) {
    const cells = Array.from({ length: 16 }, () => rng.int(10));
    const rows = [0, 1, 2, 3].map(r => cells.slice(4 * r, 4 * r + 4).join("")).join("/");
    const sum = units.map(unit => courtScore(unit.map(c => cells[c]), noKingPenalty(g)).score).reduce((a, s) => [a[0] + s[0], a[1] + s[1]]);
    assert.deepEqual(u(board(rows)), sum, rows);
  }
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
  // The expert variant has 9 overlapping squares.
  const all = explainer({ familyId: ID, params: ALL as never }, inst)!.explain(board(A))!;
  assert.ok(all.verified);
  assert.equal(all.parts.length, 9);
});

// The Python cards against the host (TypeScript) evaluator: the base and the expert variant.
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
test("the Python cards return exactly the host's ordinals: both squares", { skip: !hasPython && "python3 not available" }, () => {
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
  const params: object[] = [CORNERS, ALL];
  const wires = rows.map(board);
  const cases = params.map(p => ({ source: family(ID).card.python(p as never, ctx) }));
  const run = spawnSync("python3", ["-c", PY], { input: JSON.stringify({ prelude: objectType("Grid").prelude(inst).python, wires, cases }), encoding: "utf8", maxBuffer: 1 << 26 });
  assert.equal(run.status, 0, run.stderr);
  const got = JSON.parse(run.stdout) as number[][][];
  params.forEach((p, i) => {
    const u = evaluator({ familyId: ID, params: p as never }, inst);
    assert.deepEqual(got[i], wires.map(w => u(w)), JSON.stringify(p));
  });
});
