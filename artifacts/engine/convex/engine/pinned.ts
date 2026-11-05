"use node";
/**
 * A started game's calibration tables, pinned (owner, 2026-11-03: "make it so deployments don't interrupt games in
 * progress"). Every table key hashes the family's canonical params and card text (game-utilities tableKey), so a deploy
 * that changes either re-keys the shipped files; a game in progress that looked its tables up by today's keys then
 * found none between `convex deploy` and the upload of the new files, and a game whose tables had been computed on
 * demand never found them again (a running game never computes). A game therefore scores with the tables it was dealt
 * with: resolved once (at the start, engine/owner.ts launch; or by the first tick of a game started before this), stored
 * as one file per game by god (`games.tablesStorageId`), and read back by god, never by key, until the game ends.
 *
 * The file is the deal's tables only (a few to a few dozen kilobytes), never projected: it holds every god's tables.
 */
import { instantiationOf, type GameSettings } from "@workspace/game-core";
import type { CalibrationTable, UtilityDescriptor } from "@workspace/game-utilities";
import type { HoldTable } from "@workspace/game-utilities/hold";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { gameTables } from "./calibration";
import { pinTables, type Deal, type PinnedTables, type ScoringTables } from "./node";

export const PINNED_FORMAT = "code-gods.pinned-tables.v1";
type PinnedFile = { format: string; instance: string; gods: { godId: string; reward: CalibrationTable; penalty?: CalibrationTable; hold?: HoldTable }[] };

export function pinnedFile(p: PinnedTables): PinnedFile {
  return { format: PINNED_FORMAT, instance: p.instance, gods: [...p.byGod].map(([godId, t]) => ({ godId, reward: t.reward, ...(t.penalty ? { penalty: t.penalty } : {}), ...(t.hold ? { hold: t.hold } : {}) })) };
}
export function fromPinnedFile(file: PinnedFile, instance: string): PinnedTables {
  if (file?.format !== PINNED_FORMAT) throw new Error(`The game's pinned tables have format ${String(file?.format)}, expected ${PINNED_FORMAT}`);
  if (file.instance !== instance) throw new Error(`The game's pinned tables are for ${file.instance}, not ${instance}`);
  return { pinned: true, instance, byGod: new Map(file.gods.map(g => [g.godId, { reward: g.reward, ...(g.penalty ? { penalty: g.penalty } : {}), ...(g.hold ? { hold: g.hold } : {}) }])) };
}

/** Store a deal's pinned tables as one file; returns its storage id. */
export async function storePinned(ctx: ActionCtx, p: PinnedTables): Promise<Id<"_storage">> {
  return ctx.storage.store(new Blob([JSON.stringify(pinnedFile(p))], { type: "application/json" }));
}

/** Pinned files read by this process (a file never changes: its storage id is its content). */
const loaded = new Map<string, Promise<PinnedTables>>();
const MAX_LOADED = 64;
async function loadPinned(ctx: ActionCtx, storageId: Id<"_storage">, instance: string): Promise<PinnedTables> {
  let load = loaded.get(storageId);
  if (!load) {
    load = (async () => {
      const blob = await ctx.storage.get(storageId);
      if (!blob) throw new Error("The game's pinned calibration tables are missing from file storage");
      return fromPinnedFile(JSON.parse(await blob.text()) as PinnedFile, instance);
    })();
    const started = load;
    started.catch(() => { if (loaded.get(storageId) === started) loaded.delete(storageId); });
    loaded.set(storageId, load);
    while (loaded.size > MAX_LOADED) loaded.delete(loaded.keys().next().value!);
  }
  return load;
}

/**
 * The tables a started game scores with: its pinned file, or (a game started before pinning) its deal's tables resolved
 * by today's keys, which are then pinned for the rest of the game. Throws when an unpinned game's tables cannot be
 * resolved (the tick reports it: engine/loop.ts tickFailed).
 */
export async function gameScoringTables(ctx: ActionCtx, game: { _id: Id<"games">; settings: unknown; tablesStorageId?: Id<"_storage"> },
  deals: readonly Deal[]): Promise<PinnedTables> {
  const settings = game.settings as GameSettings;
  if (game.tablesStorageId) return loadPinned(ctx, game.tablesStorageId, instantiationOf(settings).key);
  const pinned = pinTables(await gameTables(ctx, settings, deals.map(d => d.utility)), settings, deals);
  const mine = await storePinned(ctx, pinned);
  const kept: Id<"_storage"> | null = await ctx.runMutation(internal.engine.loop.pinTables, { gameId: game._id, storageId: mine });
  if (kept !== mine) await ctx.storage.delete(mine);   // another tick pinned first (or the game is gone)
  return pinned;
}

/**
 * The tables one seated god scores its own values with (agent/node.ts evaluate): the game's pinned file, or for a game
 * not pinned yet the instantiation's by today's keys (never pinning from one god's deal).
 */
export async function ownScoringTables(ctx: ActionCtx, gameId: Id<"games">, settings: GameSettings, utility: UtilityDescriptor): Promise<ScoringTables> {
  const storageId: Id<"_storage"> | null = await ctx.runQuery(internal.engine.loop.pinnedTablesOf, { gameId });
  return storageId ? loadPinned(ctx, storageId, instantiationOf(settings).key) : gameTables(ctx, settings, [utility]);
}
