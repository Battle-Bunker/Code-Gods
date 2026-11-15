/**
 * Every shorthand symbol carries its concept's name (the owner, 2026-11-15: "Stop using emojis to communicate. I need
 * names for every concept." and then "You can use emojis for shorthand in communicating in the app, but the actual name
 * should be shown in tooltip."). In the player-facing sources an emoji or other pictograph may appear only where its
 * name is attached on the same line: a tooltip (`title=`), an accessible label (`aria-label=`) or the glossary's
 * <Term>. Comments are not player-facing and are skipped. The names are the glossary's (lib/ui-kit/src/glossary.ts).
 *
 * What would break: an energy bolt, a sparkle or any other emoji put in a string or a label with no name beside it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
/** The player-facing sources: the app, the operation directory, the client library, the glossary, the views, and the agents' notes, prompts and helpers. */
const DIRS = ["artifacts/player-web/src", "lib/v2-affordances/src", "lib/v2-client/src", "lib/ui-kit/src", "lib/v2-views/src", "lib/v2-agents/src", "lib/v2-sandbox/guest", "artifacts/engine/convex/v2"];
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
/** A name attached on the line: a tooltip, an accessible label or a glossary term. */
const NAMED = /\btitle=|aria-label=|<Term\b/;
/** A line that is only a comment. */
const COMMENT = /^\s*(\/\/|\/\*|\*|#)/;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|js|mjs|py|md|json|css)$/.test(name)) yield p;
  }
}

test("no shorthand symbol without its name in the app, the operation directory, the client library, the glossary, the views or the agents", () => {
  const found: string[] = [];
  for (const dir of DIRS) {
    for (const f of files(path.join(ROOT, dir))) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (COMMENT.test(line) || NAMED.test(line)) return;
        for (const ch of line) if (PICTOGRAPH.test(ch)) found.push(`${path.relative(ROOT, f)}:${i + 1}: ${ch} (U+${ch.codePointAt(0)!.toString(16).toUpperCase()})`);
      });
    }
  }
  assert.deepEqual(found, []);
});

test("the rule itself: a symbol with a tooltip or label passes, a bare one fails, a comment is skipped", () => {
  const bad = (line: string) => !COMMENT.test(line) && !NAMED.test(line) && [...line].some(ch => PICTOGRAPH.test(ch));
  assert.equal(bad(`<span>{x} \u26A1</span>`), true, "a bare bolt");
  assert.equal(bad(`<span title="energy" aria-label="energy">\u26A1</span>`), false, "named in a tooltip and a label");
  assert.equal(bad(`  // the \u26A1 bolt once meant energy`), false, "a comment");
});
