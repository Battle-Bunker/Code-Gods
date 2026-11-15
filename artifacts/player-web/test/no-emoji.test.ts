/**
 * No emoji in anything a player reads (the owner, 2026-11-15: "Stop using emojis to communicate. I need names for every
 * concept."): every source file of the app, the operation directory (assistant tools, MCP, CLI, palette), the client
 * library and the glossary is free of pictographic code points. A symbol may accompany a concept's name, never replace
 * it; the names themselves are the glossary's (lib/ui-kit/src/glossary.ts).
 *
 * What would break: an energy bolt, a sparkle or any other emoji added to a string, a comment or a test that players or assistants see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
/** The player-facing sources: the app, the operation directory, the client library, the glossary, the views, and the agents' notes, prompts and helpers. */
const DIRS = ["artifacts/player-web/src", "lib/v2-affordances/src", "lib/v2-client/src", "lib/ui-kit/src", "lib/v2-views/src", "lib/v2-agents/src", "lib/v2-sandbox/guest"];
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|js|mjs|py|md|json|css)$/.test(name)) yield p;
  }
}

test("no emoji in the app, the operation directory, the client library or the glossary", () => {
  const found: string[] = [];
  for (const dir of DIRS) {
    for (const f of files(path.join(ROOT, dir))) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        for (const ch of line) if (PICTOGRAPH.test(ch)) found.push(`${path.relative(ROOT, f)}:${i + 1}: ${ch} (U+${ch.codePointAt(0)!.toString(16).toUpperCase()})`);
      });
    }
  }
  assert.deepEqual(found, []);
});
