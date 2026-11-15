/**
 * The act log's sentence for one move (integration plan §2.3, §3.4; ux-lessons 2.2, 2.3), pure so it is unit tested.
 * Everything comes from one `v2Moves` row: who moved the line, the line before → after (written by the caller with
 * v2-views in the representation that changed), your rarity in bits before → after with its chance ("1 in 11 → 1 in
 * 111 by chance"; owner decision 23: no steps), and this line's points before → after with the score's formula ("your
 * 6.80 bits × others' 2.40 bits = 16.32 points", the others' bits before when they changed). When the points move
 * against your rarity, the sentence names the factor that moved; nothing is guessed when neither explains it.
 *
 * Player words only (ux 2.1): points, bits, ⚡ energy, "line"; never "grid", "object" or "payoff".
 */
import type { Variant } from "@workspace/v2-core";
import { objectTypeOf } from "../sdk/object-types.ts";
import { typesetNumbers } from "@workspace/v2-views/format";

/** The viewer's value of the line on one side of the move (the row's `before` / `after`). */
export interface MoveSnap {
  readonly score: readonly (string | null)[] | null;
  readonly rarityBits: number;
  readonly want: number;
  readonly points: number;
}

export interface MoveSentenceInput {
  /** "Your agent Tank-1", "Another player" (moveWho). */
  readonly who: string;
  /** The line's written form before and after, in the representation that changed ("y = −3x + 10"). */
  readonly change?: { readonly before: string; readonly after: string } | null;
  /** The calls in words ("move the line down 1"), when known (callWords). */
  readonly what?: string | null;
  readonly before: MoveSnap;
  readonly after: MoveSnap;
  /** Live, with the others' numbers blurred: the formula is an estimate ("about", ≈). */
  readonly approx?: boolean;
  /** What the game calls its objects: "line" (the default) or "grid" (objectWord(variant).one). */
  readonly noun?: string;
}

import { bitsText, chanceText, num, onlyYouNote, scoreFormula } from "../core/words.ts";
const same = (a: number, b: number) => num(a) === num(b);

/** Who moved it: "Your agent Tank-1", "Your agent" (a destroyed or not yet listed agent), "Another player". */
export function moveWho(row: { mine: boolean; agentId: string | null }, agentName?: string | null): string {
  // Another player's move says nothing of who made it, or how (v1's public log, restored: no attribution while live).
  if (!row.mine) return "Another player";
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
    try { return typesetNumbers(m.describe(m.args(variant).decode(c.args))); } catch { return m.title; }
  }).filter((w): w is string => !!w);
  return words.length ? words.join(", then ") : null;
}

/** Whether your rarity went up (1), down (−1) or stayed (0): better or worse for your rule (owner decision 23: no steps). */
export function rarityDirection(before: MoveSnap, after: MoveSnap): -1 | 0 | 1 {
  return same(before.rarityBits, after.rarityBits) ? 0 : (Math.sign(after.rarityBits - before.rarityBits) as -1 | 1);
}

/** "Your rarity 3.40 → 6.80 bits: 1 in 11 → 1 in 111 by chance", or "Your rarity stayed 3.40 bits (1 in 11 by chance)". */
export function rarityText(before: number, after: number): string {
  if (same(before, after)) return `Your rarity stayed ${bitsText(after)} (${chanceText(after)} by chance)`;
  return `Your rarity ${num(before)} → ${bitsText(after)}: ${chanceText(before)} → ${chanceText(after)} by chance`;
}

/**
 * Why the points moved the way they did, when that disagrees with your rarity (or your rarity stayed): the factor whose own
 * change pushed them that way. Points = your bits × the others' bits, so the move splits into yours₀ × Δothers and
 * Δyours × others₁.
 */
export function pointsCause(before: MoveSnap, after: MoveSnap, noun = "line"): string | null {
  const way = Math.sign(after.points - before.points);
  if (way === 0) return null;
  const byWant = before.rarityBits * (after.want - before.want), byRarity = (after.rarityBits - before.rarityBits) * after.want;
  const causes: string[] = [];
  if (Math.sign(byWant) === way && !same(before.want, after.want)) causes.push(`the others want this ${noun} ${after.want > before.want ? "more" : "less"} now`);
  if (Math.sign(byRarity) === way && !same(before.rarityBits, after.rarityBits)) causes.push(`this ${noun} is ${after.rarityBits > before.rarityBits ? "rarer" : "less rare"} by your rule now`);
  return causes.length ? causes.join(" and ") : null;
}

/**
 * "Points on this line 8.16 → 16.32: your 6.80 bits × others' 2.40 bits = 16.32 points", the others' bits before when
 * they changed, the reason when the points moved against your rarity, and why a line only you care about scores nothing.
 */
export function pointsText(before: MoveSnap, after: MoveSnap, noun = "line", approx = false): string {
  const formula = scoreFormula(after.rarityBits, after.want, approx);
  const was = same(before.want, after.want) ? "" : ` (others' bits were ${approx ? "about " : ""}${num(Math.max(0, before.want))})`;
  if (same(before.points, 0) && same(after.points, 0)) {
    const why = onlyYouNote(after.rarityBits, after.want, noun) ?? (same(after.rarityBits, 0) ? "It is not rare by your rule yet." : "");
    return `No points on this ${noun} yet: ${formula}${was}.${why ? ` ${why}` : ""}`;
  }
  if (same(before.points, after.points)) return `Points on this ${noun} stayed ${num(after.points)}: ${formula}${was}`;
  const head = `Points on this ${noun} ${num(before.points)} → ${num(after.points)}`;
  const better = rarityDirection(before, after), way = Math.sign(after.points - before.points);
  if (better === way) return `${head}: ${formula}${was}`;
  const cause = pointsCause(before, after, noun);
  if (cause) return `${head}, because ${cause}: ${formula}${was}`;
  // Neither factor explains it from these figures: say the rule, never a guessed cause.
  return `${head}: ${formula}${was}. A ${noun}'s points are your bits × the others' bits`;
}

/**
 * The whole sentence: "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9 (move the line down 1). Your
 * rarity 3.40 → 6.80 bits: 1 in 11 → 1 in 111 by chance. Points on this line 8.16 → 16.32: your 6.80 bits × others'
 * 2.40 bits = 16.32 points." A line not rare by your rule before or after says no rarity.
 */
export function moveSentence(i: MoveSentenceInput): string {
  const change = i.change ? `: ${i.change.before} → ${i.change.after}` : "";
  const what = i.what ? ` (${i.what})` : "";
  const parts = [
    `${i.who} changed a ${i.noun ?? "line"}${change}${what}.`,
    same(i.before.rarityBits, 0) && same(i.after.rarityBits, 0) ? null : rarityText(i.before.rarityBits, i.after.rarityBits),
    pointsText(i.before, i.after, i.noun, i.approx),
  ];
  return parts.filter(Boolean).map(p => (p!.endsWith(".") ? p : `${p}.`)).join(" ");
}
