/**
 * The backend's own execution log (the admin log stream `npx convex logs` reads): for each function call, whether it
 * was answered from the query cache, its time, and the documents and bytes it read. The cost tests read their numbers
 * here, never from client-side timings.
 */
import assert from "node:assert/strict";
import { ADMIN_KEY, URL_, waitFor } from "./game-helpers.ts";

/** One function execution as the backend logged it (times in seconds). */
export type Execution = {
  identifier: string; udfType?: string; caller?: string; cachedResult: boolean; executionTime: number; userExecutionTime?: number | null;
  usageStats: { databaseReadDocuments: number; databaseReadBytes: number };
};

async function logPage(cursor: number): Promise<{ entries: (Execution & { kind?: string })[]; newCursor: number }> {
  const response = await fetch(`${URL_}/api/stream_function_logs?cursor=${cursor}`, { headers: { Authorization: `Convex ${ADMIN_KEY}` } });
  assert.equal(response.status, 200, "the admin log stream answers");
  return response.json();
}

/**
 * Every query execution logged from now on (queries only: the game's tick mutations and actions are dropped), by
 * identifier (like "rooms:get"), in the order they ran. `until` waits for the stream to catch up with calls already made.
 */
export async function executionLog() {
  let { newCursor: cursor } = await logPage(0);
  const seen = new Map<string, Execution[]>();
  const pull = async () => {
    const page = await logPage(cursor);
    cursor = page.newCursor;
    for (const e of page.entries) {
      if (e.kind !== undefined && e.kind !== "Completion") continue;
      if (!e.identifier || !e.usageStats || e.udfType !== "Query") continue;
      const list = seen.get(e.identifier) ?? [];
      list.push(e);
      seen.set(e.identifier, list);
    }
  };
  return {
    /** The executions of `identifier` so far. */
    of: (identifier: string) => seen.get(identifier) ?? [],
    /** Wait until `ready` holds over what the stream has delivered. */
    async until(ready: (of: (identifier: string) => Execution[]) => boolean, label: string) {
      await waitFor(async () => { await pull(); return ready(id => seen.get(id) ?? []); }, `the execution log shows ${label}`, 30_000, 250);
    },
  };
}

/** The uncached executions of `queries` (identifiers like "rooms:get") while `run` runs, one per query. */
export async function executionsOf(queries: string[], run: () => Promise<unknown>): Promise<Map<string, Execution>> {
  const log = await executionLog();
  await run();
  const first = (of: (id: string) => Execution[], q: string) => of(q).find(e => !e.cachedResult);
  const found = new Map<string, Execution>();
  await log.until(of => queries.every(q => first(of, q)), queries.join(", "));
  for (const q of queries) found.set(q, first(log.of, q)!);
  return found;
}
