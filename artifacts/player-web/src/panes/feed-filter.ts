/**
 * The act log's filters and its "cost against yield" grouping (v1's feed: who, object, minimum impact; group by
 * mutator). Pure, over the rows the feed has loaded.
 */

export interface FilterMove {
  readonly seq: number;
  readonly number: number;
  readonly mine: boolean;
  readonly charge: number | null;
  readonly before: { readonly points: number };
  readonly after: { readonly points: number };
  readonly calls: readonly { readonly mutator: string }[];
}

export type FeedWho = "all" | "mine" | "others";

export interface FeedFilter {
  /** Whose moves: your agents', other players', or both. */
  readonly who?: FeedWho;
  /** Only moves on this object (its number). */
  readonly number?: number | null;
  /** Only moves that changed your points by at least this much. */
  readonly minImpact?: number;
}

/** How much a move changed your points, either way. */
export const impactOf = (m: FilterMove): number => Math.abs(m.after.points - m.before.points);

export function filterMoves<M extends FilterMove>(moves: readonly M[], f: FeedFilter): M[] {
  return moves.filter(m =>
    (f.who === "mine" ? m.mine : f.who === "others" ? !m.mine : true)
    && (f.number == null || m.number === f.number)
    && impactOf(m) >= (f.minImpact ?? 0));
}

export interface MutatorYield { readonly mutator: string; readonly moves: number; readonly spent: number; readonly gained: number }

/** Your own moves grouped by what they called: energy spent against points gained, the best yield first. */
export function mutatorYield(moves: readonly FilterMove[]): MutatorYield[] {
  const groups = new Map<string, { moves: number; spent: number; gained: number }>();
  for (const m of moves) {
    if (!m.mine || !m.calls.length) continue;
    const key = m.calls.map(c => c.mutator).join(", then ");
    const g = groups.get(key) ?? { moves: 0, spent: 0, gained: 0 };
    g.moves++; g.spent += m.charge ?? 0; g.gained += m.after.points - m.before.points;
    groups.set(key, g);
  }
  const rate = (g: { spent: number; gained: number }) => g.spent > 0 ? g.gained / g.spent : g.gained > 0 ? Infinity : g.gained;
  return [...groups].map(([mutator, g]) => ({ mutator, ...g })).sort((a, b) => rate(b) - rate(a));
}
