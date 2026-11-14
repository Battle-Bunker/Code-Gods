/**
 * The climb on one object (owner, 14 November: agents are dynamic hill climbers; objects are unique and moving far in one
 * turn is expensive, so every strategy climbs step by step towards states that pay both sides). From the player's own
 * act-log rows on the object: who moved it lately, whether each move went up or down for the player (their bits) and for
 * the others (their total), and whether the moves climbed together or undid each other. Pure model plus its component.
 */
import type { ReactElement } from "react";
import { fmtNum, pointsText } from "./format.ts";

/** One move on the object, as the player's act log has it. */
export interface ClimbMove {
  /** Who moved it: "you", or the other player's name. */
  readonly by: string;
  readonly before: { readonly rarityBits: number; readonly want: number; readonly points: number };
  readonly after: { readonly rarityBits: number; readonly want: number; readonly points: number };
}

export type ClimbKind = "together" | "undoing" | "mixed" | "alone";

export interface Climb {
  readonly kind: ClimbKind;
  /** Each move, oldest first: who, and the change for the player and for the others. */
  readonly steps: readonly { readonly by: string; readonly you: number; readonly others: number }[];
  /** The player's points before the first move and after the last. */
  readonly from: number;
  readonly to: number;
  /** Who else moved it. */
  readonly with: readonly string[];
}

/** Changes smaller than this (rounding in the stored snapshots) count as no change. */
const EPS = 0.005;
const sign = (x: number) => (x > EPS ? 1 : x < -EPS ? -1 : 0);

/**
 * How the moves went (oldest first): "together" when no move lowered either side and some raised them; "undoing" when
 * the player's bits went up and down at least twice (each side undid the other); "alone" when only the player moved it;
 * otherwise "mixed".
 */
export function climbOf(moves: readonly ClimbMove[]): Climb {
  const steps = moves.map(m => ({ by: m.by, you: m.after.rarityBits - m.before.rarityBits, others: m.after.want - m.before.want }));
  const others = [...new Set(moves.map(m => m.by).filter(b => b !== "you"))];
  let reversals = 0, last = 0;
  for (const s of steps) {
    const d = sign(s.you);
    if (d && last && d !== last) reversals++;
    if (d) last = d;
  }
  const kind: ClimbKind = !others.length ? "alone"
    : steps.every(s => s.you >= -EPS && s.others >= -EPS) && steps.some(s => s.you > EPS || s.others > EPS) ? "together"
    : reversals >= 2 ? "undoing"
    : "mixed";
  return { kind, steps, from: moves[0]?.before.points ?? 0, to: moves.at(-1)?.after.points ?? 0, with: others };
}

/** "Ada", "Ada and Bo", "Ada, Bo and Cy". */
export const namesText = (list: readonly string[]) => (list.length <= 1 ? list[0] ?? "another player" : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

/** One sentence for a contested object at the end of a game. */
export function climbSentence(c: Climb, noun: string, number: number): string {
  const Noun = noun[0]!.toUpperCase() + noun.slice(1);
  const who = `you and ${namesText(c.with)}`;
  const pts = `your points ${fmtNum(c.from)} → ${pointsText(c.to)}`;
  switch (c.kind) {
    case "together": return `${Noun} ${number}: ${who} climbed together, every move raising the points: ${pts}.`;
    case "undoing": return `${Noun} ${number}: ${who} undid each other's moves (${c.steps.length} moves): ${pts}.`;
    case "alone": return `${Noun} ${number}: only your agents moved it: ${pts}.`;
    default: return `${Noun} ${number}: ${who} moved it ${c.steps.length} times, some moves up for you and some down: ${pts}.`;
  }
}

const arrow = (x: number) => (x > EPS ? "↑" : x < -EPS ? "↓" : "→");

/** The last few moves on the object, newest last, each ↑/↓ for the player and for the others, and what they add up to. */
export function ClimbHistory({ climb, noun, shown = 5 }: { climb: Climb; noun: string; shown?: number }): ReactElement | null {
  if (!climb.steps.length) return null;
  const steps = climb.steps.slice(-shown);
  const verdict = climb.kind === "together" ? `Climbing together: no move lowered your bits or the others'.`
    : climb.kind === "undoing" ? `Stuck: these moves undo each other, up for one side and down for the other, then back. Look for a move marked ↑ both.`
    : climb.kind === "alone" ? `Only your agents moved this ${noun} lately.`
    : `Mixed: some moves went up for you, some down.`;
  return (
    <section className="v2v-climb-history" data-testid="climb-history" data-kind={climb.kind} aria-label={`The last moves on this ${noun}`}>
      <h4 className="v2v-moves-title">The last moves on this {noun}</h4>
      <ol>
        {steps.map((s, i) => (
          <li key={i} data-testid="climb-step">
            <b>{s.by === "you" ? "Your agent" : `${s.by}'s agent`}</b>
            <span data-dir={sign(s.you)}> {arrow(s.you)} you {fmtNum(Math.abs(s.you))} bits</span>
            <span data-dir={sign(s.others)}> · {arrow(s.others)} the others {fmtNum(Math.abs(s.others))} bits</span>
          </li>
        ))}
      </ol>
      <p className="v2v-climb-verdict" data-testid="text-climb-verdict">{verdict}</p>
    </section>
  );
}
