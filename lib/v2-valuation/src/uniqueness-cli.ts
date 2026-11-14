/**
 * pnpm --filter @workspace/v2-valuation uniqueness -- [--variant id ...]
 *
 * Tabulates the uniqueness correction (uniqueness.ts, spec §2.6) for each variant the game deals on: Σπ² and E[M_N]
 * for N = 2 … 1,000 objects, written to uniqueness/<variant>.json and bundled with the value functions.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findVariant } from "./registry.ts";
import { uniquenessShift, uniquenessTable } from "./uniqueness.ts";

const args = process.argv.slice(2);
const chosen = args.filter((a, i) => args[i - 1] === "--variant");
const variants = chosen.length ? chosen : ["line-z", "line-q", "grid-4-d10"];
const NS = [2, 3, 4, 6, 8, 12, 16, 24, 32, 40, 64, 100, 160, 250, 400, 640, 1000];
const ROOT = join(import.meta.dirname, "..", "uniqueness");
mkdirSync(ROOT, { recursive: true });
for (const id of variants) {
  const { type, variant } = findVariant(id);
  const t0 = Date.now();
  const table = uniquenessTable(variant, type.id === "grid" ? "grid" : "line", NS);
  writeFileSync(join(ROOT, `${id}.json`), JSON.stringify({ ...table, collision: +table.collision.toPrecision(4), heldMass: table.heldMass.map(m => +m.toFixed(4)) }) + "\n");
  console.log(`${id}: Σπ² = ${table.collision.toExponential(3)}; shift at N = 4, 10, 40, 100, 1000: ` +
    [4, 10, 40, 100, 1000].map(n => uniquenessShift(table, n).toFixed(2)).join(", ") + ` bits (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
