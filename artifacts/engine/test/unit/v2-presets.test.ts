/**
 * The presets' derived prices (decision 35 and the coordinator's call on decision 21): the read-price weight makes 5
 * looks a second at a typical object a tenth of a player's power, from a measured median read; summons scale with power.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOKS_PER_SECOND, LOOK_POWER_SHARE, READ_PRICE, summonPriceScale } from "@workspace/v2-economy";
import { MEDIAN_LOOK_BITS, PRESETS } from "../../convex/v2/presets.ts";
import { fullReadBits } from "../../convex/v2/knowledge.ts";
import { birthDraws } from "../../convex/v2/world.ts";

test("every preset's variant has a measured median look within 10% of its births'", () => {
  for (const variant of new Set(PRESETS.map(p => p.variant))) {
    const bits = Array.from({ length: 400 }, (_, i) => fullReadBits(variant, birthDraws(variant, `median:${i}`, 1)[0]!)).sort((a, b) => a - b);
    const median = bits[200]!, table = MEDIAN_LOOK_BITS[variant];
    assert.ok(table !== undefined && Math.abs(table - median) / median < 0.1, `${variant}: table ${table}, births ${median}`);
  }
});

test("5 looks a second at a typical object take a tenth of the preset's power, 100 a second twice it; summons scale with power", () => {
  for (const p of PRESETS) {
    const look = p.readPriceWeight * MEDIAN_LOOK_BITS[p.variant]! * READ_PRICE, power = p.economy.powerPerSecond;
    assert.ok(Math.abs((LOOKS_PER_SECOND * look) / power - LOOK_POWER_SHARE) < 1e-9, `${p.id}: ${look} energy a look at ${power}/s`);
    assert.ok(100 * look >= 2 * power - 1e-9, `${p.id}: 100 looks a second are beyond its power`);
  }
  assert.equal(summonPriceScale(64), 1);
  assert.equal(summonPriceScale(8), 0.125);
});
