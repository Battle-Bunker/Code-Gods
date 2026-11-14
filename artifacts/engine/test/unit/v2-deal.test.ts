/**
 * The v2 deal (convex/v2/deal.ts): only rules with a converged artefact are dealt; a fresh deal is seeded and gives
 * seats different rules while the pool lasts; rotation passes rules one seat along until everyone has held each once
 * (cases copied from v1's deal-rotation test). What would break: an unconverged or too-coarse rule reaching a player;
 * a deal that is not reproducible from its seed; a rotation that repeats a rule for a player within a round.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { artefactFor } from "../../convex/v2/artefacts.ts";
import { dealablePool, freshDeal, rotatedDeal, ruleView, type PastDeal } from "../../convex/v2/deal.ts";
import { presetOf } from "../../convex/v2/presets.ts";

const beginner = presetOf("lines-beginner");

test("the bundled artefacts are up to date with lib/v2-valuation/artefacts", () => {
  execFileSync(process.execPath, [join(import.meta.dirname, "..", "..", "scripts", "gen-v2-artefacts.mjs"), "--check"]);
});

test("the pool holds exactly the preset's rules whose artefact converged", () => {
  const pool = dealablePool(beginner);
  assert.ok(pool.length > 0, "something is dealable");
  for (const r of pool) {
    assert.equal(artefactFor(r.ruleKey)?.status, "converged", r.ruleKey);
    assert.ok(beginner.families.includes(r.family));
    assert.ok(r.tieBreaker, "a dealt rule is a main layer plus one tie-breaker");
  }
  const keys = new Set(pool.map(r => r.ruleKey));
  assert.equal(keys.size, pool.length);
});

test("a fresh deal is reproducible from its seed and spreads the pool over the seats", () => {
  const pool = dealablePool(beginner);
  const a = freshDeal(pool, 5, "s1"), b = freshDeal(pool, 5, "s1");
  assert.deepEqual(a, b);
  const first = a.slice(0, Math.min(5, pool.length)).map(r => r.ruleKey);
  assert.equal(new Set(first).size, first.length, "different rules while the pool lasts");
  assert.throws(() => freshDeal([], 3, "s"), /converged/);
});

test("a dealt rule's card and ladder come from its family and artefact", () => {
  const [rule] = dealablePool(beginner);
  const view = ruleView(rule!);
  assert.equal(view.layers.length, 2);
  assert.equal(view.layers[1], rule!.tieBreaker);
  assert.ok(view.card.length > 0);
  assert.equal(view.ladder[0]!.rarityBits, 0);
  for (let i = 1; i < view.ladder.length; i++) assert.ok(view.ladder[i]!.rarityBits >= view.ladder[i - 1]!.rarityBits, "rarity grows up the ladder");
});

const KEY = "deal-key";
const past = (members: string[], rules: string[], dealKey = KEY, bid = false): PastDeal => ({ members, rules, dealKey, bid });

test("rotation: after one game the rules pass one seat along", () => {
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, []), null);
  const next = rotatedDeal(["a", "b", "c"], KEY, [past(["a", "b", "c"], ["x", "y", "z"])]);
  assert.deepEqual(next?.rules, ["z", "x", "y"]);
  assert.deepEqual([next?.round, next?.of], [2, 3]);
  assert.deepEqual(rotatedDeal(["c", "a", "b"], KEY, [past(["a", "b", "c"], ["x", "y", "z"])])?.rules, ["y", "z", "x"]);
});

test("rotation: a full round, then a fresh deal; other players, key or a won bid: fresh", () => {
  const g1 = past(["a", "b", "c"], ["x", "y", "z"]), g2 = past(["a", "b", "c"], ["z", "x", "y"]), g3 = past(["a", "b", "c"], ["y", "z", "x"]);
  assert.deepEqual(rotatedDeal(["a", "b", "c"], KEY, [g2, g1])?.rules, ["y", "z", "x"]);
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [g3, g2, g1]), null);
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [past(["a", "b", "c"], ["p", "q", "r"]), g3, g2, g1])?.round, 2);
  assert.equal(rotatedDeal(["a", "b", "d"], KEY, [g1]), null);
  assert.equal(rotatedDeal(["a", "b", "c"], "other", [g1]), null);
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [past(["a", "b", "c"], ["x", "y", "z"], KEY, true)]), null);
});

test("rotation: a new seat order mid-round still gives everyone each rule once", () => {
  const g1 = past(["a", "b", "c"], ["x", "y", "z"]);
  const g2 = past(["b", "a", "c"], rotatedDeal(["b", "a", "c"], KEY, [g1])!.rules);
  const r3 = rotatedDeal(["c", "b", "a"], KEY, [g2, g1])!;
  assert.equal(r3.round, 3);
  for (const [k, m] of ["c", "b", "a"].entries()) {
    const held = [g1, g2].map(g => g.rules[g.members.indexOf(m)]);
    assert.ok(!held.includes(r3.rules[k]!), `${m} gets a rule it has not held`);
  }
  assert.equal(rotatedDeal(["a", "b", "c"], KEY, [past(["c", "b", "a"], r3.rules), g2, g1]), null);
});
