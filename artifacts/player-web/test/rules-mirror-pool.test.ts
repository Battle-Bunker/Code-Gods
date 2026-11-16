/** The Line Rules Mirror lists as dealt exactly what the dealer deals for the beginner line preset. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dealablePool } from "../../engine/convex/v2/deal.ts";
import { presetOf } from "../../engine/convex/v2/presets.ts";
import { lineType } from "@workspace/v2-linear";
import { MIRROR_PRESET, mirrorCatalogue } from "../src/gallery/rules-mirror/pool.ts";

const dir = join(import.meta.dirname, "../../../lib/v2-valuation/values/line-q");
const keys = new Set(readdirSync(dir).flatMap(f => readdirSync(join(dir, f)).map(n => (JSON.parse(readFileSync(join(dir, f, n), "utf8")) as { ruleKey: string }).ruleKey)));

test("the mirror's dealt rules are the dealer's pool, and every line family is listed once", () => {
  const c = mirrorCatalogue(k => keys.has(k));
  const pool = dealablePool(presetOf(MIRROR_PRESET));
  const mine = c.dealt.flatMap(f => f.params.flatMap(p => p.variants.filter(v => v.dealt).map(v => v.ruleKey)));
  assert.deepEqual([...mine].sort(), pool.map(r => r.ruleKey).sort());
  assert.equal(c.dealtRules, pool.length);
  assert.deepEqual(c.dealt.map(f => f.family.id).sort(), [...new Set(pool.map(r => r.family))].sort());
  assert.deepEqual([...c.dealt, ...c.undealt].map(f => f.family.id).sort(), lineType.families.map(f => f.id).sort());
  assert.ok(c.undealt.some(f => f.tree), "the tree-shaped tuple families are listed as not dealt");
  for (const f of c.dealt) for (const p of f.params) assert.equal(f.family.card(p.params, p.variants[0]!.tieBreaker).length > 0, true);
});

test("a family with a parameter space lists a sample, offers each alternative third, and takes a drawn or typed set", async () => {
  const { rng } = await import("@workspace/v2-core");
  const c = mirrorCatalogue(k => keys.has(k));
  const spaced = [...c.dealt, ...c.undealt].filter(f => f.space);
  assert.ok(spaced.length >= 3, "Prime Gradient and the tree families carry their space");
  for (const f of spaced) {
    assert.ok(f.space!.size > f.params.length, f.family.id);
    const ids = f.family.tieBreakers.map(t => t.id);
    // A family that declares chains is shown with each, then with all its layers in a row.
    if (f.family.chains) assert.deepEqual(f.params[0]!.variants.map(v => v.tieBreaker), [...new Set([...f.family.chains, ids.join(">")])]);
    const drawn = f.paramsOf(f.space!.draw(rng(`pool-test:${f.family.id}`)));
    assert.deepEqual(f.space!.parse(drawn.label), drawn.params, "the label of a set is what a reader types to get it back");
    const deepest = [...drawn.variants].sort((a, b) => b.layers.length - a.layers.length)[0]!;
    if (f.tree) assert.ok(f.family.card(drawn.params, deepest.tieBreaker).includes("Third: "), f.family.id);
    assert.ok("invalid" in (f.space!.parse("nonsense") as object));
  }
});
