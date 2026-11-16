/**
 * The engine (the Convex runtime) and Node draw the same birth walk for the same variant and seed. The table
 * (lib/v2-agents runTable), every dynamics figure and a replay computed off the server assume it.
 *
 * What would break: an engine whose starting objects no simulation reproduces (found 16 Nov: line 1 of a
 * Lines · beginner game was "1,1,-2" on the engine and "-42,9,-10" in Node for the same seed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin } from "./v2-helpers.ts";
import { birthDraws } from "../convex/v2/world.ts";
import { PRESETS } from "../convex/v2/presets.ts";

const variants = [...new Set(PRESETS.map(p => p.variant))];

for (const variant of variants) {
  test(`${variant}: the engine's birth walk is Node's`, async () => {
    for (const seed of ["fidelity-a", "fidelity-b:7"]) {
      const engine = await admin.query("v2/testing:birthWalk", { variant, seed, draws: 64 });
      assert.deepEqual(engine, birthDraws(variant, seed, 64), `${variant}, seed ${seed}`);
    }
  });
}
