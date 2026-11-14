/** Writes every shipped agent's rendered copy under lib/v2-agents/agents/ (pnpm --filter @workspace/v2-agents render). */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { shippedAgents, shippedPath } from "../src/starters.ts";

const root = join(import.meta.dirname, "..");
rmSync(join(root, "agents"), { recursive: true, force: true });
const all = shippedAgents();
for (const a of all) {
  const path = join(root, shippedPath(a));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, a.source);
}
console.log(`wrote ${all.length} agents`);
