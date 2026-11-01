// Guard: the modules of the hot reactive queries stay light to load.
//
// Convex evaluates a function's whole module bundle (everything it imports, transitively) on every execution, and a
// reactive query re-executes for every subscriber each time a document it read changes. A heavy import on such a module
// therefore costs every subscriber, on every change: rooms.get once spent ~50 ms of its ~70 ms evaluating
// player-client's MCP tool registry (zod schemas for every tool) that it reached through
// game/lobby -> assistant/store -> assistant/rules, and under the multi-client e2e's load that came close to Convex's
// 1 s query limit. Bundle each module as the Convex CLI does (esbuild, platform "browser") and check what it pulls in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { build } from "esbuild";

const ENGINE = join(import.meta.dirname, "../..");

/** The modules whose queries every client subscribes to (player-web's transport, the dock and the assistant pane). */
const HOT = ["rooms.ts", "player.ts", "games.ts", "activity.ts", "layout.ts", "panels.ts", "assistant.ts", "auth/user.ts"];

/** Imports a hot module must never reach, with their cold load cost (Node, unminified, measured when this was written). */
const HEAVY: Record<string, string> = {
  "lib/player-client/src/tools.ts": "the MCP tool registry: zod schemas for every tool, ~70 ms",
  "lib/game-utilities/src/families/": "the utility families and their data tables (the package's index), ~35 ms",
  "lib/ai-player/": "the model providers and AI player, ~110 ms",
};

/**
 * Bundle bytes allowed per hot module. When this was written layout.ts was the largest at about 690 KB (zod 4 for the
 * layout and panel schemas; 1.3 MB before) and rooms.ts about 530 KB (1.06 MB before); the tool registry alone adds
 * about 500 KB.
 */
const BUDGET = 760 * 1024;

async function bundle(file: string) {
  const result = await build({
    entryPoints: [join(ENGINE, "convex", file)], bundle: true, write: false, metafile: true, format: "esm", platform: "browser",
    logLevel: "silent", external: ["node:*"],
  });
  const inputs = Object.keys(result.metafile.inputs).map(path => path.replace(/^(\.\.\/)+/, ""));
  return { inputs, bytes: result.outputFiles.reduce((sum, f) => sum + f.contents.byteLength, 0) };
}

for (const file of HOT) {
  test(`convex/${file} loads none of the heavy libraries and stays within its bundle budget`, async () => {
    const { inputs, bytes } = await bundle(file);
    for (const [heavy, why] of Object.entries(HEAVY)) {
      const hit = inputs.find(path => path.includes(heavy));
      assert.equal(hit, undefined, `convex/${file} bundles ${hit} (${why}); import it lazily from a module no hot query loads`);
    }
    assert.ok(bytes <= BUDGET, `convex/${file} bundles to ${Math.round(bytes / 1024)} KB, over the ${BUDGET / 1024} KB budget`);
  });
}
