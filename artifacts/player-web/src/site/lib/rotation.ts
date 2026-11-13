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
