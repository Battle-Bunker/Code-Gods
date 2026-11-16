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
import { fmtBits, fmtEnergy, fmtNum, scoreFormula } from "./format.ts";
import { moves } from "./moves.ts";
import { climbOf, climbSentence, type ClimbKind, type ClimbMove } from "./climb.tsx";
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
  /** It only flipped between two states, this many moves (the tick's tug row, W3-2 #967). */
  readonly cycle?: { readonly moves: number } | null;
}

/** A contested object's moves (the player's own act-log rows on it, oldest first): did the players climb together? */
export interface SummaryClimb {
  readonly number: number;
  readonly moves: readonly ClimbMove[];
}

export interface SummaryInput<S> {
  readonly rule: RuleRef<S, unknown>;
  /** The rule's value function (bits of a utility), for the suggested move's new bits. */
  readonly value?: (u: Score) => number;
  readonly objects: readonly SummaryObject<S>[];
  readonly tugs: readonly SummaryTug<S>[];
  /** The player's final total. */
  readonly total: number;
  /** The next game deals another rule (a rotation): the advice is the lesson, this game's object its example. */
  readonly rotates?: boolean;
  /** Set when the act log was read only in part: how many moves the costs come from. */
  readonly movesRead?: number | null;
  /** The contested objects' moves (≤ 10): each is said as climbed together or undone. */
  readonly climbs?: readonly SummaryClimb[];
  /** How the game went for the player: their total over world seconds, the game's length, the energy left unspent. */
  readonly pace?: SummaryPace;
}

export interface SummaryPace {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly endWorld: number;
  readonly energyLeft: number;
  readonly capacity: number;
}

/** "2:00" for 120 world seconds. */
const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** When the total last rose (by more than a hundredth of it), and what the last third added. */
function paceFacts(p: SummaryPace): { stalledAt: number | null; lastThird: number; full: boolean } {
  const pts = [...p.points].sort((a, b) => a.x - b.x);
  const end = pts.at(-1)?.y ?? 0;
  let lastRise = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i]!.y > pts[i - 1]!.y + Math.max(0.01, Math.abs(end) / 100)) lastRise = pts[i]!.x;
  const cut = (p.endWorld * 2) / 3;
  const atCut = [...pts].reverse().find(q => q.x <= cut)?.y ?? 0;
  return { stalledAt: pts.length > 1 && lastRise <= cut ? lastRise : null, lastThird: end - atCut, full: p.capacity > 0 && p.energyLeft >= 0.9 * p.capacity };
}

export interface Summary<S = unknown> {
  readonly noun: string;
  /** One thing to try next game, and the object it is about (when it is about one). */
  readonly next: { readonly text: string; readonly number: number | null };
  /** The best that scored: the main part's chain ("● main part: y-intercept 23 · on 23") and the score's arithmetic. */
  readonly earned: readonly { readonly number: number; readonly id?: string; readonly state: S; readonly points: number; readonly chain: string; readonly formula: string }[];
  readonly earnedNote: string;
  /** Each tug-of-war, dearest first: what happened, with whom, at what cost. */
  readonly costs: readonly { readonly number: number; readonly text: string }[];
  readonly costNote: string | null;
  /** Each contested object: climbed together, undid each other, or mixed. */
  readonly contested: readonly { readonly number: number; readonly kind: ClimbKind; readonly text: string }[];
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** "Ada", "Ada and Bo", "Ada, Bo and Cy". */
const names = (list: readonly string[]) => (list.length <= 1 ? list[0] ?? "another player" : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);
/** "You and Ada", "You, Ada and Bo". */
const youAnd = (list: readonly string[]) => (list.length <= 1 ? `You and ${list[0] ?? "another player"}` : `You, ${names(list)}`);

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

  // What cost: each tug-of-war, the one that changed hands most first (round 33: ranked by energy, the advice named a
  // 3-pull line over a 40-move cycle), said as what happened, in the same count as Contested lines.
  // A two-state cycle counts by its moves (each undoing the last), else by changes of hands.
  const weight = (t: SummaryTug<S>) => Math.max(t.flips, t.cycle?.moves ?? 0);
  const tugs = [...input.tugs].sort((a, b) => weight(b) - weight(a) || b.mySpend - a.mySpend);
  const tugText = (t: (typeof tugs)[number]) => t.cycle
    ? `flipped ${noun} ${t.number} back and forth between two states ${t.cycle.moves} times (${fmtEnergy(t.mySpend)} of yours)`
    : `pulled ${noun} ${t.number} back and forth: it changed hands ${t.flips} times (${fmtEnergy(t.mySpend)} of yours)`;
  const costs = tugs.map(t => ({ number: t.number, text: `${youAnd(t.withNames)} ${tugText(t)}.` }));
  const spent = tugs.reduce((t, x) => t + x.mySpend, 0);
  const partial = input.movesRead ? ` (from your last ${input.movesRead.toLocaleString("en-US")} moves)` : "";
  const costNote = tugs.length > 1 ? `Tug-of-wars cost you ${fmtEnergy(spent)} in all${partial}: energy that moved no ${noun} for good.` : partial ? `Counted${partial}.` : null;

  // Each contested object: whether the players climbed together or undid each other.
  const contested = (input.climbs ?? []).flatMap(c => {
    const climb = climbOf(c.moves);
    const changes = tugs.find(t => t.number === c.number)?.flips;
    return climb.kind === "alone" || !climb.steps.length ? [] : [{ number: c.number, kind: climb.kind, text: climbSentence(climb, noun, c.number, changes) }];
  });

  // One thing to try, from what happened this game, pointing only at what the player can find on screen (playtest round
  // 26: the same advice every game, about a mark nobody saw). Agents are hill climbers (owner, 14 November): on a shared
  // object what pays is a move that counts the others' bits with yours, never a destination to hold.
  let next: Summary<S>["next"];
  const top = tugs[0];
  const together = contested.find(c => c.kind === "together");
  const pace = input.pace ? paceFacts(input.pace) : null;
  // The facts of this game first, then one thing to try that follows from them (rounds 26 and 28: the same words every
  // game, even across a rotation's games).
  const tugFact = top ? `This game ${youAnd(top.withNames).replace(/^You/, "you")} ${tugText(top)}.` : "";
  const stallFact = pace?.stalledAt != null
    ? `Your points stopped rising at ${clockOf(pace.stalledAt)}${pace.full ? `, and your energy sat full (${fmtEnergy(input.pace!.energyLeft)} unspent) for the rest of the game` : ""}.`
    : "";
  const lead = (s: string) => (s ? `${s} ` : "");
  if (stallFact && (pace!.full || !top)) {
    next = { number: top?.number ?? null, text: `${lead(tugFact)}${stallFact} Next game, when your points stop rising, change what your agent tries: pick another of its starting points in Agent code, or summon a second agent that tries different moves, so your energy keeps buying moves.` };
  } else if (top) {
    next = { number: top.number, text: `${lead(tugFact)}${lead(stallFact)}Next game, open a ${noun} you share in One ${noun} and order its moves by “Best for points”: your points there are your bits × theirs, so the top move counts their bits as well as yours.${top.practice ? "" : " Tell them in chat which way you are climbing."}` };
  } else if (pace && pace.stalledAt === null && pace.lastThird > 0) {
    next = { number: null, text: `Your agent was still raising your points at the end (+${fmtNum(pace.lastThird)} points in the last third). Next game, give it a bigger share of your power from the start, in My agents, so it climbs sooner.` };
  } else if (together) {
    next = { number: together.number, text: `On ${noun} ${together.number} your moves and the others' all raised the points. Next game, find more ${noun}s like it: in ${cap(noun)}s, the others' bits on each ${noun} show which ones they want too; climb those one move at a time.` };
  } else {
    const wanted = [...input.objects].sort((a, b) => b.want - a.want)[0];
    // A line your rule does not score: the move that makes it score (playtest round 12: Exact Change had no way forward).
    const options = wanted ? moves(rule, wanted.state, input.value ?? null, { k: 1 }) : [];
    const m = options.find(x => x.utility !== null) ?? options[0];
    next = wanted && m
      ? { number: wanted.number, text: `${Noun} ${wanted.number} is the one the others want most (${fmtBits(wanted.want)}). Try “${m.words}” on it: ${fmtEnergy(m.price.total)}${m.bits !== null ? ` for ${fmtBits(m.bits)} for you` : ""}.` }
      : { number: null, text: `Open your secret goal before the world starts and find one ${noun} that is nearly what your rule wants.` };
  }
  return { noun, next, earned, earnedNote, costs, costNote, contested };
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
 * points (each with its compact face and the main part's chain, tappable), then what cost you.
 */
export function GameSummary<S>({ summary, rule, value, onOpen }: GameSummaryProps<S>): ReactElement {
  const Noun = cap(summary.noun);
  return (
    <section className="v2v v2v-summary" aria-label="How your game went">
      <div className="v2v-summary-next" data-testid="text-summary-next">
        <h4 className="v2v-summary-next-title">Try next game</h4>
        <p>{summary.next.text}</p>
      </div>
      {summary.contested.length > 0 && (<>
        <h4 className="v2v-summary-title">Contested {summary.noun}s</h4>
        <ol className="v2v-summary-list">
          {summary.contested.map(c => <li key={c.number} data-testid={`summary-climb-${c.number}`} data-kind={c.kind}>{c.text}</li>)}
        </ol>
      </>)}
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
