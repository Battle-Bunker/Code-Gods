/**
 * Agent sandbox readiness: pure rules, shared by the readiness table (runtime/readiness.ts), the start, the tick and
 * every function that runs agent code. No Convex or Node imports.
 *
 * Booting an isolated runtime (CPython-WASI, the QuickJS/TypeScript pair) takes 1–2 s on a cold Node instance. The
 * game never waits for it: the start checks only that the runtime is deployed, and a scheduled warm-up boots it
 * (runtime/warm.ts). Readiness is one row per language for the whole deployment, keyed by the runtime's version (the
 * Python bundle's pin), so a redeploy with a new runtime boots again. A row is `warming` while a boot is due or in
 * flight, `ready` once one succeeded, `failed` (with the reason) when it did not; a failed boot is retried with a
 * doubling backoff whenever something asks for that language again.
 *
 * Adding a runtime needs nothing here: rows exist per language in game-core LANGUAGE_SPECS.
 */
import type { Language } from "@workspace/game-core";

export type SandboxState = "warming" | "ready" | "failed";
/** What players and the assistant see per allowed language (observation.sandboxes). */
export type SandboxView = { state: SandboxState; reason?: string };
/** One readiness row (runtime/tables.ts runtimeReadiness), as the rules need it. */
export type ReadinessRow = {
  language: Language; version: string; state: SandboxState; reason?: string;
  /** When the latest boot was scheduled (also the token its result must match). */
  attemptAt: number;
  /** Consecutive failed boots (0 after a success): the retry backoff's exponent. */
  attempts: number;
  /** When this version first booted (planningEnd: world time never starts before it). */
  readyAt?: number;
};

/** A warm-up running longer than this is presumed lost (its action crashed) and may be scheduled again. */
export const WARM_TIMEOUT_MS = 60_000;
/** Proactive callers (the settings manifest, a start) re-boot a ready runtime at most this often to keep an instance warm. */
export const KEEP_WARM_MS = 5 * 60_000;
export const RETRY_BASE_MS = 10_000;
export const RETRY_MAX_MS = 5 * 60_000;
/** How long a caller told "not ready" should wait before asking again. */
export const RETRY_AFTER_MS = 1_500;

/** The wait after the `attempts`-th consecutive failed boot before another is scheduled. */
export function retryDelay(attempts: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
}

/**
 * A language's readiness for code at `version` (the caller's runtime version; Node actions know it, queries do not
 * and trust the row). No row, or a row another runtime version wrote, is `warming`: the next ensure boots it.
 */
export function effectiveSandbox(row: ReadinessRow | null, version?: string): SandboxView {
  if (!row || (version !== undefined && row.version !== version)) return { state: "warming" };
  return row.state === "failed" ? { state: "failed", reason: row.reason ?? "The runtime failed to start" } : { state: row.state };
}

/** Whether a warm-up should be scheduled now. `keepWarm`: a proactive caller, which also refreshes a ready runtime. */
export function needsWarm(row: ReadinessRow | null, { now, version, keepWarm = false }: { now: number; version: string; keepWarm?: boolean }): boolean {
  if (!row || row.version !== version) return true;
  switch (row.state) {
    case "warming": return now - row.attemptAt > WARM_TIMEOUT_MS;
    case "failed": return now - row.attemptAt >= retryDelay(row.attempts);
    case "ready": return keepWarm && now - row.attemptAt >= KEEP_WARM_MS;
  }
}

/**
 * When a planning phase whose deadline has passed may start world time: at its deadline, or when the last of the
 * game's languages became ready if that was later. While any is warming or failed, planning holds: nobody's agents
 * could act yet, so no world second (spawns, the lifetime, agent energy) passes for anyone.
 */
export function planningEnd(deadline: number, sandboxes: readonly (SandboxView & { readyAt?: number })[]): { at: number } | { hold: true } {
  if (sandboxes.some(s => s.state !== "ready")) return { hold: true };
  return { at: Math.max(deadline, ...sandboxes.map(s => s.readyAt ?? 0)) };
}

/** The player-facing line for a language that is not ready. */
export function notReadyMessage(label: string, view: SandboxView): string {
  return view.state === "failed"
    ? `The ${label} agent sandbox failed to start: ${view.reason ?? "unknown error"}. It is retried automatically; try again shortly.`
    : `The ${label} agent sandbox is warming up; try again in a moment.`;
}
