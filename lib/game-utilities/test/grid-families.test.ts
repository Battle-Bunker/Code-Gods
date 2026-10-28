/**
 * Parity: each TypeScript ordinal port returns exactly Grid Lab's ordinal on the exported fixture
 * grids (random, low-entropy, exemplars and perturbed exemplars) for every shipped GridType.
 * Regenerate fixtures with `cd lib/grid-lab && python3 -m gridlab.export`.
 * GRID_FAMILIES=id1,id2 restricts the run (useful while porting).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHIPPED_GRID_TYPES } from "../src/grid/data.ts";
import { gridEnv, decode } from "../src/grid/env.ts";
import { GRID_ORDINALS } from "../src/grid/families/index.ts";

const only = process.env.GRID_FAMILIES?.split(",").filter(Boolean);
const slug = (t: { size: number; symbols: string; colours: string }) => `${t.size}_${t.symbols}_${t.colours}`;

for (const t of SHIPPED_GRID_TYPES) {
  const fx = JSON.parse(readFileSync(new URL(`./fixtures/grid/${slug(t)}.json`, import.meta.url), "utf8"));
  const env = gridEnv(t);
  const pool = fx.pool.map((s: string) => decode(s, env));
  test(`ordinal ports match Grid Lab on ${t.key}`, () => {
    const missing = new Set<string>();
    let checked = 0;
    for (const c of fx.cases) {
      if (only && !only.includes(c.family)) continue;
      const f = GRID_ORDINALS.get(c.family);
      if (!f) { missing.add(c.family); continue; }
      c.grids.forEach((gi: number, k: number) => {
        const got = f.ordinal(pool[gi], c.params, env);
        assert.deepEqual(got, c.ordinals[k],
          `${c.family} ${JSON.stringify(c.params)} on ${fx.pool[gi]}: got ${JSON.stringify(got)}, Grid Lab ${JSON.stringify(c.ordinals[k])}`);
        checked++;
      });
    }
    assert.deepEqual([...missing], [], `families without a TypeScript port: ${[...missing].join(", ")}`);
    assert.ok(checked > 0);
  });
}
