/**
 * Paging the player's objects ("Objects by payoff": infinite scroll over the whole collection). Pure, so the engine's
 * `player.objectsPage` and the replay (which answers the same query from its log) page identically.
 *
 * Order: the sort key descending, then the object id ascending, so every object has one place and a cursor `{key, id}`
 * names a position that stays valid while values move (a page starts strictly after it). The keys are the VIEWER's
 * disclosed numbers: live games hand in the noisy others-sum (settings.peerNoiseBits), never an exact one; ended games
 * and replays hand in exact values. This module only orders what it is given.
 */
export const OBJECT_SORTS = ["payoff", "mine", "othersCare"] as const;
export type ObjectSort = (typeof OBJECT_SORTS)[number];
export const OBJECT_FILTERS = ["all", "positive", "contested", "chips"] as const;
export type ObjectFilter = (typeof OBJECT_FILTERS)[number];
export type ObjectCursor = { key: number; id: string };
/** At most this many rows in one page (the panel asks for its window of pages in one query). */
export const OBJECT_PAGE_MAX = 300;

export type PageRow = { id: string; own: { netBits: number }; peerNetBits: number; peerCare: number; payoff: number };

export const sortKey = (o: PageRow, sort: ObjectSort) => (sort === "mine" ? o.own.netBits : sort === "othersCare" ? o.peerCare : o.payoff);
export const matchesFilter = (o: PageRow, filter: ObjectFilter) =>
  filter === "positive" ? o.payoff > 0
    : filter === "contested" ? o.own.netBits > 0 && o.peerCare > 0
    : filter === "chips" ? o.peerCare > 0 && o.own.netBits <= 0
    : true;

/** Row order: key descending, id ascending. */
const before = (a: { key: number; id: string }, b: { key: number; id: string }) => b.key - a.key || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export type PageQuery = { sort?: ObjectSort; filter?: ObjectFilter; after?: ObjectCursor | null; limit?: number };

/**
 * One page: up to `limit` rows strictly after `after`, each with its `rank` by payoff among ALL objects (the "#3" every
 * panel and the chat use), the cursor of the next page (null at the end), how many objects match the filter, and the
 * totals over every object for the footer.
 */
export function pageObjects<T extends PageRow>(all: readonly T[], q: PageQuery = {}) {
  const sort = q.sort ?? "payoff", filter = q.filter ?? "all";
  const limit = Math.max(1, Math.min(OBJECT_PAGE_MAX, Math.floor(q.limit ?? 12)));
  const rank = new Map([...all].sort((a, b) => before({ key: a.payoff, id: a.id }, { key: b.payoff, id: b.id })).map((o, i) => [o.id, i + 1]));
  const keyed = all.filter(o => matchesFilter(o, filter)).map(o => ({ o, key: sortKey(o, sort) }))
    .sort((a, b) => before({ key: a.key, id: a.o.id }, { key: b.key, id: b.o.id }));
  const from = q.after ? keyed.findIndex(k => before(q.after!, { key: k.key, id: k.o.id }) < 0) : 0;
  const rest = from < 0 ? [] : keyed.slice(from);
  const page = rest.slice(0, limit);
  const last = page.at(-1);
  return {
    rows: page.map(k => ({ ...k.o, rank: rank.get(k.o.id)! })),
    next: last && rest.length > page.length ? { key: last.key, id: last.o.id } : null,
    matching: keyed.length, total: all.length,
    sumOwnNetBits: all.reduce((s, o) => s + o.own.netBits, 0),
    sumPeerNetBits: all.reduce((s, o) => s + o.peerNetBits, 0),
  };
}
