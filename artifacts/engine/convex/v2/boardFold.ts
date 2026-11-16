/** The board at a moment, folded from log rows (boardAt.ts). Pure: no Convex imports, so a unit test loads it. */
export interface BoardRow { objectId: string; number: number; state: string | null; own: number | null; others: number | null; points: number | null }

/**
 * Fold log rows (newest first) into the board at `world`: each object's first row at or before it. Objects born later
 * are absent. Pure (tested).
 */
export function foldBoard(rows: readonly (BoardRow & { worldSeconds: number })[], world: number, into = new Map<string, BoardRow>()): Map<string, BoardRow> {
  for (const r of rows) {
    if (r.worldSeconds > world || into.has(r.objectId)) continue;
    const { worldSeconds: _w, ...row } = r;
    into.set(r.objectId, row);
  }
  return into;
}
