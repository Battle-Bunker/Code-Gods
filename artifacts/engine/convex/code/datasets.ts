/**
 * Resolves a run's datasets (lib/player-client/src/datasets.ts) inside an action, as the principal, through the same
 * internal twins the read tools use (player.observationAs, eventsAs, historyAs, trajectoriesAs, myUtilityAs,
 * rooms.getAs, chatHistoryAs, historyAs): disclosure is exactly the human's own, and nothing passes through the model.
 */
import { DATASETS, datasetName, type DatasetName, type DatasetRequest } from "@workspace/player-client/datasets";
import { rulesText } from "@workspace/player-client/rules";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { gatherSeries } from "../agent/series";
import type { ActionCtx } from "../_generated/server";
import { fail } from "../lib/errors";
import type { Principal } from "../lib/rooms";

type Json = Record<string, unknown>;
type Page = { events?: unknown[]; objects?: { objectId: string; points: unknown[] }[]; nextCursor: number; latestCursor: number };

/** Batches after `from` up to `limit`, in pages of `page` (the projections' own maxima). */
async function pages(fetch: (afterSeq: number, limit: number) => Promise<Page>, from: number, limit: number, page: number) {
  const events: unknown[] = [];
  const series = new Map<string, unknown[]>();
  let after = from, taken = 0;
  for (;;) {
    const n = Math.min(page, limit - taken);
    if (n <= 0) break;
    const r = await fetch(after, n);
    for (const e of r.events ?? []) events.push(e);
    for (const o of r.objects ?? []) series.set(o.objectId, [...(series.get(o.objectId) ?? []), ...o.points]);
    const advanced = r.nextCursor > after;
    taken += n;
    after = r.nextCursor;
    if (!advanced || after >= r.latestCursor) break;
  }
  return { events, series: [...series].map(([objectId, points]) => ({ objectId, points })) };
}

/**
 * A dataset that does not exist for this player is null: no game in the room yet, or the player is not seated in it.
 * Anything else (a wrong gameId, lost room access) still fails.
 */
const unseated = (error: unknown) => {
  const message = error instanceof ConvexError ? String((error.data as { message?: string } | undefined)?.message ?? "") : "";
  if (/no game in this room yet|not seated|You are not seated/.test(message)) return null;
  throw error;
};

/**
 * {name: value} for every request, in request order (a name requested twice keeps the last). Throws BAD_REQUEST for a
 * game_history without a gameId; a dataset that does not exist yet (no game) is null.
 */
export async function resolveDatasets(ctx: ActionCtx, principal: Principal, roomId: string, requests: DatasetRequest[]): Promise<Record<string, unknown>> {
  let observation: Promise<Json> | undefined;
  const observe = () => (observation ??= ctx.runQuery(internal.player.observationAs, { principal, roomId }) as Promise<Json>);
  const out: Record<string, unknown> = {};
  for (const request of requests) {
    const name: DatasetName = datasetName(request);
    const options: { gameId?: string; limit?: number } = typeof request === "string" ? {} : request;
    const spec = DATASETS[name];
    const limit = Math.min(options.limit ?? spec.limit?.default ?? 0, spec.limit?.max ?? 0);
    switch (name) {
      case "observation": out[name] = await observe(); break;
      case "objects": out[name] = (await observe()).objects ?? []; break;
      case "agents": out[name] = (await observe()).agents ?? []; break;
      case "leaderboard": out[name] = (await observe()).leaderboard ?? []; break;
      case "my_utility": {
        const [o, mine] = await Promise.all([observe(), ctx.runQuery(internal.player.myUtilityAs, { principal, roomId })]);
        const u = ((o.self as Json | undefined)?.utility ?? null) as Json | null;
        out[name] = u || mine ? { name: u?.name ?? null, summary: u?.summary ?? null, source: u?.source ?? null, language: u?.language ?? null,
          emoji: u?.emoji ?? null, utility: mine ? (mine as Json).utility : null, game: mine ? { gameId: (mine as Json).gameId, settings: (mine as Json).settings } : null } : null;
        break;
      }
      case "events": {
        const head = await ctx.runQuery(internal.player.eventsAs, { principal, roomId, ...(options.gameId ? { gameId: options.gameId } : {}), limit: 1 }) as Page & { gameId: string | null };
        if (!head.gameId) { out[name] = []; break; }
        const from = Math.max(-1, head.latestCursor - limit);
        out[name] = (await pages(async (afterSeq, n) => await ctx.runQuery(internal.player.historyAs, { principal, roomId, gameId: head.gameId!, afterSeq, limit: n }) as Page,
          from, limit, 50)).events;
        break;
      }
      case "game_history": {
        if (!options.gameId) fail("BAD_REQUEST", "game_history needs a gameId (from the games dataset or list_games)");
        out[name] = (await pages(async (afterSeq, n) => await ctx.runQuery(internal.player.historyAs, { principal, roomId, gameId: options.gameId!, afterSeq, limit: n }) as Page,
          -1, limit, 50)).events;
        break;
      }
      case "trajectories": {
        out[name] = (await pages(async (afterSeq, n) => await ctx.runQuery(internal.player.trajectoriesAs,
          { principal, roomId, ...(options.gameId ? { gameId: options.gameId } : {}), afterSeq, limit: n }) as Page, -1, limit, 200)).series;
        break;
      }
      case "chat": {
        const r = await ctx.runQuery(internal.rooms.chatHistoryAs, { principal, roomId, limit: 100 }) as { messages: unknown[] };
        out[name] = r.messages;
        break;
      }
      case "settings": case "rules": {
        const room: { settings: unknown } = await ctx.runQuery(internal.rooms.getAs, { principal, room: roomId });
        out[name] = name === "settings" ? room.settings : rulesText(room.settings as Record<string, unknown>);
        break;
      }
      case "games": out[name] = await ctx.runQuery(internal.rooms.historyAs, { principal, room: roomId }); break;
      // Rival inference (docs/public-log-design.md §4): null when there is no game or the player is not seated in it.
      case "utility_series":
        out[name] = await gatherSeries(ctx, principal, roomId, { ...(options.gameId ? { gameId: options.gameId } : {}), limit }).catch(unseated);
        break;
      case "utility_candidates":
        out[name] = await ctx.runAction(internal.agent.node.candidates, { principal, roomId }).catch(unseated);
        break;
    }
  }
  return out;
}
