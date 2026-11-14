/**
 * One colour (and dash) per player, wherever players are drawn as lines or swatches: the Leaderboard race, the replay's
 * "Scores over time" and its event marks. Keyed by the game's roster order, so a player keeps their colour from pane
 * to pane; the viewer's own line is always the accent colour (the first of the series). Pure.
 */
/** Categorical colours: theme tokens first, then a colour-blind-safe fallback (Okabe–Ito). */
export const SERIES = ["hsl(var(--primary))", "#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442"];
/** Distinct dash patterns that go with SERIES, so series stay apart without colour. */
export const DASHES = ["", "4 2", "1 2", "6 2 1 2", "8 3", "2 4", "3 1", "10 2 2 2"];

/**
 * The slot of a player in SERIES / DASHES: 0 for the viewer; the others take 1, 2, … in roster order (the viewer's
 * place is skipped, so the same player has the same slot whoever comes before them). With no viewer among the players
 * (a spectator: -1 or undefined), plain roster order.
 */
export function playerSlot(rosterIndex: number, viewerIndex: number | undefined | null): number {
  const i = Math.max(0, Math.floor(rosterIndex));
  if (viewerIndex === undefined || viewerIndex === null || viewerIndex < 0) return i % SERIES.length;
  if (i === viewerIndex) return 0;
  const others = i < viewerIndex ? i : i - 1;
  return 1 + (others % (SERIES.length - 1));
}
export const playerColour = (rosterIndex: number, viewerIndex: number | undefined | null): string => SERIES[playerSlot(rosterIndex, viewerIndex)];
export const playerDash = (rosterIndex: number, viewerIndex: number | undefined | null): string => DASHES[playerSlot(rosterIndex, viewerIndex)];

/**
 * Round axis ticks covering [lo, hi]: steps of 1, 2 or 5 times a power of ten, about `count` of them, always
 * including 0 when the range spans it. For an axis that reads "0, 1,000, 2,000" instead of the data's own maximum.
 */
export function niceTicks(lo: number, hi: number, count = 3): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [Number.isFinite(lo) ? lo : 0];
  const raw = (hi - lo) / Math.max(1, count), pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step + 0);   // + 0: never a "-0" tick
  return out;
}

/**
 * Whose line is the accent colour: the real viewer, the person at the screen, in every pane. Live, that is the
 * observation's own player; in a replay it is the replay's viewer (`replayViewerId`), NOT the player the panes are
 * "seen as", so one player never has two colours on one screen. -1: nobody among the players (a spectator).
 */
export function viewerIndex(roster: readonly string[] | undefined | null, s: { selfId: string | undefined | null; replay: boolean; replayViewerId?: string | null }): number {
  const id = s.replay ? s.replayViewerId : s.selfId;
  return id && roster ? roster.indexOf(id) : -1;
}

/**
 * A chart's value range: the data's extent, padded by `pad` of its span, but never padded across zero (a chart of
 * points that are all 0 or more had an axis label of "-271", which read as a negative score). Equal ends widen by 1.
 */
export function chartExtent(values: readonly number[], pad = 0): [number, number] {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return [0, 1];
  let lo = Math.min(...finite), hi = Math.max(...finite);
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo >= 0 ? Math.max(0, lo - p) : lo - p, hi <= 0 ? Math.min(0, hi + p) : hi + p];
}
