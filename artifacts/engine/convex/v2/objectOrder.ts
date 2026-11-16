/**
 * The objects pane's orders (v1's sorts and filters, v1-audit A3): one page of a player's objects in one index's order,
 * for the app's skeleton (`v2/play:objectIds`) and the `objects.list` affordance alike.
 *
 * Sorts (v1 name → v2): payoff → points, your bits → rarity, others' care → want, most mutated → mutations (the row's
 * version, 1 at birth), newest → born, oldest → oldest (born, ascending), recently mutated → recent.
 * Filters: all; positive and contested (the same set, as v1's server had it: own bits and the others' sum both positive);
 * chips (the others care, the player's own bits are 0). A filter is the `quadrant` prefix of the same order's index.
 *
 * The index a list reads is fixed for the game's lifetime: a paginated list re-runs its loaded pages with their cursors
 * when the game ends, and a cursor is only valid on its index. At the end the disclosed fields and the quadrant become
 * the exact ones (loop.ts exactValues), so the same index gives the exact order. Games stored before the noise have no
 * key and no disclosed fields: they read the exact ones (and match no filter: their rows carry no quadrant).
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { listsKnowledge } from "./knowledge";
import type { Quadrant } from "./disclose";

export const OBJECT_SORTS = ["points", "rarity", "want", "mutations", "born", "oldest", "recent"] as const;
export type ObjectSort = (typeof OBJECT_SORTS)[number];
export const OBJECT_FILTERS = ["all", "positive", "contested", "chips"] as const;
export type ObjectFilter = (typeof OBJECT_FILTERS)[number];

const quadrantFor = (filter: ObjectFilter): Quadrant | null => (filter === "chips" ? "chips" : filter === "all" ? null : "contested");
/** The sort's key: the field the index orders by, per table (the live sorts on the others' sum read the disclosed values). */
type Key = "points" | "rarity" | "want" | "version" | "born" | "recent";
const keyOf = (sort: ObjectSort): Key => (sort === "mutations" ? "version" : sort === "oldest" ? "born" : sort);

const VALUES = {
  points: "by_game_member_points", rarity: "by_game_member_rarity", want: "by_game_member_want",
  version: "by_game_member_version", born: "by_game_member_born", recent: "by_game_member_changed",
} as const;
const SHOWN = { ...VALUES, points: "by_game_member_shownPoints", want: "by_game_member_shownWant" } as const;
const VALUES_FILTERED = {
  points: "by_game_member_quadrant_shownPoints", rarity: "by_game_member_quadrant_rarity", want: "by_game_member_quadrant_shownWant",
  version: "by_game_member_quadrant_version", born: "by_game_member_quadrant_born", recent: "by_game_member_quadrant_changed",
} as const;
const KNOWLEDGE = {
  points: "by_game_member_points", rarity: "by_game_member_rarity", want: "by_game_member_want",
  version: "by_game_member_version", born: "by_game_member_born", recent: "by_game_member_learned",
} as const;
const KNOWLEDGE_FILTERED = {
  points: "by_game_member_quadrant_points", rarity: "by_game_member_quadrant_rarity", want: "by_game_member_quadrant_want",
  version: "by_game_member_quadrant_version", born: "by_game_member_quadrant_born", recent: "by_game_member_quadrant_learned",
} as const;

type PageOpts = { numItems: number; cursor: string | null };
export type OrderRow = { objectId: Id<"v2Objects">; number: number; rarityBits: number; want: number; points: number; shownWant?: number; shownPoints?: number };

/**
 * A page of the member's object rows in a sort and filter: their value rows, or in a game that pays to read what they
 * were told (knowledge.ts listsKnowledge, for the game's lifetime). `knowledge` says which: a knowledge row's want and
 * points are already as disclosed.
 */
export async function objectPage(ctx: QueryCtx, game: Doc<"v2Games">, memberId: Id<"v2Members">, sort: ObjectSort, filter: ObjectFilter, page: PageOpts) {
  const key = keyOf(sort), quadrant = quadrantFor(filter), order = sort === "oldest" ? "asc" : "desc";
  if (listsKnowledge(game, memberId)) {
    const q = quadrant
      ? ctx.db.query("v2Knowledge").withIndex(KNOWLEDGE_FILTERED[key], q => q.eq("gameId", game._id).eq("memberId", memberId).eq("quadrant", quadrant))
      : ctx.db.query("v2Knowledge").withIndex(KNOWLEDGE[key], q => q.eq("gameId", game._id).eq("memberId", memberId));
    const p = await q.order(order).paginate(page);
    return { ...p, page: p.page as OrderRow[], knowledge: true };
  }
  const q = quadrant
    ? ctx.db.query("v2ObjectValues").withIndex(VALUES_FILTERED[key], q => q.eq("gameId", game._id).eq("memberId", memberId).eq("quadrant", quadrant))
    : ctx.db.query("v2ObjectValues").withIndex((game.noiseKey ? SHOWN : VALUES)[key], q => q.eq("gameId", game._id).eq("memberId", memberId));
  const p = await q.order(order).paginate(page);
  return { ...p, page: p.page as OrderRow[], knowledge: false };
}
