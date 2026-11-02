/**
 * The app reads Convex only through live subscriptions (docs/convex-read-architecture.md R6/R7): no one-off
 * `convex.query` reads, no HTTP client queries, no client retry policy and no timer around a Convex read. One-off
 * reads belong to CLI commands, scripts and Convex functions (R7), never to artifacts/player-web/src.
 *
 * What would break: a component reading server data once (a palette list, a picker, a receipt) and never seeing it
 * change; a timer that re-reads or resubscribes to hide a query's cost. Fetches that are not Convex queries (a stored
 * file's URL, the panel compiler) are not matched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "../src");

/** What remains, each with the reason and the change that removes it. Shrinks only. */
const ALLOWED: Record<string, string> = {
  "core/replay/replay-game.tsx":
    "an ended game's replay paged in one-off reads with a retry; replaced by one fetch of the stored replay (read-architecture §4.4, PR 7)",
  "site/lib/convex.tsx":
    "useLive's resubscribe-on-error retry; removed once the page queries fit (read-architecture §6 PR 8, after the gate's debt is paid)",
};

const ONE_OFF: [RegExp, string][] = [
  [/\bconvex\.query\s*\(/, "a one-off convex.query read"],
  [/useConvex\(\)\s*\.query\s*\(/, "a one-off useConvex().query read"],
  [/\.query\s*\(\s*api\./, "a one-off .query(api.…) read"],
  [/\bConvexHttpClient\b/, "an HTTP client (one-off reads)"],
  [/@\/lib\/live-retry|\bretryDelay\s*\(/, "a client retry policy for queries"],
];
/** A timer whose callback (the call and the next few lines) reads, re-reads or resubscribes. */
const TIMER = /\bset(?:Timeout|Interval)\s*\(/;
const READ_NEAR = /\bconvex\.|\.query\s*\(|watchQuery|useQuery|refetch|resubscribe|setRetrying|retryDelay/;

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
    const file = relative(SRC, path);
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const [re, what] of ONE_OFF) if (re.test(line)) add(file, `${i + 1}: ${what}`);
      if (TIMER.test(line) && READ_NEAR.test(lines.slice(i, i + 4).join("\n"))) add(file, `${i + 1}: a timer around a Convex read`);
    });
  }
  return found;
}

test("the app has no one-off Convex reads, client retry policy or timers around reads, beyond the stated exceptions", () => {
  const found = findings();
  const unexpected = [...found].filter(([file]) => !(file in ALLOWED)).map(([file, what]) => `${file}: ${what.join("; ")}`);
  assert.deepEqual(unexpected, [], "read through a live subscription (useLive / useQuery) instead (read-architecture R6)");
  const stale = Object.keys(ALLOWED).filter(file => !found.has(file));
  assert.deepEqual(stale, [], "an exception that no longer applies: remove it from ALLOWED");
});
