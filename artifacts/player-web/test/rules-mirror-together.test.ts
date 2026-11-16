import { test } from "node:test";
import assert from "node:assert/strict";
import { q } from "@workspace/v2-core";
import { fromMC, lineType, primeIntercept, quadrantSquare } from "@workspace/v2-linear";
import { drawRules, scoreVector, togetherMap, type TogetherRule } from "../src/gallery/rules-mirror/together.ts";

test("rules together: each rule ranks the window; a square's joint standing is the weakest rule's; the best are local peaks", () => {
  // Prime Intercept (ending 1) wants c near 11, 31, …; Quadrant Square 3/2 wants the area 3/2·n², with X near +n.
  const rules: TogetherRule[] = [
    { family: primeIntercept as never, params: { ends: 1 }, tieBreaker: "closeness" },
    { family: quadrantSquare as never, params: { p: 3, q: 2 }, tieBreaker: "closeness>east" },
  ];
  const map = togetherMap(rules, q(-3), q(12), { half: 4 });
  assert.equal(map.cells.length, 81);
  for (const c of map.cells) assert.equal(c.joint, Math.min(...c.standing));
  const at = (m: number, c: number) => map.cells.find(x => x.m.n === BigInt(m) && x.m.d === 1n && x.c.n === BigInt(c) && x.c.d === 1n)!;
  // y = −3x + 11: c on 11 (Prime Intercept's best in the window, with 31 out of reach).
  assert.equal(at(-3, 11).standing[0], 1);
  // Standings follow each rule's own order: a cell scoring better ranks higher (Quadrant Square's primary rewards a
  // bigger area, so y = −1x + 16, area 128 near 3/2 × 9², outranks y = −3x + 12, area 24 = 3/2 × 4²).
  const qs = (m: number, c: number) => scoreVector(rules[1]!, { lines: [fromMC(q(m), q(c))] });
  assert.ok(qs(-1, 16)[0]! > qs(-3, 12)[0]!);
  assert.ok(at(-1, 16).standing[1]! > at(-3, 12).standing[1]!);
  for (const b of map.best) assert.ok(b.joint >= 0.85);
  const drawn = drawRules(lineType.families as never, 3, "t");
  assert.equal(drawn.length, 3);
  assert.equal(new Set(drawn.map(r => r.family.id)).size, 3, "three different families");
});
