/**
 * The app reads Convex only through live subscriptions (docs/convex-read-architecture.md R6/R7): no one-off
 * `client.query` reads, no HTTP client queries, no client retry policy and no timer around a Convex read. One-off
 * reads belong to CLI commands, scripts and Convex functions (R7), never to artifacts/player-web/src.
 *
 * What would break: a component reading server data once (a palette list, a picker, a receipt) and never seeing it
 * change; a timer that re-reads or resubscribes to hide a query's cost. Fetches that are not Convex queries (a stored
 * file's URL, the panel compiler) are not matched. Countdown timers are allowed (they render time passing).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(import.meta.dirname, "../src");

/**
 * What remains: each file's exact number of findings (so an allowed file cannot gain another), the reason, and the
 * change that removes it. Shrinks only.
 */
const ALLOWED: Record<string, { findings: number; why: string }> = {
  "core/replay/replay-game.tsx": { findings: 1,
    why: "the paged replay (no retry) for a game without a stored replay; removed once migrations:backfillReplays reports done on dev and production (read-architecture §4.4)" },
};

/** One finding per line: the first that matches. */
const ONE_OFF: [RegExp, string][] = [
  [/\.query\s*\(|\b(?:fetchQuery|preloadQuery)\b/, "a one-off query read (client.query)"],
  [/\bConvexHttpClient\b/, "an HTTP client (one-off reads)"],
  [/@\/lib\/live-retry|\bretryDelay\s*\(|\bMAX_RETRIES\b|\bsetRetrying\b/, "a client retry policy for queries"],
];
/** A timer with a Convex read, re-read or resubscribe within three lines of it (before: a retry loop; after: its callback). */
const TIMER = /\bset(?:Timeout|Interval)\s*\(/;
const READ_NEAR = /\.query\s*\(|watchQuery|refetch|resubscribe|setRetrying|retryDelay/;
const COMMENT = /^\s*(\/\/|\*|\/\*|\{\s*\/\*)/;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name)) yield path;
  }
}

function findings(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (file: string, what: string) => found.set(file, [...(found.get(file) ?? []), what]);
  for (const path of sources(SRC)) {
    const file = relative(SRC, path).split(sep).join("/");
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (COMMENT.test(line)) return;
      const oneOff = ONE_OFF.find(([re]) => re.test(line));
      if (oneOff) add(file, `${i + 1}: ${oneOff[1]}`);
      else if (TIMER.test(line) && READ_NEAR.test(lines.slice(Math.max(0, i - 3), i + 4).filter(l => !COMMENT.test(l)).join("\n"))) {
        add(file, `${i + 1}: a timer around a Convex read`);
      }
    });
  }
  return found;
}

test("the app has no one-off Convex reads, client retry policy or timers around reads, beyond the stated exceptions", () => {
  const found = findings();
  const unexpected = [...found].filter(([file, what]) => ALLOWED[file]?.findings !== what.length).map(([file, what]) => `${file}: ${what.join("; ")}`);
  assert.deepEqual(unexpected, [], "read through a live subscription (useLive / useQuery) instead (read-architecture R6); an allowed file may not gain findings");
  const stale = Object.keys(ALLOWED).filter(file => !found.has(file));
  assert.deepEqual(stale, [], "an exception that no longer applies: remove it from ALLOWED");
});
