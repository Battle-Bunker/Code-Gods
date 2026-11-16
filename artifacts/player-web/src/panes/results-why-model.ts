/**
 * "Why: your best and worst lines" on the end page (v1's results), pure: each line's points over the game from the
 * moves on it (each move carries your points before and after), and the worst lines without the best.
 */
export interface MoveSnap { worldSeconds: number; before: { points: number }; after: { points: number } }
export interface XY { x: number; y: number }

/** A line's points over the game: before its first move, then after each (moves arrive newest first). */
export function pointsOverGame(moves: readonly MoveSnap[] | undefined, nowPoints: number | undefined, endWorld: number | undefined): XY[] {
  const ordered = [...(moves ?? [])].sort((a, b) => a.worldSeconds - b.worldSeconds);
  const out: XY[] = [];
  if (ordered[0]) out.push({ x: 0, y: ordered[0].before.points });
  for (const m of ordered) out.push({ x: m.worldSeconds, y: m.after.points });
  // Where it ended (a line nobody moved is flat at its points).
  if (nowPoints !== undefined && endWorld !== undefined && (out.length === 0 || endWorld > out.at(-1)!.x)) {
    if (out.length === 0) out.push({ x: 0, y: nowPoints });
    out.push({ x: endWorld, y: nowPoints });
  }
  return out;
}

/** The worst lines: the lowest scored, without any already among the best. */
export const worstWithout = <T extends { objectId: string }>(worst: readonly T[], best: readonly T[]): T[] =>
  worst.filter(w => !best.some(b => b.objectId === w.objectId));
