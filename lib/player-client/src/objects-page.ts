/**
 * Paging the player's objects ("Objects": infinite scroll over the whole collection). Pure, so the engine's
 * `player.objectsPage` and the replay (which answers the same query from its log) page identically.
 *
 * Order: the sort key descending, then the object id ascending, so every object has one place and a cursor `{key, id}`
 * names a position that stays valid while values move (a page starts strictly after it). The keys are the VIEWER's
 * disclosed numbers: live games hand in the noisy others-sum (settings.peerNoiseBits), never an exact one; ended games
 * and replays hand in exact values. This module only orders what it is given.
 */
export const OBJECT_SORTS = ["payoff", "mine", "othersCare", "mutations", "newest", "oldest", "recentlyMutated"] as const;
export type ObjectSort = (typeof OBJECT_SORTS)[number];
/** The sort selector's labels (the panel's dropdown, its summary, the palette). */
export const OBJECT_SORT_LABELS: Record<ObjectSort, string> = {
  payoff: "Payoff", mine: "Your bits", othersCare: "Others' care",
  mutations: "Most mutated", newest: "Newest", oldest: "Oldest", recentlyMutated: "Recently mutated",
};
export const OBJECT_FILTERS = ["all", "positive", "contested", "chips"] as const;
export type ObjectFilter = (typeof OBJECT_FILTERS)[number];
export type ObjectCursor = { key: number; id: string };
/** At most this many rows in one page: every object of a game (the engine reads at most 2,100). The panel asks for its whole window in one query. */
export const OBJECT_PAGE_MAX = 2100;

/**
 * `mutations`, `createdAt` and `lastMutatedAt` are PUBLIC (the owner's disclosure decision, docs/public-log-design.md §2):
 * how many transformations the object has had, the world time (seconds) it was spawned, and the world time of its last
 * transformation (null: never). Nothing says who transformed it.
 */
export type PageRow = {
  id: string; own: { netBits: number }; peerNetBits: number; peerCare: number; payoff: number;
  mutations?: number; createdAt?: number; lastMutatedAt?: number | null;
};

/** The sort key, high first. "oldest" negates the creation time; an object never mutated sorts after every mutated one. */
export const sortKey = (o: PageRow, sort: ObjectSort) => {
  switch (sort) {
    case "mine": return o.own.netBits;
    case "othersCare": return o.peerCare;
    case "mutations": return o.mutations ?? 0;
    case "newest": return o.createdAt ?? 0;
    case "oldest": return 0 - (o.createdAt ?? 0);   // not -0: Convex keeps the sign of zero in a cursor
    case "recentlyMutated": return o.lastMutatedAt ?? -1;
    default: return o.payoff;
  }
};
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

/** World seconds as m:ss ("0:42", "12:05"). */
export const clockText = (seconds: number) => { const t = Math.max(0, Math.floor(seconds)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

/**
 * The public figures of one object as a line ("12 mutations · last 0:42 ago · spawned 3:10 ago"), for the row and the
 * detail. `now`: the world time the viewer sees (the live clock, or a replay's playhead). Nothing here says who mutated.
 */
export function mutationLine(o: Pick<PageRow, "mutations" | "createdAt" | "lastMutatedAt">, now: number) {
  const n = o.mutations ?? 0;
  return [`${n} ${n === 1 ? "mutation" : "mutations"}`,
    ...(o.lastMutatedAt != null ? [`last ${clockText(now - o.lastMutatedAt)} ago`] : []),
    `spawned ${clockText(now - (o.createdAt ?? 0))} ago`].join(" · ");
}
