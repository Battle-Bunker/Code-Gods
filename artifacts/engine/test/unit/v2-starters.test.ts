/**
 * Integration plan §5.2: every starter of every family the beginner preset deals costs at most the preset's starting
 * energy to summon, in both languages, so a player can always summon one in planning.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { startersFor, summonBits } from "@workspace/v2-agents/pure";
import { dealablePool } from "../../convex/v2/deal.ts";
import { presetOf } from "../../convex/v2/presets.ts";

test("every starter of every dealable family is affordable at the start", () => {
  for (const id of ["lines-beginner"]) {
    const preset = presetOf(id);
    const families = [...new Set(dealablePool(preset).map(r => r.family))];
    assert.ok(families.length > 0);
    for (const family of families) for (const language of ["typescript", "python"] as const) for (const s of startersFor(family, language)) {
      const price = summonBits(language, s.source).energy;
      assert.ok(price <= preset.startingEnergy, `${family} ${s.title} (${language}) costs ${price}, more than ${preset.startingEnergy}`);
    }
  }
});
