/**
 * The charts' pure parts (unit-tested): scales and ticks, the race's and "Your points over time"'s series from the
 * standings history, the others-care scatter from the viewer's digest, and the captions. Player words only
 * (ux-lessons 2.1): points, ✨ rarity, "how much the others want it", the noun "line". An axis never reaches below zero
 * unless a value does, and then only as far as that value (ux-lessons 2.9).
 */
import { clock, one, pointsText, productSign } from "../core/words.ts";

// ------------------------------------------------------------------ scales

export interface Domain { lo: number; hi: number }
const finite = (x: number) => (Number.isFinite(x) ? x : 0);

/**
 * A value axis: from zero (or the lowest value when one is below zero, never further) up to a round number at or
 * above the highest value. All zero: 0 to 1.
 */
export function valueDomain(values: readonly number[]): Domain {
  let lo = 0, hi = 0;
  for (const v of values) { lo = Math.min(lo, finite(v)); hi = Math.max(hi, finite(v)); }
  if (!(hi > 0)) return { lo, hi: lo < 0 ? 0 : 1 };
  // The top is the next whole step of `ticks(…, 4)`, so the top gridline is labelled: 6.3 tops out at 8, 249 at 300.
  const step = tickStep((hi - lo) / 4);
  return { lo, hi: Math.ceil(hi / step - 1e-9) * step };
}

/** The 1-2-2.5-5 × 10ⁿ step at or above `raw`. */
function tickStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw * (1 - 1e-12)) ?? 10 * p;
}

/** A time axis: from zero (the world's start) to the last time; a single moment gets one second of room. */
export function timeDomain(xs: readonly number[]): Domain {
  let hi = 0;
  for (const x of xs) hi = Math.max(hi, finite(x));
  return { lo: 0, hi: hi > 0 ? hi : 1 };
}

/** Round tick values inside the domain, about `count` of them, never outside it. */
export function ticks(d: Domain, count = 4): number[] {
  const span = d.hi - d.lo;
  if (!(span > 0)) return [d.lo];
  const step = tickStep(span / Math.max(1, count));
  const out: number[] = [];
  // Multiples of the step (never a running sum, which drifts: 0.1 + 0.2), rounded to the step's own precision.
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let i = Math.ceil(d.lo / step - 1e-9); i * step <= d.hi + step * 1e-9; i++) out.push(Number((i * step).toFixed(digits)) || 0);
  return out;
}

/** Time ticks in whole seconds that read well as m:ss: steps of 10 s, 15 s, 30 s, 1, 2, 5 or 10 minutes. */
export function timeTicks(d: Domain, count = 4): number[] {
  const span = d.hi - d.lo;
  if (!(span > 0)) return [d.lo];
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600].find(s => span / s <= count) ?? 3600;
  const out: number[] = [];
  for (let v = Math.ceil(d.lo / step) * step; v <= d.hi + 1e-9; v += step) out.push(v);
  return out;
}

/** A linear map from a domain to a pixel range (`r0` at `lo`, `r1` at `hi`). */
export function scale(d: Domain, r0: number, r1: number): (v: number) => number {
  const span = d.hi - d.lo || 1;
  return v => r0 + ((finite(v) - d.lo) / span) * (r1 - r0);
}

/** A compact axis label: "0", "250", "1.5K", "12K", "2.5M". */
export function axisNumber(v: number): string {
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (a >= 1e6) return `${sign}${trim(a / 1e6)}M`;
  if (a >= 1e4) return `${sign}${trim(a / 1e3)}K`;
  return `${sign}${a >= 10 ? Math.round(a).toLocaleString("en-US") : trim(a)}`;
}

// ------------------------------------------------------------------ series from the standings history

export interface XY { x: number; y: number }
export interface HistoryPoint { seq: number; worldSeconds: number; totals: readonly { memberId: string; net: number }[] }
export interface RosterEntry { memberId: string; name: string }
export interface Series {
  key: string;
  /** "You" for the viewer, else the player's name. */
  label: string;
  you: boolean;
  /** The categorical slot (0-based): the player's place in the game's roster, so a colour follows the player. */
  slot: number;
  points: XY[];
}

/** One player's net points at every publication that counts them, in time order. */
export function seriesOf(history: readonly HistoryPoint[], memberId: string): XY[] {
  const out: XY[] = [];
  for (const h of [...history].sort((a, b) => a.seq - b.seq)) {
    const t = h.totals.find(x => x.memberId === memberId);
    if (t) out.push({ x: finite(h.worldSeconds), y: finite(t.net) });
  }
  return out;
}

/** Every seated player's line, in roster order (the colour order), the viewer's named "You". */
export function raceSeries(history: readonly HistoryPoint[], roster: readonly RosterEntry[], me: string | null): Series[] {
  return roster.map((m, slot) => ({ key: m.memberId, label: m.memberId === me ? "You" : m.name, you: m.memberId === me, slot, points: seriesOf(history, m.memberId) }))
    .filter(s => s.points.length > 0);
}

/** Every series' value at the publication nearest `x` (the hover read-out), in the series' order. */
export function valuesAt(series: readonly Series[], x: number): { at: number; rows: { series: Series; y: number }[] } {
  let at = x, best = Infinity;
  for (const s of series) for (const p of s.points) if (Math.abs(p.x - x) < best) { best = Math.abs(p.x - x); at = p.x; }
  const rows: { series: Series; y: number }[] = [];
  for (const s of series) {
    const p = s.points.find(q => q.x === at);
    if (p) rows.push({ series: s, y: p.y });
  }
  return { at, rows };
}

/**
 * The caption under every points-over-time chart (ux-lessons 2.9: a peak above the final value read as a mismatch).
 * Always says points rise and fall; when the highest point is above the last, says both.
 */
export function riseAndFall(points: readonly XY[], s: { you: boolean; ended: boolean }): string {
  const head = "Points rise and fall: a line's points change whenever an agent changes it, and whenever the others come to want it more or less.";
  if (points.length < 2) return head;
  const last = points.at(-1)!;
  const peak = points.reduce((a, b) => (b.y > a.y ? b : a));
  if (!(peak.y > last.y + 0.05)) return head;
  const who = s.you ? "Your" : "The";
  const now = s.ended ? `${s.you ? "you" : "it"} ended with ${pointsText(last.y)}` : `${s.you ? "you have" : "it is at"} ${pointsText(last.y)} now`;
  return `${head} ${who} highest was ${pointsText(peak.y)} at ${clock(peak.x)}; ${now}.`;
}

// ------------------------------------------------------------------ others-care scatter

export type CareKind = "both" | "others" | "mine" | "none";
export interface CarePoint { number: number; rarity: number; want: number; points: number; kind: CareKind }

/** Which corner a line sits in: who cares about it (any ✨ rarity, any want). */
export function careKind(rarity: number, want: number): CareKind {
  const r = finite(rarity) > 0, w = finite(want) > 0;
  return r && w ? "both" : w ? "others" : r ? "mine" : "none";
}

/** The viewer's digest (packed [line number, your ✨ rarity, how much the others want it, …]) as points. */
export function carePoints(packed: readonly number[] | null | undefined): CarePoint[] {
  const out: CarePoint[] = [];
  if (!packed) return out;
  for (let i = 0; i + 2 < packed.length; i += 3) {
    const rarity = Math.max(0, finite(packed[i + 1]!)), want = Math.max(0, finite(packed[i + 2]!));
    out.push({ number: packed[i]!, rarity, want, points: rarity * want, kind: careKind(rarity, want) });
  }
  return out;
}

export function careCounts(points: readonly CarePoint[]): Record<CareKind, number> {
  const c: Record<CareKind, number> = { both: 0, others: 0, mine: 0, none: 0 };
  for (const p of points) c[p.kind]++;
  return c;
}

/** The kinds in legend order, each with its slot (`none` is grey, no slot) and its words. */
export const CARE_KINDS: readonly { kind: CareKind; slot: number | null; label: string }[] = [
  { kind: "both", slot: 0, label: "You both care: these earn you points" },
  { kind: "others", slot: 1, label: "The others want them, you don't: worth offering in a deal" },
  { kind: "mine", slot: 2, label: "Only you care: no points until the others want them too" },
  { kind: "none", slot: null, label: "Nobody cares yet" },
];

/** A dot's hover text. */
export function careTitle(p: CarePoint): string {
  return `Line ${p.number}: your ✨ rarity ${one(p.rarity)} × how much the others want it ${one(p.want)} ${productSign(p.rarity, p.want, p.points)} ${pointsText(p.points)}`;
}

