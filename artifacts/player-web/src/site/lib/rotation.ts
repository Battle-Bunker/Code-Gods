/**
 * The rotated deal on a goal card (engine convex/lib/dealRotation.ts, docs/beginner-pool.md §6): when a room plays
 * again with the same players, the rules pass one seat along until everyone has held each one.
 */
export interface CardRotation { round: number; of: number; from: string }

/** The rotation on a goal card, or null for an ordinary deal. */
export function cardRotation(card: unknown): CardRotation | null {
  const r = (card as { rotation?: Partial<CardRotation> } | null | undefined)?.rotation;
  if (!r || typeof r.round !== "number" || typeof r.of !== "number" || typeof r.from !== "string") return null;
  return { round: r.round, of: r.of, from: r.from };
}

/** One sentence for the player's own goal card. */
export function rotationText(r: CardRotation): string {
  return `Game ${r.round} of ${r.of}: ${r.from} held this rule last game. The rules pass one player along each game, so everyone holds each rule once.`;
}

/** A finished game as the room's history lists it (engine projection gameRecord), with what the rotation needs. */
export interface RotationGame {
  id: string;
  leaderboard: readonly { deityId: string; name: string; totalPayoff: number }[];
  rotation?: { round: number; of: number; order: readonly string[]; gameIds: readonly string[] } | null;
}
export interface RotationStatus {
  /** One line: which game of the rotation this was, and whose rule `me` gets next. */
  line: string;
  /** Points over the rotation's games so far, best first (null when an earlier game is not in the history given). */
  totals: { deityId: string; name: string; total: number }[] | null;
  games: number;
}

/**
 * Where an ended game stands in its rotation (engine lib/dealRotation.ts): the rules pass one player along the round's
 * first seat order each game, so each player always gets the rule of the player before them. Null for a game with no
 * rotation (dealt with bids, or older than rotations).
 */
export function rotationStatus(game: RotationGame, history: readonly RotationGame[], me?: string): RotationStatus | null {
  const r = game.rotation;
  if (!r || r.of < 2) return null;
  const nameOf = (id: string) => game.leaderboard.find(row => row.deityId === id)?.name ?? "another player";
  const k = me ? r.order.indexOf(me) : -1;
  const line = r.round < r.of
    ? `Game ${r.round} of ${r.of} in this rotation. ${k >= 0 ? `Play again with the same players and you get ${nameOf(r.order[(k - 1 + r.of) % r.of]!)}'s rule` : "Play again with the same players and the rules pass one player along"}, until everyone has held each rule once.`
    : `Game ${r.of} of ${r.of}: everyone has now held each rule once. One game is not the verdict: the totals over the rotation are.`;
  const earlier = r.gameIds.map(id => history.find(g => g.id === id));
  if (earlier.some(g => !g)) return { line, totals: null, games: r.round };
  const totals = new Map(game.leaderboard.map(row => [row.deityId, { deityId: row.deityId, name: row.name, total: row.totalPayoff }]));
  for (const g of earlier) for (const row of g!.leaderboard) { const t = totals.get(row.deityId); if (t) t.total += row.totalPayoff; }
  return { line, totals: [...totals.values()].sort((a, b) => b.total - a.total), games: r.round };
}
