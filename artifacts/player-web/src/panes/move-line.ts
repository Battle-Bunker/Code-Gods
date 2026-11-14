/**
 * The act log's sentence for one move (integration plan §2.3, §3.4; ux-lessons 2.2, 2.3), pure so it is unit tested.
 * Everything comes from one `v2Moves` row: who moved the line, the line before → after (written by the caller with
 * v2-views in the representation that changed), the step on the viewer's ladder before → after, ✨ rarity before →
 * after with its reason, and this line's points before → after with how much the others want it (both values when
 * that changed). When the points move against the step, the sentence names the factor that moved (points = your ✨
 * rarity × how much the others want the line); nothing is guessed when neither explains it.
 *
 * Player words only (ux 2.1): points, ✨ rarity, ⚡ energy, "line"; never "grid", "object", "bits" or "payoff".
 */
import { lineType } from "@workspace/v2-linear";
import type { Variant } from "@workspace/v2-core";

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

/** One decimal, en-US grouping, a true minus sign, never "−0.0". */
export function one(x: number): string {
  const r = Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
  return (r === 0 ? 0 : r).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace("-", "−");
}
const same = (a: number, b: number) => one(a) === one(b);

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
    const m = lineType.mutators.find(x => x.id === c.mutator);
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

/** "✨ rarity 3.4 → 6.8 (fewer random lines score this well)", or null when it shows the same. */
export function rarityText(before: number, after: number): string | null {
  if (same(before, after)) return null;
  return `✨ rarity ${one(before)} → ${one(after)} (${after > before ? "fewer" : "more"} random lines score this well)`;
}

/** How much the others want the line, with what it was when that shows differently: "the others want it 2.1, was 2.4". */
export function wantText(want: number, wantBefore?: number): string {
  const was = wantBefore !== undefined && !same(want, wantBefore) ? `, was ${one(wantBefore)}` : "";
  if (Math.abs(want) < 0.05) return `the others do not want it${was}`;
  if (want < 0) return `the others would rather not have it: ${one(want)}${was}`;
  return `the others want it ${one(want)}${was}`;
}

/**
 * Why the points moved the way they did, when that disagrees with the step (or the step stayed): the factor whose own
 * change pushed them that way. Points = ✨ rarity × want, so the move splits into rarity₀ × Δwant and Δrarity × want₁.
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

/** "Points on this line 8.2 → 16.3 (the others want it 2.4)", with the reason when they moved against the step. */
export function pointsText(before: MoveSnap, after: MoveSnap): string {
  if (same(before.points, 0) && same(after.points, 0)) {
    const why = Math.abs(after.want) < 0.05 ? ": the others do not want it" : same(after.rarityBits, 0) ? ": it is not rare by your rule yet" : "";
    return `No points on this line yet${why}`;
  }
  const want = wantText(after.want, before.want);
  if (same(before.points, after.points)) return `Points on this line stayed ${one(after.points)} (${want})`;
  const head = `Points on this line ${one(before.points)} → ${one(after.points)} (${want})`;
  const step = stepDirection(before, after), way = Math.sign(after.points - before.points);
  if (step === way) return head;
  const cause = pointsCause(before, after);
  if (cause) return `${head}, because ${cause}`;
  // Against the step and neither factor explains it from these figures: say the rule, never a guessed cause.
  return `${head}. A line's points are your ✨ rarity on it × how much the others want it, not the step alone`;
}

/**
 * The whole sentence: "Your agent Tank-1 changed a line: y = −3x + 10 → y = −3x + 9 (move the line down 1). Up: step
 * 5 → 8 of 8. ✨ rarity 3.4 → 6.8 (fewer random lines score this well). Points on this line 8.2 → 16.3 (the others
 * want it 2.4)."
 */
export function moveSentence(i: MoveSentenceInput): string {
  const change = i.change ? `: ${i.change.before} → ${i.change.after}` : "";
  const what = i.what ? ` (${i.what})` : "";
  const parts = [
    `${i.who} changed a line${change}${what}.`,
    `${stepText(i.before, i.after, i.top)}.`,
    rarityText(i.before.rarityBits, i.after.rarityBits),
    `${pointsText(i.before, i.after)}.`,
  ];
  return parts.filter(Boolean).map(p => (p!.endsWith(".") ? p : `${p}.`)).join(" ");
}
