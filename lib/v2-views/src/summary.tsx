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
import { CompactFace, partLine } from "./faces.tsx";
import { fmtBits, fmtEnergy, fmtNum, pointsText, scoreFormula } from "./format.ts";
import { chipRep, repText, RepView } from "./rep-view.tsx";
import { moves } from "./moves.ts";
import { nounOf } from "./refs.ts";

export interface SummaryObject<S> {
  readonly number: number;
  /** The app's id for it, passed back when the player opens it. */
  readonly id?: string;
  readonly state: S;
  /** The player's final points, bits and the others' bits on it. */
  readonly points: number;
  readonly bits: number;
  readonly want: number;
}

export interface SummaryTug<S = unknown> {
  readonly number: number;
  /** The other side, by name. */
  readonly withNames: readonly string[];
  /** Side changes: how often the object was pulled back and forth. */
  readonly flips: number;
  /** The energy the player's agents spent on it. */
  readonly mySpend: number;
  /** Every other side is a practice partner (they do not read chat). */
  readonly practice?: boolean;
  /** The state the pull passed through that was worth most to the player, and its points then. */
  readonly best?: { readonly state: S; readonly points: number };
}

export interface SummaryInput<S> {
  readonly rule: RuleRef<S, unknown>;
  /** The rule's value function (bits of a utility), for the suggested move's new bits. */
  readonly value?: (u: Score) => number;
  readonly objects: readonly SummaryObject<S>[];
  readonly tugs: readonly SummaryTug<S>[];
  /** The player's final total. */
  readonly total: number;
}

export interface Summary<S = unknown> {
  readonly noun: string;
  /** One thing to try next game, and the object it is about (when it is about one). */
  readonly next: { readonly text: string; readonly number: number | null; /** A state to hold, drawn when too long to write. */ readonly state?: S };
  /** The best that scored: the main part's chain ("● y-intercept 23 · on 23") and the score's arithmetic. */
  readonly earned: readonly { readonly number: number; readonly id?: string; readonly state: S; readonly points: number; readonly chain: string; readonly formula: string }[];
  readonly earnedNote: string;
  /** Each tug-of-war, dearest first: what happened, with whom, at what cost. */
  readonly costs: readonly { readonly number: number; readonly text: string }[];
  readonly costNote: string | null;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** "Ada", "Ada and Bo", "Ada, Bo and Cy". */
const names = (list: readonly string[]) => (list.length <= 1 ? list[0] ?? "another player" : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);
/** "You and Ada", "You, Ada and Bo". */
const youAnd = (list: readonly string[]) => (list.length <= 1 ? `You and ${list[0] ?? "another player"}` : `You, ${names(list)}`);

/** A state as one short line of text ("y = 2x + 7"), or null when it is too long to read so (a board's sixteen digits). */
function written<S>(rule: RuleRef<S, unknown>, state: S): string | null {
  const t = repText(rule.type, state, chipRep(rule.type, state));
  return t.length <= 28 ? t : null;
}

/** How many objects make the "what earned" list. */
const BEST = 3;

export function summarise<S>(input: SummaryInput<S>): Summary<S> {
  const { rule } = input;
  const noun = nounOf(rule.type), Noun = cap(noun);

  // What earned: the best few that scored, each through its main part, and its score's arithmetic.
  const best = [...input.objects].filter(o => o.points > 0).sort((a, b) => b.points - a.points).slice(0, BEST);
  const earned = best.map(o => {
    const main = contributors(rule, o.state).parts[0];
    return { number: o.number, ...(o.id ? { id: o.id } : {}), state: o.state, points: o.points, chain: main ? partLine(main) : "", formula: scoreFormula(o.bits, o.want) };
  });
  const sum = best.reduce((t, o) => t + o.points, 0);
  const earnedNote = best.length
    ? `${best.length === 1 ? `This ${noun}` : `These ${best.length} ${noun}s`} earned ${fmtNum(sum)} of your ${fmtNum(input.total)} points.`
    : `No ${noun} scored for you this game: a ${noun} scores when it is rare for your rule and for someone else's at the same time.`;

  // What cost: each tug-of-war, dearest first, said as what happened.
  const tugs = [...input.tugs].sort((a, b) => b.mySpend - a.mySpend);
  const costs = tugs.map(t => ({ number: t.number, text: `${youAnd(t.withNames)} pulled ${noun} ${t.number} back and forth (${t.flips} pulls, ${fmtEnergy(t.mySpend)}).` }));
  const spent = tugs.reduce((t, x) => t + x.mySpend, 0);
  const costNote = tugs.length > 1 ? `Tug-of-wars cost you ${fmtEnergy(spent)} in all: energy that moved no ${noun} for good.` : null;

  // One thing to try. What pays on a contested line (docs/engine-v2/rule-compatibility.md) is settling it at a state
  // both sides like and holding it, not keeping off it: with people, agree it; with practice partners (who do not
  // talk), the state the pull passed through that was worth most to you, to hold next time.
  let next: Summary<S>["next"];
  const top = tugs[0];
  if (top) {
    const at = `${noun} ${top.number}`;
    next = { number: top.number, text: !top.practice
      ? `Next game, tell each other what your rules want and settle ${at} at a ${noun} that suits you both; then both hold it.`
      : top.best
        ? `Next game, hold ${at} ${(w => (w ? `at ${w}` : "like this"))(written(rule, top.best.state))}: it was worth ${pointsText(top.best.points)} to you there.`
        : `Next game, settle ${at} at a ${noun} your rule likes and hold it there.`,
      ...(top.practice && top.best && written(rule, top.best.state) === null ? { state: top.best.state } : {}) };
  } else {
    const wanted = [...input.objects].sort((a, b) => b.want - a.want)[0];
    const m = wanted ? moves(rule, wanted.state, input.value ?? null, { k: 1 })[0] : undefined;
    next = wanted && m
      ? { number: wanted.number, text: `${Noun} ${wanted.number} is the one the others want most (${fmtBits(wanted.want)}). Try “${m.words}” on it: ${fmtEnergy(m.price.total)}${m.bits !== null ? ` for ${fmtBits(m.bits)} for you` : ""}.` }
      : { number: null, text: `Open your secret goal before the world starts and find one ${noun} that is nearly what your rule wants.` };
  }
  return { noun, next, earned, earnedNote, costs, costNote };
}

export interface GameSummaryProps<S> {
  readonly summary: Summary<S>;
  readonly rule: RuleRef<S, unknown>;
  readonly value?: (u: Score) => number;
  /** Opens an object (by its id, else its number), e.g. in the replay. */
  readonly onOpen?: (id: string | undefined, number: number) => void;
}

/**
 * The summary in the contributor chain's visual language: "Try next game" first and strongest, then what earned your
 * points (each with its compact face and the ● chain, tappable), then what cost you.
 */
export function GameSummary<S>({ summary, rule, value, onOpen }: GameSummaryProps<S>): ReactElement {
  const Noun = cap(summary.noun);
  return (
    <section className="v2v v2v-summary" aria-label="How your game went">
      <div className="v2v-summary-next" data-testid="text-summary-next">
        <h4 className="v2v-summary-next-title">Try next game</h4>
        <p>{summary.next.text}</p>
        {summary.next.state !== undefined && (
          <div className="v2v-summary-held"><RepView type={rule.type} state={summary.next.state} rep={rule.family.main.rep} size="compact" /></div>
        )}
      </div>
      <h4 className="v2v-summary-title">What earned your points</h4>
      {summary.earned.length > 0 && (
        <ol className="v2v-summary-earned">
          {summary.earned.map(e => {
            const inner = (
              <>
                <CompactFace rule={rule} state={e.state} value={value} />
                <span className="v2v-summary-why">
                  <b>{Noun} {e.number}</b>
                  <span className="v2v-face-part" data-role="main">{e.chain}</span>
                  <span className="v2v-summary-formula">{e.formula}</span>
                </span>
              </>
            );
            return (
              <li key={e.number}>
                {onOpen
                  ? <button type="button" className="v2v-summary-open" aria-label={`Open ${summary.noun} ${e.number}`} onClick={() => onOpen(e.id, e.number)}>{inner}</button>
                  : <div className="v2v-summary-open">{inner}</div>}
              </li>
            );
          })}
        </ol>
      )}
      <p className="v2v-summary-note">{summary.earnedNote}</p>
      <h4 className="v2v-summary-title">What cost you</h4>
      {summary.costs.length > 0
        ? <ol className="v2v-summary-list">{summary.costs.map(c => <li key={c.number}>{c.text}</li>)}</ol>
        : <p className="v2v-summary-note">{`No tug-of-war: your agents did not fight another player's over a ${summary.noun}.`}</p>}
      {summary.costNote && <p className="v2v-summary-note">{summary.costNote}</p>}
    </section>
  );
}
