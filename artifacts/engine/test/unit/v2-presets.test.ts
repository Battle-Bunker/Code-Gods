/**
 * The presets' derived prices (decision 35 and the coordinator's call on decision 21): the read-price weight makes 5
 * looks a second at a typical object a tenth of a player's power, from a measured median read; summons scale with power.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOKS_PER_SECOND, LOOK_POWER_SHARE, READ_PRICE, summonPriceScale } from "@workspace/v2-economy";
import { GRIDS_BEGINNER_ECONOMY, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import { startersFor, summonBits } from "@workspace/v2-agents/pure";
import { MEDIAN_LOOK_BITS, MEDIAN_STARTER_BITS, PRESETS, STARTERS_AT_START, presetOf } from "../../convex/v2/presets.ts";
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

test("the beginner start buys three of the starter a newcomer summons (Simple) at the scaled summon price, and v2-economy says the same (call 17)", () => {
  for (const id of ["lines-beginner", "grids-beginner"]) {
    // The Simple starters only: the one a newcomer summons. Thorough and Bold are dearer, and say so on their cards.
    const p = presetOf(id), bits: number[] = [];
    for (const r of p.pool) for (const lang of ["typescript", "python"] as const) for (const s of startersFor(r.family, lang).filter(x => x.kind === "simple")) bits.push(summonBits(lang, s.source).energy);
    bits.sort((a, b) => a - b);
    const median = bits[bits.length >> 1]!, table = MEDIAN_STARTER_BITS[p.variant]!;
    assert.ok(Math.abs(table - median) / median < 0.05, `${id}: table ${table}, starters' median ${median}`);
    const three = STARTERS_AT_START * table * summonPriceScale(p.economy.powerPerSecond);
    assert.ok(Math.abs(p.startingEnergy - three) <= 5, `${id}: starts with ${p.startingEnergy}, three starters cost ${three}`);
  }
  assert.equal(presetOf("lines-beginner").startingEnergy, LINES_BEGINNER_ECONOMY.startingEnergy);
  assert.equal(presetOf("grids-beginner").startingEnergy, GRIDS_BEGINNER_ECONOMY.startingEnergy);
  assert.equal(presetOf("lines-beginner").economy.powerPerSecond, 4);
});
test("Grids · arithmetic starts with three of its own typical starters (their summons cost more than the beginner grid's)", () => {
  const p = presetOf("grids-arithmetic"), bits: number[] = [];
  for (const r of p.pool) for (const lang of ["typescript", "python"] as const) for (const s of startersFor(r.family, lang)) bits.push(summonBits(lang, s.source).energy);
  bits.sort((a, b) => a - b);
  const three = STARTERS_AT_START * bits[bits.length >> 1]! * summonPriceScale(p.economy.powerPerSecond);
  assert.ok(Math.abs(p.startingEnergy - three) <= 5, `starts with ${p.startingEnergy}, three starters cost ${three}`);
});
