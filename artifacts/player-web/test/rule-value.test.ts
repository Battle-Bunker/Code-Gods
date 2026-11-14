/**
 * The dealt rule's worth in bits (src/sdk/rule.ts, owner decision 23): the server's value function's knots read by
 * valueLookup, and, until the faces take that function, each rung of the rule's ladder priced by it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { objectLadder, scoreToWire } from "@workspace/v2-core";
import { rungRarities, valueOf } from "../src/sdk/rule.ts";
import { familyPage, setupFromSearch } from "../src/site/lib/rule-gallery.ts";

test("bits at a knot, halfway between two, and none without knots", () => {
  const v = valueOf([{ u: null, bits: 0, lo: 0, hi: 0 }, { u: ["1"], bits: 2, lo: 1.5, hi: 2.5 }, { u: ["3"], bits: 6, lo: 5, hi: 7 }], { primary: 0, secondary: 0 })!;
  assert.equal(v(null).bits, 0);
  assert.equal(v([{ n: 1n, d: 1n }] as never).bits, 2);
  assert.equal(v([{ n: 2n, d: 1n }] as never).bits, 4, "between two knots: their mean");
  assert.equal(valueOf([], undefined), null);
});

test("knots without bounds (the gallery's points) read as exact", () => {
  const v = valueOf([{ u: null, bits: 0 }, { u: ["1"], bits: 2 }])!;
  assert.deepEqual(v([{ n: 1n, d: 1n }] as never), { bits: 2, lo: 2, hi: 2, at: "knot" });
});

test("each rung of the dealt ladder is priced by the value function, the bottom rung at its own score", () => {
  const rule = familyPage("triangle-area", setupFromSearch("?board=line-z&params=2&tb=even"))!.rule;
  const rungs = objectLadder(rule.type, rule.family, rule.params, rule.variant, rule.tieBreaker ?? undefined);
  // One knot per distinct rung score (worst first), worth its index: each rung reads its own knot back.
  const wires = [...new Set(rungs.map(r => JSON.stringify(scoreToWire(r.score))))];
  const v = valueOf(wires.map((w, i) => ({ u: JSON.parse(w) as (string | null)[] | null, bits: i })));
  assert.deepEqual(rungRarities(rule, v), rungs.map(r => wires.indexOf(JSON.stringify(scoreToWire(r.score)))));
  assert.deepEqual(rungRarities(rule, null), []);
});
