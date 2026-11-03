/**
 * The backend's own execution log (the admin log stream `npx convex logs` reads): for each function call, whether it
 * was answered from the query cache, its time, and the documents and bytes it read. The cost tests read their numbers
 * here, never from client-side timings.
 *
 * The backend keeps only its most recent executions in memory (MAX_UDF_EXECUTION, 1,000 by default), and a running game
 * logs dozens of tick mutations and actions a second, so a reader that pulls only when it is done would find the
 * early calls already gone (measured: a 1,000-entry window covered about a minute of a running game, less on a busy
 * machine). The collector therefore pulls continuously in the background from the moment it is created, and fails
 * loudly if it ever falls a whole window behind, instead of reporting calls as missing.
 */
import assert from "node:assert/strict";
import { ADMIN_KEY, URL_, waitFor } from "./game-helpers.ts";

/** One function execution as the backend logged it (times in seconds). */
export type Execution = {
  identifier: string; udfType?: string; caller?: string; cachedResult: boolean; executionTime: number; userExecutionTime?: number | null;
  usageStats: { databaseReadDocuments: number; databaseReadBytes: number };
};

/** The backend's in-memory window (its MAX_UDF_EXECUTION knob's default): a page this long may have lost entries. */
const WINDOW = 1000;

async function logPage(cursor: number): Promise<{ entries: (Execution & { kind?: string })[]; newCursor: number }> {
  const response = await fetch(`${URL_}/api/stream_function_logs?cursor=${cursor}`, { headers: { Authorization: `Convex ${ADMIN_KEY}` } });
  assert.equal(response.status, 200, "the admin log stream answers");
  return response.json();
}

/**
 * Every query execution logged from now on (queries only: the game's tick mutations and actions are dropped), by
 * identifier (like "rooms:get"), in the order they ran, collected in the background until `stop`. `until` waits for
 * the stream to catch up with calls already made.
 */
export async function executionLog() {
  let { newCursor: cursor } = await logPage(0);
  const seen = new Map<string, Execution[]>();
  let behind: string | undefined;
  let failure: Error | undefined;
  const pull = async () => {
    const page = await logPage(cursor);
    if (page.entries.length >= WINDOW) behind ??= `one pull returned ${page.entries.length} entries, the backend's whole window: older entries may be lost`;
    cursor = page.newCursor;
    for (const e of page.entries) {
      if (e.kind !== undefined && e.kind !== "Completion") continue;
      if (!e.identifier || !e.usageStats || e.udfType !== "Query") continue;
      const list = seen.get(e.identifier) ?? [];
      list.push(e);
      seen.set(e.identifier, list);
    }
  };
  // One pull at a time (each continues from the last cursor), every 100 ms, until stopped.
  let stopped = false;
  let pulling: Promise<void> = Promise.resolve();
  const step = () => (pulling = pulling.then(pull).catch(error => { failure ??= error as Error; }));
  const loop = (async () => { while (!stopped) { await step(); await new Promise(r => setTimeout(r, 100)); } })();
  const check = () => {
    if (failure) throw new Error(`the execution log stream failed: ${failure.message}`);
    if (behind) throw new Error(`the execution log fell behind the backend (${behind}); the counts would be wrong`);
  };
  return {
    /** The executions of `identifier` so far. */
    of: (identifier: string) => seen.get(identifier) ?? [],
    /** Wait until `ready` holds over what the stream has delivered (a pull after the last call, so nothing is pending). */
    async until(ready: (of: (identifier: string) => Execution[]) => boolean, label: string) {
      await waitFor(async () => { await step(); check(); return ready(id => seen.get(id) ?? []); }, `the execution log shows ${label}`, 30_000, 250);
    },
    /** Stop collecting. */
    async stop() { stopped = true; await loop; },
  };
}

/** The uncached executions of `queries` (identifiers like "rooms:get") while `run` runs, one per query. */
export async function executionsOf(queries: string[], run: () => Promise<unknown>): Promise<Map<string, Execution>> {
  const log = await executionLog();
  try {
    await run();
    const first = (of: (id: string) => Execution[], q: string) => of(q).find(e => !e.cachedResult);
    const found = new Map<string, Execution>();
    await log.until(of => queries.every(q => first(of, q)), queries.join(", "));
    for (const q of queries) found.set(q, first(log.of, q)!);
    return found;
  } finally { await log.stop(); }
}
