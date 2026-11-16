/**
 * Contributors (docs/engine-v2/annotations-design.md §2, §5, §10): each layer of the dealt rule as the chain of
 * quantities it was computed from, read only from the rule's own terms and marks; and the moves that make a line rarer,
 * priced, with their new bits from the rule's value function (owner decision 23: no steps, no thresholds).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { canonicalJson, hashHex, q, rng, walkStep, type Q, type Score } from "@workspace/v2-core";
import { dynamicFamilies, multiples, fromMC, lineQ, lineType, lineZ, powerHug, squareTriangle, steppingCoefficients, crossingSliver, type LineState } from "@workspace/v2-linear";
import { valueLookup, type ValueFunction } from "@workspace/v2-valuation";
import { contributors, partLine, type RuleRef } from "../src/index.ts";
import { moves } from "../src/moves.ts";

const mc = (m: number | Q, c: number | Q): LineState => ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const rule = (family: RuleRef<LineState, unknown>["family"], tieBreaker: string, params: unknown = family.dealable(lineZ)[0]): RuleRef<LineState, unknown> =>
  ({ type: lineType, family, params, variant: lineZ, tieBreaker });

const VALUES = path.resolve(import.meta.dirname, "../../v2-valuation/values");
function valueOf(r: RuleRef<LineState, unknown>): (u: Score) => number {
  const dir = path.join(VALUES, r.variant.id, r.family.id);
  const file = readdirSync(dir).find(f => f === `${hashHex(canonicalJson(r.params))}-${r.tieBreaker}.json`)!;
  const vf = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as ValueFunction;
  const look = valueLookup(vf);
  return u => look(u).bits;
}

test("contributors never throw, and say no steps, on a walk of lines under every pool rule and tie-breaker", () => {
  for (const variant of [lineZ, lineQ]) {
    const g = rng(`contributors:${variant.id}`);
    let s = mc(290, 59);
    const states: LineState[] = [s, mc(5, 27720), mc(q(1, 6), q(7, 6))];
    for (let i = 0; i < 60; i++) { s = walkStep(lineType, variant, s, g); states.push(s); }
    for (const f of dynamicFamilies) for (const tb of f.tieBreakers) for (const st of states) {
      if (!f.dealable(variant).length) continue;   // a family dealt on the rationals only (Smooth Intercept)
      const r: RuleRef<LineState, unknown> = { type: lineType, family: f as never, params: f.dealable(variant)[0], variant, tieBreaker: tb.id };
      for (const p of contributors(r, st).parts) assert.doesNotMatch(p.sentence, /\bstep \d|NaN|undefined/, `${f.id}/${tb.id}: ${p.sentence}`);
    }
  }
});

test("a change from or to an undefined quantity says 'none', not the reason sentence", async () => {
  const { changesBetween, contributors } = await import("../src/index.ts");
  // Square Area has no reading of a vertical line (no triangle with the axes); some families do (they score it).
  const { squareTriangle, normalise } = await import("@workspace/v2-linear");
  const rule = { type: lineType, family: squareTriangle, params: squareTriangle.dealable(lineQ)[0], variant: lineQ, tieBreaker: null } as never;
  const vertical = { lines: [normalise(1n, 0n, -1n) as never] } as LineState, sloped = mc(q(2, 3), q(7, 4));
  const up = changesBetween(contributors(rule, vertical).parts, contributors(rule, sloped).parts);
  assert.ok(up.length > 0, "the parts changed");
  for (const c of up) assert.doesNotMatch(c, /vertical line|no gradient/, c);
  assert.match(up[0]!, /: none → /, up[0]);
  const down = changesBetween(contributors(rule, sloped).parts, contributors(rule, vertical).parts);
  assert.match(down[0]!, / → none$/, down[0]);
});

