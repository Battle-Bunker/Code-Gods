/**
 * The Lines and One line panes' pure parts (unit-tested): the sort the server answers for the human's chosen order, the
 * payoff rectangle's geometry, the row's "Why?" sentence, and how the expanded face's switcher maps to the human's
 * view state (`focus.reps`) and back to view operations. Player words only (ux-lessons 2.1, 2.8): points, ✨ rarity,
 * "how much the others want it", the noun "line".
 */
import { one } from "../core/words.ts";
import type { ViewState } from "@workspace/v2-affordances";

// ------------------------------------------------------------------ sort

export type ViewSort = ViewState["objects"]["sort"];
export type ServerSort = "points" | "rarity" | "recent";

/** The human's order (view.sortObjects) as the index the server pages by: a higher step is a higher ✨ rarity. */
export function serverSort(sort: ViewSort | undefined): ServerSort {
  switch (sort) {
    case "level": return "rarity";
    case "recent": return "recent";
    default: return "points";
  }
}

export const SORTS: readonly { sort: ViewSort; label: string }[] = [
  { sort: "points", label: "your points" },
  { sort: "level", label: "your ✨ rarity" },
  { sort: "recent", label: "recently changed" },
];

// ------------------------------------------------------------------ payoff rectangle

/**
 * One line's points drawn as a rectangle: width = your ✨ rarity, height = how much the others want it, on ONE linear
 * scale for both axes, so equal values make a square and the area is your points. The scale is the largest value of
 * either among every line of the game (the viewer's digest, written by the tick), so it holds still as rows scroll.
 * A non-zero side keeps at least MIN_PX so a tiny value stays visible (the labels carry the exact values).
 */
export interface PayoffScale { max: number }
export interface PayoffRect {
  /** gain: rarity and want; flat: rarity but nobody else wants it; none: no rarity (the line does not score for you). */
  kind: "gain" | "flat" | "none";
  width: number;
  height: number;
}
export const MIN_PX = 3;
const finite = (x: number) => (Number.isFinite(x) ? x : 0);

/** The scale from the viewer's digest (packed [number, rarity, want, …]); none yet: 0 (rectangles drawn flat). */
export function digestScale(packed: readonly number[] | undefined): PayoffScale {
  let max = 0;
  if (packed) for (let i = 0; i + 2 < packed.length; i += 3) max = Math.max(max, finite(packed[i + 1]!), finite(packed[i + 2]!));
  return { max };
}

/** A row's values widen the scale when the digest lags behind them (a line changed since the last digest). */
export const widen = (scale: PayoffScale, rarity: number, want: number): PayoffScale =>
  ({ max: Math.max(scale.max, finite(rarity), finite(want)) });

export function payoffRect(row: { rarity: number; want: number }, scale: PayoffScale, side: number): PayoffRect {
  const rarity = Math.max(0, finite(row.rarity)), want = Math.max(0, finite(row.want));
  const px = scale.max > 0 ? side / scale.max : 0;
  const size = (v: number) => (v === 0 || px === 0 ? 0 : Math.min(side, Math.max(MIN_PX, v * px)));
  const width = size(rarity), height = size(want);
  return { kind: width === 0 ? "none" : height > 0 ? "gain" : "flat", width, height };
}

// ------------------------------------------------------------------ why


/**
 * The row's "Why?": the formula in the house words with this line's numbers, then what the main part of the rule read
 * (or why the line does not score). "your ✨ rarity 3.4 × how much the others want it 2.0 = your points 6.8".
 */
export function whyLine(v: { rarity: number; want: number; points: number }, main: { sentence?: string; worst?: string | null }): string {
  const formula = `your ✨ rarity ${one(v.rarity)} × how much the others want it ${one(v.want)} = your points ${one(v.points)}`;
  if (main.worst) return `${formula}. This line does not score for your rule: ${main.worst}.`;
  return main.sentence ? `${formula}. Main part: ${main.sentence.replace(/\.$/, "")}.` : `${formula}.`;
}

// ------------------------------------------------------------------ the goal card's parts

/**
 * How a rule with parts ranks lines, in plain words (ux-lessons 2.6: "(main part, tie-breaker)", never "primary,
 * secondary"); null for a rule of one part.
 */
export function partsNote(parts: number): string | null {
  if (parts <= 1) return null;
  const names = ["main part", "tie-breaker", "second tie-breaker", "third tie-breaker"].slice(0, parts);
  return `Your rule scores a line in ${parts} parts (${names.join(", ")}): the main part counts first, and each tie-breaker only decides between lines level on everything before it.`;
}

// ------------------------------------------------------------------ switcher ↔ view state

/** The expanded face's switcher from the human's focus: none: the rule's primary; one: switched; more: compared. */
export function switcherOf(reps: readonly string[] | undefined, primary: string): { active: string; compare: string | null } {
  return { active: reps?.[0] ?? primary, compare: reps && reps.length > 1 ? reps[1]! : null };
}

export type SwitchOp =
  | { id: "view.showRepresentation"; args: { objectId: string; rep: string } }
  | { id: "view.compareRepresentations"; args: { objectId: string; reps: string[] } };

/** Switching the shown representation keeps a comparison open (unless it is the one now shown). */
export function activeOp(objectId: string, rep: string, compare: string | null): SwitchOp {
  return compare && compare !== rep
    ? { id: "view.compareRepresentations", args: { objectId, reps: [rep, compare] } }
    : { id: "view.showRepresentation", args: { objectId, rep } };
}

/** Comparing with another representation, or with nothing (back to the one shown). */
export function compareOp(objectId: string, active: string, compare: string | null): SwitchOp {
  return compare && compare !== active
    ? { id: "view.compareRepresentations", args: { objectId, reps: [active, compare] } }
    : { id: "view.showRepresentation", args: { objectId, rep: active } };
}
