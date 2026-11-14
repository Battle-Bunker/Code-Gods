/** Parity checks across packages, by source scan: check 2 on convex/v2. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appProblems, convexOpsProblems } from "../src/scan.ts";

const REPO = join(import.meta.dirname, "..", "..", "..");

test("check 2: every public v2 mutation or action is a defineOp, and every server affordance has one", () => {
  assert.deepEqual(convexOpsProblems(join(REPO, "artifacts", "engine", "convex", "v2")), []);
});

test("check 2 names a bypass, a misplaced op and, once ops/ exists, a missing one", () => {
  const root = mkdtempSync(join(tmpdir(), "v2ops-"));
  mkdirSync(join(root, "ops"));
  writeFileSync(join(root, "rooms.ts"), 'export const sneak = mutation({ args: {}, handler: async () => 1 });\nexport const live = query({});\n// runs as an action (sandbox)\n/* mutation( */\n');
  writeFileSync(join(root, "http.ts"), 'export const hook = httpAction(async () => new Response());\n');
  writeFileSync(join(root, "ops", "agent.ts"), 'export const { op: summon, as: summonAs } = defineOp("agent.summon", "action", h);\nexport const x = defineOp("game.end", "mutation", h);\n');
  writeFileSync(join(root, "ops", "game.ts"), 'export const { op: pause, as: pause2 } = defineOp("game.pause", "mutation", h);\n');
  const p = convexOpsProblems(root);
  for (const want of [
    "check 2: rooms.ts makes a public mutation outside defineOp",
    "check 2: game.end is defined in ops/agent.ts, not ops/game.ts",
    "check 2: ops/game.ts must export game.pause as { op: pause, as: pauseAs }",
    "check 2: agent.check has no server handler",
    "check 2: http.ts makes a public httpAction outside defineOp",
  ]) assert.ok(p.includes(want), `${want}\nin\n${p.join("\n")}`);
  assert.ok(!p.some(x => x.includes("agent.summon")) && !p.some(x => x.includes("query")));
  assert.equal(p.filter(x => x.startsWith("check 2: rooms.ts")).length, 1, "comments are not code");
});

test("check 3: the web app runs v2 operations only through useAffordance", () => {
  assert.deepEqual(appProblems(join(REPO, "artifacts", "player-web", "src")), []);
});

test("check 3 names hooks and direct calls, and allows the one runtime file", () => {
  const root = mkdtempSync(join(tmpdir(), "v2app-"));
  writeFileSync(join(root, "button.tsx"), 'const end = useMutation(api.v2.ops.game.end);\nconst go = useAction(makeFunctionReference("v2/ops/agent:summon"));\nconst q = useQuery(api.v2.play.me, {});\n');
  writeFileSync(join(root, "sneaky.ts"), 'await convex.mutation(api.v2.ops.game.end, {});\nconst r = makeFunctionReference(`v2/ops/agent:summon`);\n');
  writeFileSync(join(root, "runtime.ts"), 'const p = opPath(id).public;\nawait convex.mutation(makeFunctionReference(`v2/${p}`), x);\n');
  assert.deepEqual(appProblems(root).sort(), [
    "check 3: button.tsx calls a v2 mutation or action with a hook; use useAffordance",
    "check 3: button.tsx calls a v2 mutation or action with a hook; use useAffordance",
    "check 3: sneaky.ts calls a v2 mutation or action directly; use useAffordance",
  ]);
  writeFileSync(join(root, "ref.ts"), 'export const ref = makeFunctionReference("v2/ops/game:end");\n');
  assert.ok(appProblems(root).includes("check 3: ref.ts names a v2 function outside the affordance runtime"));
});
