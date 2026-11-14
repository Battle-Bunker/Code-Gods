// The query-cost gate's tables (test/query-budgets.ts, test/v2-query-budgets.ts) list every query a page subscribes to (read-architecture R8,
// R9: "when a page gains a component, it gains a query that obeys R1-R5 and an entry in the R8 budget table").
// What would break: a component subscribes to a new query (useQuery, useLive, useQueries, watchQuery, onUpdate, or the
// SDK's QUERY_REFS) that has no row in them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BUDGETS, identifierOf } from "../query-budgets.ts";
import { V2_BUDGETS } from "../v2-query-budgets.ts";

const REPO = join(import.meta.dirname, "../../../..");
const ROOTS = ["artifacts/player-web/src", "lib/v2-client/src"];

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}

/** Every query reference (`api.x.y`) a subscription in this source text takes. */
function subscribedQueries(text: string): string[] {
  const refs = new Set<string>();
  const patterns = [
    /\b(?:useQuery|useLive|useLivePages|usePaginatedQuery|watchQuery|onUpdate|useSdkQuery)\(\s*(api\.[\w.]+)/g,
    /\bquery:\s*(api\.[\w.]+)/g,                       // useQueries({ k: { query: api.x.y, args } })
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) refs.add(m[1]);
  // sdk/transport.ts QUERY_REFS: the queries behind the SDK hooks (useSdkQuery takes their names).
  const map = /\bQUERY_REFS\b[^=]*=\s*\{([^}]*)\}/.exec(text)?.[1] ?? "";
  for (const m of map.matchAll(/(api\.[\w.]+)/g)) refs.add(m[1]);
  return [...refs];
}

test("the scan finds each subscription form", () => {
  assert.deepEqual(subscribedQueries(`const a = useLive(api.rooms.get, x); const b = useQuery(api.code.runs.get, {});`), ["api.rooms.get", "api.code.runs.get"]);
  assert.deepEqual(subscribedQueries(`({ game: { query: api.player.game, args } })`), ["api.player.game"]);
  assert.deepEqual(subscribedQueries(`useLivePages(api.setups.page, args, o); usePaginatedQuery(api.rooms.chat, a, o)`), ["api.setups.page", "api.rooms.chat"], "a paged skeleton");
  assert.deepEqual(subscribedQueries(`export const QUERY_REFS: Record<QueryName, Ref> = {\n  "player.events": api.player.events,\n};`), ["api.player.events"]);
  assert.deepEqual(subscribedQueries(`const MUTATIONS = {\n  "rooms.join": api.rooms.join,\n};`), [], "another map of references is not QUERY_REFS");
  assert.deepEqual(subscribedQueries(`client.onUpdate(api.version.current, args, cb)`), ["api.version.current"]);
  assert.deepEqual(subscribedQueries(`await convex.query(api.receipts.get, {})`), [], "a one-off read is not a subscription");
  assert.equal(identifierOf("api.auth.credentials.list"), "auth/credentials:list");
});

test("every query a page subscribes to has a row in the query-cost budget table", () => {
  const budgeted = new Set([...BUDGETS, ...V2_BUDGETS].map(b => b.query));
  const missing: string[] = [];
  for (const root of ROOTS) for (const file of sources(join(REPO, root))) {
    for (const ref of subscribedQueries(readFileSync(file, "utf8"))) {
      if (!budgeted.has(identifierOf(ref))) missing.push(`${identifierOf(ref)} (${file.slice(REPO.length + 1)})`);
    }
  }
  assert.deepEqual(missing, [], "add these to test/query-budgets.ts (and make them fit R8)");
  assert.equal(budgeted.size, BUDGETS.length + V2_BUDGETS.length, "one row per query");
});
