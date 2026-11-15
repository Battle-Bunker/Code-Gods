/**
 * The server plays every object type through its variant (convex/v2/world.ts): what would break is a grid game read,
 * born or valued as lines, or two types' families sharing an id (the deal and the reads look families up by id).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { objectTypes } from "@workspace/v2-valuation";
import { valueRecord } from "../../convex/v2/values.ts";
import { familyOf } from "../../convex/v2/deal.ts";
import { decode, encode, typeOf, valuesOf } from "../../convex/v2/world.ts";
import { mutatorsOf } from "../../convex/v2/reads.ts";
import { ruleKey } from "@workspace/v2-valuation";

test("family ids are unique across object types", () => {
  const ids = objectTypes.flatMap(t => t.families.map(f => f.id));
  assert.deepEqual(ids.length, new Set(ids).size);
});

test("a grid variant is read and written as a grid; it is valued only once it has value functions (decision 23)", () => {
  assert.equal(typeOf("grid-4-d10").id, "grid");
  assert.equal(typeOf("line-z").id, "line");
  const wire = "9090/0909/4545/3366";
  assert.equal(encode(decode(wire, "grid-4-d10"), "grid-4-d10"), wire);
  const type = typeOf("grid-4-d10"), variant = type.variants[0]!;
  const f = familyOf("magic-eighteen");
  const key = ruleKey(type, variant, f.id, { T: 18 }, "first-column");
  const seat = [{ memberId: "m1", rule: { family: f.id, params: { T: 18 }, tieBreaker: "first-column", ruleKey: key, contentHash: "" } }];
  // Values come from value functions (convex/v2/values.gen.ts); grids have none yet, so the server refuses to value
  // (and the deal to deal) a grid rule, by name. When grid value functions land, this asserts the rows-add-up line's
  // worth instead (it was > 16 bits under the artefacts).
  if (valueRecord(key)) {
    const [v] = valuesOf(decode(wire, "grid-4-d10"), "grid-4-d10", seat, 1);
    assert.ok(v!.rarityBits > 16, `every row adds up to 18: ${v!.rarityBits} bits`);
  } else {
    assert.throws(() => valuesOf(decode(wire, "grid-4-d10"), "grid-4-d10", seat, 1), new RegExp(`No value function for ${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
});

test("a grid representation's mutators name their arguments, with choices for cells and lines", () => {
  const ms = mutatorsOf("cells", "grid-4-d10");
  assert.deepEqual(ms.map(m => m.id), ["cells.add", "cells.swap"]);
  assert.deepEqual(ms[0]!.args, [{ name: "cell", code: "choice" }, { name: "k", code: "integer" }]);
});
test("Grids · beginner deals every grid family, each a main layer plus one tie-breaker, on the grid board (once grids have value functions)", async () => {
  const { presetOf } = await import("../../convex/v2/presets.ts");
  const { dealablePool, playable } = await import("../../convex/v2/deal.ts");
  const { VALUE_RECORDS } = await import("../../convex/v2/values.gen.ts");
  const gridValues = VALUE_RECORDS.some(r => r.variant === "grid-4-d10");
  for (const id of ["grids-beginner", "grids-beginner-bidding"]) {
    const p = presetOf(id);
    assert.equal(p.id, id);
    assert.equal(p.variant, "grid-4-d10");
    const pool = dealablePool(p);
    if (gridValues) {
      assert.deepEqual([...new Set(pool.map(r => r.family))].sort(), [...p.families].sort(), "every grid family deals");
      assert.equal(pool.length, 24);
    } else {
      // Decision 23: only rules with a value function deal; until grid value functions land the preset is withheld.
      assert.equal(pool.length, 0);
      assert.equal(playable(p), false);
    }
  }
  assert.ok(presetOf("grids-beginner-bidding").bid);
});

test("Grids · arithmetic deals Divisibility's eight instances and Leading Digits' four, on the beginner grid's game, and is not the default", async () => {
  const { DEFAULT_PRESET, presetOf } = await import("../../convex/v2/presets.ts");
  const { dealablePool, playable } = await import("../../convex/v2/deal.ts");
  const p = presetOf("grids-arithmetic"), grids = presetOf("grids-beginner");
  assert.equal(p.id, "grids-arithmetic");
  assert.equal(p.title, "Grids · arithmetic");
  assert.notEqual(DEFAULT_PRESET, p.id);
  assert.equal(p.variant, "grid-4-d10");
  assert.deepEqual([p.startingEnergy, p.economy, p.worldSeconds, p.startingObjects, p.driftSeconds], [grids.startingEnergy, grids.economy, grids.worldSeconds, grids.startingObjects, grids.driftSeconds]);
  const pool = dealablePool(p);
  assert.ok(playable(p));
  assert.deepEqual(pool.map(r => `${r.family}/${r.tieBreaker}`).sort(), [...Array(8).fill("divisibility/leftover-digits"), ...Array(4).fill("leading-digits/exponent-digits")]);
  assert.deepEqual(pool.filter(r => r.family === "leading-digits").map(r => r.params), [{ b: 2, layout: "halves" }, { b: 2, layout: "alternate" }, { b: 7, layout: "halves" }, { b: 7, layout: "alternate" }]);
  // No other deployed preset deals either family.
  const { PRESETS } = await import("../../convex/v2/presets.ts");
  for (const other of PRESETS.filter(x => x.id !== p.id)) assert.ok(!other.families.some(f => f === "divisibility" || f === "leading-digits"), other.id);
});

test("a grid player can summon a grid starter and keep about as large a share of the starting energy as a line player", async () => {
  const { presetOf } = await import("../../convex/v2/presets.ts");
  const { shippedAgents, summonBits } = await import("@workspace/v2-agents");
  const share = (preset: string, family: (f: string) => boolean) => {
    const prices = shippedAgents().filter(a => a.kind === "simple" && family(a.family)).map(a => summonBits(a.language, a.source).energy).sort((a, b) => a - b);
    return prices[prices.length >> 1]! / presetOf(preset).startingEnergy;
  };
  const grid = new Set(typeOf("grid-4-d10").families.map(f => f.id));
  const line = share("lines-beginner", f => !grid.has(f)), board = share("grids-beginner", f => grid.has(f));
  assert.ok(board <= line * 1.15, `a grid Simple starter takes ${(100 * board).toFixed(0)}% of the starting energy, a line one ${(100 * line).toFixed(0)}%`);
});
