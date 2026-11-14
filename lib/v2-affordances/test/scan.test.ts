/** Parity checks across packages, by source scan: check 2 on convex/v2. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convexOpsProblems } from "../src/scan.ts";

const REPO = join(import.meta.dirname, "..", "..", "..");

test("check 2: every public v2 mutation or action is a defineOp, and every server affordance has one", () => {
  assert.deepEqual(convexOpsProblems(join(REPO, "artifacts", "engine", "convex", "v2")), []);
});

test("check 2 names a bypass, a misplaced op and, once ops/ exists, a missing one", () => {
  const root = mkdtempSync(join(tmpdir(), "v2ops-"));
  mkdirSync(join(root, "ops"));
  writeFileSync(join(root, "rooms.ts"), 'export const sneak = mutation({ args: {}, handler: async () => 1 });\nexport const live = query({});\n');
  writeFileSync(join(root, "ops", "agent.ts"), 'export const { op: summon, as: summonAs } = defineOp("agent.summon", "action", h);\nexport const x = defineOp("game.end", "mutation", h);\n');
  writeFileSync(join(root, "ops", "game.ts"), 'export const { op: pause, as: pause2 } = defineOp("game.pause", "mutation", h);\n');
  const p = convexOpsProblems(root);
  for (const want of [
    "check 2: rooms.ts makes a public mutation outside defineOp",
    "check 2: game.end is defined in ops/agent.ts, not ops/game.ts",
    "check 2: ops/game.ts must export game.pause as { op: pause, as: pauseAs }",
    "check 2: agent.check has no server handler",
  ]) assert.ok(p.includes(want), `${want}\nin\n${p.join("\n")}`);
  assert.ok(!p.some(x => x.includes("agent.summon")) && !p.some(x => x.includes("query")));
});
