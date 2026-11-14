/**
 * What your agents noted for you on their moves (lib/v2-agents `note`, on `v2/play:moves` rows), for the act log. An
 * agent may repeat a note every turn, so each note shows once per agent, on its newest move, with how often it was
 * said. Pure: from the act log's rows, newest first.
 */
export interface NoteMove { seq: number; agentId: string | null; notes?: readonly string[] | null }

/** Each move's notes to show (by its seq); a move with none to show is absent. */
export function noteLines(moves: readonly NoteMove[]): Map<number, string[]> {
  const count = new Map<string, number>();
  for (const m of moves) for (const n of m.notes ?? []) count.set(`${m.agentId}\u0000${n}`, (count.get(`${m.agentId}\u0000${n}`) ?? 0) + 1);
  const shown = new Set<string>();
  const out = new Map<number, string[]>();
  for (const m of moves) {
    const lines: string[] = [];
    for (const n of m.notes ?? []) {
      const key = `${m.agentId}\u0000${n}`;
      if (shown.has(key)) continue;
      shown.add(key);
      const times = count.get(key)!;
      lines.push(times > 1 ? `${n} (said ${times} times)` : n);
    }
    if (lines.length) out.set(m.seq, lines);
  }
  return out;
}
