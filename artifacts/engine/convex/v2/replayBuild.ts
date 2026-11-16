"use node";
/**
 * Builds an ended game's stored replay file (replays.ts). A Node action: a game of ten minutes holds about 15k events,
 * which a V8 action (64 MB) ran out of memory reading; here each page becomes JSON as it arrives, so only the text is
 * held. Pages are paced: builds run when games end, often while other games tick, and a build reading the whole
 * record back to back starved their commits (eight at once held commits for 8–17 s on the local backend).
 *
 * The file: `{version, ...header, events: [...], programs: [...]}`, `programs` one entry per agent program version,
 * `{agentId, memberId, name, version, language, source, summonedAt}` (files built before it have no `programs`).
 */
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { pageAfter, STORED_REPLAY_VERSION } from "./replayFormat";

const PAGE_PAUSE_MS = 100;
const HEADER = makeFunctionReference<"query", { gameId: Id<"v2Games"> }, Record<string, unknown> | null>("v2/replays:header");
const EVENTS = makeFunctionReference<"query", { gameId: Id<"v2Games">; after: number; maxBytes?: number }, { events: { seq: number }[]; done: boolean }>("v2/replays:events");
const PROGRAMS = makeFunctionReference<"query", { gameId: Id<"v2Games">; cursor: string | null }, { programs: unknown[]; cursor: string | null }>("v2/replays:programs");
const ATTACH = makeFunctionReference<"mutation", { gameId: Id<"v2Games">; file: Id<"_storage"> }, boolean>("v2/replays:attach");

export const build = internalAction({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }): Promise<{ stored: boolean }> => {
    const head = await ctx.runQuery(HEADER, { gameId });
    if (!head) return { stored: false };
    // The same JSON as JSON.stringify({ version, ...head, events }), written page by page.
    const parts = [JSON.stringify({ version: STORED_REPLAY_VERSION, ...head }).slice(0, -1), ',"events":['];
    let first = true;
    for (let after = -1; ;) {
      const page = await pageAfter(maxBytes => ctx.runQuery(EVENTS, { gameId, after, maxBytes }));
      for (const e of page.events) { parts.push(first ? JSON.stringify(e) : `,${JSON.stringify(e)}`); first = false; }
      if (page.done || !page.events.length) break;
      after = page.events.at(-1)!.seq;
      await new Promise(r => setTimeout(r, PAGE_PAUSE_MS));
    }
    // Every agent's every program (v1's replay opened an agent's code from the timeline), a page of agents at a time.
    parts.push('],"programs":[');
    first = true;
    for (let cursor: string | null = null; ;) {
      const page: { programs: unknown[]; cursor: string | null } = await ctx.runQuery(PROGRAMS, { gameId, cursor });
      for (const p of page.programs) { parts.push(first ? JSON.stringify(p) : `,${JSON.stringify(p)}`); first = false; }
      if (page.cursor === null) break;
      cursor = page.cursor;
      await new Promise(r => setTimeout(r, PAGE_PAUSE_MS));
    }
    parts.push("]}");
    const file = await ctx.storage.store(new Blob(parts, { type: "application/json" }));
    const kept = await ctx.runMutation(ATTACH, { gameId, file });
    if (!kept) await ctx.storage.delete(file);
    return { stored: kept };
  },
});
