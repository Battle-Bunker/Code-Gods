/**
 * Paying to read (owner decision 35, 15 Nov: "Paying for information should be intrinsic rather than an optional feature
 * flag, but the weighting of cost for reading information could in principle be set to zero"; v1's paid observation,
 * docs/energy-model.md §11 and lib/knowledge.ts on archive/engine-v1): "an object's birth is public; its life is paid"
 * and "activity is public; content is paid". Every game pays to look, at the spec's read price (bits read ÷ κ) times
 * the game's `readPriceWeight`; a weight of 0 reads the live world free.
 *
 * In a game that pays to read, a seated player never reads the live world: every read of an object's content goes through what the
 * player was TOLD (a `v2Knowledge` row: the state, its version, the world time of the telling, and the player's value
 * of it as disclosed). A player is told an object:
 *   1. at its birth, free;
 *   2. when one of their agents commits a change to it;
 *   3. when one of their agents' acts read the whole object (it paid exactly a look);
 *   4. when they pay for a look from their own store: an object's full read at the read price (`object.look`).
 * Free for everyone: the published standings, the number of objects, and each object's age, number of changes and
 * time of last change. After the end everything is open and exact. Spectators see the live world, as in v1 (§11.5);
 * a seated player's spectator reads give no content while live.
 * Any runtime.
 */
import { readCharge } from "@workspace/v2-economy";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { quadrantOf } from "./disclose.ts";
import { decode, typeOf, variantOf } from "./variants.ts";

import { paidLive, paysToRead, readPriceWeightOf } from "./readPrice.ts";
export { paidLive, paysToRead, readPriceWeightOf };

/** Bits to read the whole object (φ): what an act must read to tell its owner, and what a look costs at the read price. */
export const fullReadBits = (variantId: string, wire: string) => typeOf(variantId).readLength(decode(wire, variantId) as never, variantOf(variantId));
/** One look at an object: its full read at the read price (what an agent pays to read the whole object), times the weight. */
export const lookPrice = (variantId: string, wire: string, weight: number) => weight * readCharge(fullReadBits(variantId, wire));

/** What a player is told of an object: the state at a version, and their value of it as disclosed then. */
export interface Telling { objectId: Id<"v2Objects">; number: number; state: string; version: number; score: (string | null)[] | null; rarityBits: number; want: number; points: number; /** rarityBits is an upper bound (world.ts Value.bound). */ bound?: boolean }

/** Tells a player an object (writes their knowledge row and their scatter's entry for it). */
export async function tell(ctx: MutationCtx, game: Doc<"v2Games">, memberId: Id<"v2Members">, t: Telling, world: number) {
  const row = await ctx.db.query("v2Knowledge").withIndex("by_object_member", q => q.eq("objectId", t.objectId).eq("memberId", memberId)).unique();
  const next = { state: t.state, version: t.version, learnedAt: world, score: t.score, rarityBits: t.rarityBits, want: t.want, points: t.points, quadrant: quadrantOf(t.rarityBits, t.want), bound: t.bound || undefined };
  if (row) { if (row.version <= t.version) await ctx.db.patch(row._id, next); }
  else await ctx.db.insert("v2Knowledge", { gameId: game._id, memberId, objectId: t.objectId, number: t.number, ...next });
  // The others-care scatter shows what the player knows (applyToPlayers leaves a paid game's scatters to the tellings).
  const digest = await ctx.db.query("v2Digests").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", memberId)).unique();
  const packed = digest ? [...digest.packed] : [];
  const at = 3 * (t.number - 1);
  while (packed.length < at) packed.push(0);
  packed.splice(at, 3, t.number, t.rarityBits, t.want);
  if (digest) await ctx.db.patch(digest._id, { packed, version: digest.version + 1 });
  else await ctx.db.insert("v2Digests", { gameId: game._id, memberId, packed, version: 1 });
}

/** What a player was last told of an object, or null (never told: not born yet for them). */
export async function knownOf(ctx: QueryCtx, objectId: Id<"v2Objects">, memberId: Id<"v2Members">) {
  return await ctx.db.query("v2Knowledge").withIndex("by_object_member", q => q.eq("objectId", objectId).eq("memberId", memberId)).unique();
}

/** Whether this member's reads of this game go through their knowledge: seated in a paid game not yet ended. */
export const readsKnowledge = (game: Doc<"v2Games">, memberId: Id<"v2Members"> | string) =>
  paidLive(game) && game.roster.some(r => r.memberId === memberId);

/**
 * Whether this member's object list reads their knowledge: seated in a game that pays to read, for the game's lifetime (a list's
 * cursors must survive the end, when everyone is told everything exact: loop.ts exactValues).
 */
export const listsKnowledge = (game: Doc<"v2Games">, memberId: Id<"v2Members"> | string) =>
  paysToRead(game) && game.roster.some(r => r.memberId === memberId);

