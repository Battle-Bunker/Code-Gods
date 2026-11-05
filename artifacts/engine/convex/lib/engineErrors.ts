/**
 * A game whose ticks fail (engine/loop.ts tickFailed): how long to wait before the next try, and what players and
 * spectators are told. The public reason is a fixed phrase chosen from the error, never the error itself: an engine
 * error can name a god's family or params ("No calibration table for chessmaster …"), which no other player may see.
 */
import { IDLE_MS } from "./world.ts";

const clock = (s: number) => { const t = Math.floor(s + 1e-9); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

/** The first retry waits 2 s; each failure doubles it, up to a minute (the watchdog's own period). */
export const RETRY_BASE_MS = 2_000;
export const RETRY_MAX_MS = 60_000;
export const retryDelayMs = (failures: number) => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, Math.min(failures - 1, 10)));

const REASONS: readonly [RegExp, string][] = [
  [/calibration/i, "its scoring tables could not be loaded (usually a deploy in progress)"],
  [/sandbox|runtime|worker/i, "an agent sandbox is unavailable"],
  [/timed? ?out|timeout/i, "a tick timed out"],
];
/** The public phrase for a tick's error. */
export function engineErrorReason(message: string): string {
  return REASONS.find(([re]) => re.test(message))?.[1] ?? "an internal error";
}

/** The status line shown to everyone watching a game whose engine is retrying. */
export const engineErrorLine = (e: { reason: string }) => `The engine hit an error and is retrying: ${e.reason}.`;

/** What players and spectators are told about a game that is not advancing on its own. */
export type GameNotice = { kind: "retrying" | "idle" | "safety" | "ended"; text: string };
export const IDLE_NOTICE = `Paused: no human activity for ${IDLE_MS / 60_000} min — click anywhere to resume.`;
/**
 * The game's notice, if any: its engine retrying a failing tick, an idle park (any signed-in human's click or key resumes
 * it: activity.touch), a pause for safety (the owner resumes it), or its end (never mistaken for a stall). Shown by the player app's header and the game page,
 * so a park or a failing engine is never mistaken for a crash.
 */
export function gameNotice(game: { phase: string; autoResume?: boolean; recoveryReason?: string; engineError?: { reason: string }; endReason?: string; worldSeconds?: number }): GameNotice | undefined {
  if (game.phase === "ended") {
    const at = game.worldSeconds !== undefined ? ` at ${clock(game.worldSeconds)} of world time` : "";
    return { kind: "ended", text: game.endReason === "owner" ? `Game over: the owner ended this game${at}.`
      : game.endReason === "lifetime" ? `Game over: this game reached the end of its lifetime${at}. Nothing changes any more.` : "Game over." };
  }
  if (game.phase === "recovery") {
    if (game.autoResume) return { kind: "idle", text: IDLE_NOTICE };
    return { kind: "safety", text: `Paused for safety${game.recoveryReason ? `: ${game.recoveryReason.replace(/\.$/, "")}` : ""}. The room's owner can resume it.` };
  }
  if (game.engineError && game.phase !== "ended") return { kind: "retrying", text: engineErrorLine(game.engineError) };
  return undefined;
}
