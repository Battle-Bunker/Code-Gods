/**
 * A tug-of-war in the act log (owner, 14 November: agents pulling one line back and forth is the naive pattern that
 * negotiation resolves, so the screen makes it legible, not noisy). Moves on one line that alternate between your agent
 * and another player's, close together in time, fold into one entry that says who pulls, how often, what it cost you,
 * and to talk; the line's row is marked contested. Pure: from the act log's own rows (newest first).
 */
import { clock, num, timeLeft } from "../core/words.ts";

export interface TugMove {
  seq: number; objectId: string; number: number; mine: boolean; worldSeconds: number; charge: number | null;
  /** Whose agent moved the line (null on rows written before the server said). */
  by?: { memberId: string; name: string } | null;
}
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

/** "Ada", "Ada and Bo", "Ada, Bo and Cy". */
const names = (list: readonly string[]) => (list.length <= 1 ? list[0] ?? "" : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

export function tugSentence(t: Extract<FeedItem<TugMove>, { kind: "tug" }>, kinds?: ReadonlyMap<string, string>, one = "line", length?: number | null,
  opts: { /** Live: no names, nothing of the other side's spending (v1's public log). */ anonymous?: boolean; /** Every other seat is a practice partner or AI player. */ othersBots?: boolean } = {}): string {
  const when = length ? `from ${timeLeft(t.from, length)} to ${timeLeft(t.to, length)}` : `${clock(t.from)} to ${clock(t.to)}`;
  if (opts.anonymous) {
    return `Tug-of-war on ${one} ${t.number}: your agent and another player moved it back and forth ${t.moves.length} times (${when}). ` +
      `Your agent spent ${num(t.mySpend)} ⚡ on it, and every pull costs the other side too, so neither of you is getting anywhere. ` +
      (opts.othersBots ? "Practice partners do not read chat: with people, this is when you would talk to them." : `Ask in chat who else wants this ${one}.`);
  }
  // The other side, by name when the moves say who moved (older rows do not).
  const others = [...new Set(t.moves.filter(m => !m.mine && m.by).map(m => m.by!.name))];
  const theirAgents = others.length === 0 ? "another player's agent" : others.length === 1 ? `${others[0]}'s agent` : `the agents of ${names(others)}`;
  const them = others.length ? names(others) : "them";
  const ids = [...new Set(t.moves.filter(m => !m.mine && m.by).map(m => m.by!.memberId))];
  const robots = !!kinds && ids.length > 0 && ids.every(id => kinds.has(id) && kinds.get(id) !== "human");
  return `Tug-of-war on ${one} ${t.number}: your agent and ${theirAgents} moved it back and forth ${t.moves.length} times ` +
    `(${when}). Your agent spent ${num(t.mySpend)} ⚡ on it, and theirs spent energy too, so neither of ` +
    `you is getting anywhere. ` +
    // Practice partners and AI players read no chat: the advice is for a game with people.
    (robots ? "Practice partners do not read chat: with people, this is when you would talk to them." : `Talk to ${them} in chat about this ${one}.`);
}

/** The lines in a tug-of-war now (from the folded act log): their rows say so. */
export function contestedLines(items: readonly FeedItem<TugMove>[]): Set<string> {
  return new Set(items.flatMap(i => (i.kind === "tug" ? [i.objectId] : [])));
}
