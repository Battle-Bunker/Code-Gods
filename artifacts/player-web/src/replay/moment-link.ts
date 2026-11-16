/**
 * v1's replay deep links and keys: "Copy a link to this moment" writes the game's URL with `?replay&t=<world seconds>&as=<member>`,
 * which opens the replay there, watched as that player. Pure, so it is unit tested.
 */

export interface Moment { readonly worldSeconds: number | null; readonly as: string | null }

/** The game's URL that opens its replay at this world second, as this player. */
export function momentLink(gameUrl: string, m: { worldSeconds: number; as?: string | null }): string {
  const u = new URL(gameUrl);
  for (const k of ["replay", "t", "as"]) u.searchParams.delete(k);
  u.searchParams.set("replay", "");
  u.searchParams.set("t", String(Math.max(0, Math.floor(m.worldSeconds))));
  if (m.as) u.searchParams.set("as", m.as);
  return u.toString();
}

/** The moment a game URL asks for (nothing it cannot use). */
export function parseMoment(search: string): Moment {
  const q = new URLSearchParams(search);
  const t = q.get("t");
  const n = t === null || t.trim() === "" ? NaN : Number(t);
  return { worldSeconds: Number.isFinite(n) && n >= 0 ? n : null, as: q.get("as") || null };
}

export type ReplayKey = "toggle" | "back" | "forward" | "start" | "end" | "prevMoment" | "nextMoment" | "slower" | "faster";

/** What a key press does in a replay, or null: never while typing or with a modifier (the palette's Ctrl+K stays its own). */
export function replayKey(e: { key: string; target?: string; ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean }): ReplayKey | null {
  if (e.ctrl || e.meta || e.alt) return null;
  if (e.target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target)) return null;
  // Shift+arrows jump between key moments (v1's "◆ prev / next ◆").
  if (e.shift && e.key === "ArrowLeft") return "prevMoment";
  if (e.shift && e.key === "ArrowRight") return "nextMoment";
  switch (e.key) {
    case " ": return "toggle";
    case "ArrowLeft": return "back";
    case "ArrowRight": return "forward";
    case "Home": return "start";
    case "End": return "end";
    case "[": return "slower";
    case "]": return "faster";
    default: return null;
  }
}

/** The speed one step slower or faster in the list (v1's [ and ]), or null past either end. */
export function nextSpeed<T extends number>(speeds: readonly T[], now: number, direction: 1 | -1): T | null {
  const i = speeds.indexOf(now as T);
  const j = i < 0 ? speeds.findIndex(s => s >= now) : i + direction;
  return j >= 0 && j < speeds.length ? speeds[j]! : null;
}
