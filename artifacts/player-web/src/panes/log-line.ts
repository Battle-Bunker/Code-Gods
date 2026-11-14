/**
 * One row of the public log (v2/play:log, v1's public log) in words, pure so it is unit tested. While the game runs
 * another player's move is unattributed ("Line 7 changed"); after the end its mover is named. The viewer's points
 * before → after close the row ("about" while the others' bits are blurred).
 */
import { num } from "../core/words.ts";

export interface LogRow {
  readonly kind: "born" | "move";
  readonly number: number;
  readonly mine: boolean;
  readonly by: { readonly name: string } | null;
  readonly points: number | null;
  readonly pointsBefore: number | null;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

export function logLine(r: LogRow, o: { noun: string; change?: { before: string; after: string } | null; approx: boolean }): string {
  const it = `${o.noun} ${r.number}`;
  const head = r.kind === "born"
    ? `${cap(it)} was born${o.change ? `: ${o.change.after}` : ""}.`
    : `${r.mine ? `Your agent moved ${it}` : r.by ? `${r.by.name} moved ${it}` : `${cap(it)} changed`}${o.change ? `: ${o.change.before} → ${o.change.after}` : ""}.`;
  if (r.points === null) return head;
  const about = o.approx ? "about " : "";
  const pts = r.pointsBefore === null ? `Your points ${about}${num(r.points)}.`
    : num(r.pointsBefore) === num(r.points) ? `Your points stayed ${about}${num(r.points)}.`
    : `Your points ${about}${num(r.pointsBefore)} → ${num(r.points)}.`;
  return `${head} ${pts}`;
}
