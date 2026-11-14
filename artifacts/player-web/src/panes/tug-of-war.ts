/**
 * A tug-of-war in the act log (owner, 14 November: agents pulling one line back and forth is the naive pattern that
 * negotiation resolves, so the screen makes it legible, not noisy). Moves on one line that alternate between your agent
 * and another player's, close together in time, fold into one entry that says who pulls, how often, what it cost you,
 * and to talk; the line's row is marked contested. Pure: from the act log's own rows (newest first).
 */
import { clock, num } from "../core/words.ts";

export interface TugMove { seq: number; objectId: string; number: number; mine: boolean; worldSeconds: number; charge: number | null }
export type FeedItem<M extends TugMove> =
  | { kind: "move"; move: M }
  | { kind: "tug"; objectId: string; number: number; moves: M[]; flips: number; mySpend: number; from: number; to: number };

/** World seconds between two moves of one pull: further apart, they are separate events. */
const GAP = 20;
/** Side changes that make a tug-of-war: a move, a reply and a reply back. */
const MIN_FLIPS = 2;

export function foldTugs<M extends TugMove>(moves: readonly M[]): FeedItem<M>[] {
  // Runs per line: each move joins its line's open run when it is within GAP of the run's oldest move so far.
  const runs: M[][] = [];
  const open = new Map<string, M[]>();
  for (const mv of moves) {
    const run = open.get(mv.objectId);
    if (run && run.at(-1)!.worldSeconds - mv.worldSeconds <= GAP) run.push(mv);
    else { const r = [mv]; runs.push(r); open.set(mv.objectId, r); }
  }
  const tugOf = new Map<number, FeedItem<M>>();   // keyed by the run's newest move
  const folded = new Set<number>();
  for (const run of runs) {
    let flips = 0;
    for (let i = 1; i < run.length; i++) if (run[i]!.mine !== run[i - 1]!.mine) flips++;
    if (flips < MIN_FLIPS) continue;
    const newest = run[0]!;
    tugOf.set(newest.seq, {
      kind: "tug", objectId: newest.objectId, number: newest.number, moves: run, flips,
      mySpend: run.reduce((t, x) => t + (x.mine ? x.charge ?? 0 : 0), 0), from: run.at(-1)!.worldSeconds, to: newest.worldSeconds,
    });
    for (const x of run) folded.add(x.seq);
  }
  const out: FeedItem<M>[] = [];
  for (const mv of moves) {
    const tug = tugOf.get(mv.seq);
    if (tug) out.push(tug);
    else if (!folded.has(mv.seq)) out.push({ kind: "move", move: mv });
  }
  return out;
}

export function tugSentence(t: Extract<FeedItem<TugMove>, { kind: "tug" }>): string {
  return `Tug-of-war on line ${t.number}: your agent and another player's agent moved it back and forth ${t.moves.length} times ` +
    `(${clock(t.from)} to ${clock(t.to)}). Your agent spent ${num(t.mySpend)} ⚡ on it, and theirs spent energy too, so neither of ` +
    "you is getting anywhere. Talk to them in chat about this line.";
}

/** The lines in a tug-of-war now (from the folded act log): their rows say so. */
export function contestedLines(items: readonly FeedItem<TugMove>[]): Set<string> {
  return new Set(items.flatMap(i => (i.kind === "tug" ? [i.objectId] : [])));
}
