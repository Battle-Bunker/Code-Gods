/**
 * The end of a game (coordinator, 14 November; persona walks left the player with a rank and no next step): what earned
 * the player's points, said through their rule's contributor chain; what cost them (energy burnt in tug-of-wars, and
 * with whom); and one concrete thing to try next game. Lines and grids alike: the object type's own noun throughout.
 * `summarise` is pure; the app passes the data it already holds (its final values, its folded tug-of-wars).
 */
import type { ReactElement } from "react";
import type { Score } from "@workspace/v2-core";
import type { RuleRef } from "./annotate.ts";
import { contributors } from "./contributors.ts";
import { partLine } from "./faces.tsx";
import { fmtBits, fmtEnergy, fmtNum } from "./format.ts";
import { moves } from "./moves.ts";
import { nounOf } from "./refs.ts";

export interface SummaryObject<S> {
  readonly number: number;
  readonly state: S;
  /** The player's final points, bits and the others' bits on it. */
  readonly points: number;
  readonly bits: number;
  readonly want: number;
}

export interface SummaryTug {
  readonly number: number;
  /** The other side, by name. */
  readonly withNames: readonly string[];
  /** Side changes: how often the object was pulled back and forth. */
  readonly flips: number;
  /** The energy the player's agents spent on it. */
  readonly mySpend: number;
}

export interface SummaryInput<S> {
  readonly rule: RuleRef<S, unknown>;
  /** The rule's value function (bits of a utility), for the suggested move's new bits. */
  readonly value?: (u: Score) => number;
  readonly objects: readonly SummaryObject<S>[];
  readonly tugs: readonly SummaryTug[];
  /** The player's final total. */
  readonly total: number;
}

export interface Summary {
  readonly noun: string;
  readonly earned: readonly { readonly number: number; readonly points: number; readonly why: string }[];
  readonly earnedNote: string;
  readonly costs: readonly string[];
  readonly costNote: string | null;
  readonly next: string;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** "Ada", "Ada and Bo", "Ada, Bo and Cy". */
const names = (list: readonly string[]) => (list.length <= 1 ? list[0] ?? "another player" : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

/** How many objects make the "what earned" list. */
const BEST = 3;

export function summarise<S>(input: SummaryInput<S>): Summary {
  const { rule } = input;
  const noun = nounOf(rule.type), Noun = cap(noun);

  // What earned: the best few that scored, each through its main part ("y-intercept 23 · on 23").
  const best = [...input.objects].filter(o => o.points > 0).sort((a, b) => b.points - a.points).slice(0, BEST);
  const earned = best.map(o => {
    const main = contributors(rule, o.state).parts[0];
    const said = main ? partLine(main).slice(2) : "";
    return { number: o.number, points: o.points, why: `${Noun} ${o.number}: ${said}${said ? "; " : ""}your ${fmtBits(o.bits)} × others' ${fmtBits(o.want)} = ${fmtNum(o.points)} points.` };
  });
  const sum = best.reduce((t, o) => t + o.points, 0);
  const earnedNote = best.length
    ? `${best.length === 1 ? `This ${noun}` : `These ${best.length} ${noun}s`} earned ${fmtNum(sum)} of your ${fmtNum(input.total)} points.`
    : `No ${noun} scored for you this game: a ${noun} scores when it is rare for your rule and for someone else's at the same time.`;

  // What cost: each tug-of-war, dearest first.
  const tugs = [...input.tugs].sort((a, b) => b.mySpend - a.mySpend);
  const costs = tugs.map(t => `${Noun} ${t.number}: a tug-of-war with ${names(t.withNames)} (${t.flips} pulls): your agent spent ${fmtEnergy(t.mySpend)} on it.`);
  const spent = tugs.reduce((t, x) => t + x.mySpend, 0);
  const costNote = tugs.length > 1 ? `Tug-of-wars cost you ${fmtEnergy(spent)} in all: energy that moved no ${noun} for good.` : null;

  // One thing to try: the dearest tug-of-war's other side, by name; else the most wanted object made rarer for you.
  let next: string;
  const top = tugs[0];
  if (top) next = `Talk to ${top.withNames[0] ?? "the other player"} about ${noun} ${top.number} before your agents pull it: you both want it.`;
  else {
    const wanted = [...input.objects].sort((a, b) => b.want - a.want)[0];
    const m = wanted ? moves(rule, wanted.state, input.value ?? null, { k: 1 })[0] : undefined;
    next = wanted && m
      ? `${Noun} ${wanted.number} is the one the others want most (${fmtBits(wanted.want)}). ${cap(m.words)} would make it rarer for you: ${fmtEnergy(m.price.total)}${m.bits !== null ? ` for ${fmtBits(m.bits)}` : ""}.`
      : `Open your secret goal before the world starts and find one ${noun} that is nearly what your rule wants.`;
  }
  return { noun, earned, earnedNote, costs, costNote, next };
}

/** The summary as three short sections: what earned your points, what cost you, and one thing to try next game. */
export function GameSummary({ summary }: { summary: Summary }): ReactElement {
  return (
    <section className="v2v v2v-summary" aria-label="How your game went">
      <h4 className="v2v-summary-title">What earned your points</h4>
      {summary.earned.length > 0 && <ol className="v2v-summary-list">{summary.earned.map(e => <li key={e.number}>{e.why}</li>)}</ol>}
      <p className="v2v-summary-note">{summary.earnedNote}</p>
      <h4 className="v2v-summary-title">What cost you</h4>
      {summary.costs.length > 0
        ? <ol className="v2v-summary-list">{summary.costs.map(c => <li key={c}>{c}</li>)}</ol>
        : <p className="v2v-summary-note">{`No tug-of-war: your agents did not fight another player's over a ${summary.noun}.`}</p>}
      {summary.costNote && <p className="v2v-summary-note">{summary.costNote}</p>}
      <h4 className="v2v-summary-title">Try next game</h4>
      <p className="v2v-summary-next">{summary.next}</p>
    </section>
  );
}
