/**
 * The act log's sentence for one move (integration plan §2.3, §3.4; ux-lessons 2.2, 2.3), pure so it is unit tested.
 * Everything comes from one `v2Moves` row: who moved the line, the line before → after (written by the caller with
 * v2-views in the representation that changed), the step on the viewer's ladder before → after, your rarity in bits
 * before → after with its reason, and this line's points before → after with the score's formula ("your 6.80 bits ×
 * others' 2.40 bits = 16.32 points", the others' bits before when they changed). When the points move against the
 * step, the sentence names the factor that moved; nothing is guessed when neither explains it.
 *
 * Player words only (ux 2.1): points, bits, ⚡ energy, "line"; never "grid", "object" or "payoff".
 */
import type { Variant } from "@workspace/v2-core";
import { objectTypeOf } from "../sdk/object-types.ts";

/** The viewer's value of the line on one side of the move (the row's `before` / `after`). */
export interface MoveSnap {
  readonly score: readonly (string | null)[] | null;
  readonly level: number;
  readonly rarityBits: number;
  readonly want: number;
  readonly points: number;
}

export interface MoveSentenceInput {
  /** "Your agent Tank-1", "Another player's agent" (moveWho). */
  readonly who: string;
  /** The line's written form before and after, in the representation that changed ("y = −3x + 10"). */
  readonly change?: { readonly before: string; readonly after: string } | null;
  /** The calls in words ("move the line down 1"), when known (callWords). */
  readonly what?: string | null;
  readonly before: MoveSnap;
  readonly after: MoveSnap;
  /** The top step of the viewer's ladder, when the rule is known. */
  readonly top?: number | null;
}

import { bitsText, num, onlyYouNote, scoreFormula } from "../core/words.ts";
const same = (a: number, b: number) => num(a) === num(b);

/** Who moved it: "Your agent Tank-1", "Your agent" (a destroyed or not yet listed agent), "Another player's agent". */
export function moveWho(row: { mine: boolean; agentId: string | null }, agentName?: string | null): string {
  if (!row.mine) return "Another player's agent";
  return agentName ? `Your agent ${agentName}` : "Your agent";
}

/**
 * The calls in words, from the line's own mutators ("move the line down 1"; several joined by ", then "). A call this
 * build cannot read (a mutator unknown here, arguments outside the variant) is said by the mutator's title or left out.
 */
export function callWords(calls: readonly { mutator: string; site: number; args: Readonly<Record<string, string>> }[], variant: Variant): string | null {
  const words = calls.map(c => {
    const m = objectTypeOf(variant.id).mutators.find(x => x.id === c.mutator);
    if (!m) return null;
    try { return m.describe(m.args(variant).decode(c.args)); } catch { return m.title; }
  }).filter((w): w is string => !!w);
  return words.length ? words.join(", then ") : null;
}

const stepName = (s: MoveSnap, top?: number | null) => (s.score === null ? "not scoring" : top != null ? `step ${s.level} of ${top}` : `step ${s.level}`);

/** "Up: step 5 → 8 of 8", "Down: step 3 of 8 → not scoring", "Still step 5 of 8". */
export function stepText(before: MoveSnap, after: MoveSnap, top?: number | null): string {
  const scored0 = before.score !== null, scored1 = after.score !== null;
  if (scored0 === scored1 && (!scored1 || before.level === after.level)) return `Still ${stepName(after, top)}`;
  const up = !scored0 || (scored1 && after.level > before.level);
  const of = top != null ? ` of ${top}` : "";
  const range = scored0 && scored1 ? `step ${before.level} → ${after.level}${of}` : `${stepName(before, top)} → ${stepName(after, top)}`;
  return `${up ? "Up" : "Down"}: ${range}`;
}

/** Whether the step went up (1), down (−1) or stayed (0); not scoring is below every step. */
export function stepDirection(before: MoveSnap, after: MoveSnap): -1 | 0 | 1 {
  const l = (s: MoveSnap) => (s.score === null ? -1 : s.level);
  return Math.sign(l(after) - l(before)) as -1 | 0 | 1;
}

/** "Your rarity 3.40 → 6.80 bits (fewer random lines score this well)", or null when it shows the same. */
export function rarityText(before: number, after: number): string | null {
  if (same(before, after)) return null;
  return `Your rarity ${num(before)} → ${bitsText(after)} (${after > before ? "fewer" : "more"} random lines score this well)`;
}

/**
 * Why the points moved the way they did, when that disagrees with the step (or the step stayed): the factor whose own
 * change pushed them that way. Points = your bits × the others' bits, so the move splits into yours₀ × Δothers and
 * Δyours × others₁.
 */
export function pointsCause(before: MoveSnap, after: MoveSnap): string | null {
  const way = Math.sign(after.points - before.points);
  if (way === 0) return null;
  const byWant = before.rarityBits * (after.want - before.want), byRarity = (after.rarityBits - before.rarityBits) * after.want;
  const causes: string[] = [];
  if (Math.sign(byWant) === way && !same(before.want, after.want)) causes.push(`the others want this line ${after.want > before.want ? "more" : "less"} now`);
  if (Math.sign(byRarity) === way && !same(before.rarityBits, after.rarityBits)) causes.push(`this line is ${after.rarityBits > before.rarityBits ? "rarer" : "less rare"} by your rule now`);
  return causes.length ? causes.join(" and ") : null;
}

/**
 * "Points on this line 8.16 → 16.32: your 6.80 bits × others' 2.40 bits = 16.32 points", the others' bits before when
 * they changed, the reason when the points moved against the step, and why a line only you care about scores nothing.
 */
export function pointsText(before: MoveSnap, after: MoveSnap): string {
  const formula = scoreFormula(after.rarityBits, after.want);
  const was = same(before.want, after.want) ? "" : ` (others' bits were ${num(before.want)})`;
  if (same(before.points, 0) && same(after.points, 0)) {
    const why = onlyYouNote(after.rarityBits, after.want) ?? (same(after.rarityBits, 0) ? "It is not rare by your rule yet." : "");
    return `No points on this line yet: ${formula}${was}.${why ? ` ${why}` : ""}`;
  }
  if (same(before.points, after.points)) return `Points on this line stayed ${num(after.points)}: ${formula}${was}`;
  const head = `Points on this line ${num(before.points)} → ${num(after.points)}`;
  const step = stepDirection(before, after), way = Math.sign(after.points - before.points);
  if (step === way) return `${head}: ${formula}${was}`;
  const cause = pointsCause(before, after);
  if (cause) return `${head}, because ${cause}: ${formula}${was}`;
  // Against the step and neither factor explains it from these figures: say the rule, never a guessed cause.
  return `${head}: ${formula}${was}. A line's points are your bits × the others' bits, not the step alone`;
}

/**
 * The whole sentence: "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9 (move the line down 1). Up: step
 * 5 → 8 of 8. Your rarity 3.40 → 6.80 bits (fewer random lines score this well). Points on this line 8.16 → 16.32:
 * your 6.80 bits × others' 2.40 bits = 16.32 points."
 */
export function moveSentence(i: MoveSentenceInput): string {
  const change = i.change ? `: ${i.change.before} → ${i.change.after}` : "";
  const what = i.what ? ` (${i.what})` : "";
  const parts = [
    `${i.who} changed a line${change}${what}.`,
    `${stepText(i.before, i.after, i.top)}.`,
    rarityText(i.before.rarityBits, i.after.rarityBits),
    pointsText(i.before, i.after),
  ];
  return parts.filter(Boolean).map(p => (p!.endsWith(".") ? p : `${p}.`)).join(" ");
}
