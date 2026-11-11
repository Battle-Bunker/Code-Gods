/**
 * The deadline on the forge's Validate and Summon, and the guard against answers that come too late. Pure (the timer
 * is passed in), so the runner (runner.ts) only maps an outcome to state.
 *
 * Both commands examine the agent in the sandbox before anything is stored. The engine bounds that examination at
 * EXAMINATION_DEADLINE_MS (20 s) and then answers UNAVAILABLE with nothing applied; this deadline is that plus a
 * margin for the round trip and the command's own queries and mutations, so the engine's answer normally comes first
 * and this one catches what the engine cannot say: an action that never started or a connection that stalled. It is one
 * user-initiated request with one deadline and a manual retry: nothing here retries or polls.
 */
import { EXAMINATION_DEADLINE_MS, type CommandResult } from "@workspace/player-client";

/** The round trip, the sandbox gate, the abuse cap and the commit around the engine's examination. */
export const COMMAND_MARGIN_MS = 5_000;
export const COMMAND_DEADLINE_MS = EXAMINATION_DEADLINE_MS + COMMAND_MARGIN_MS;

export type Examined = "validate" | "summon";
const isExamined = (type: string): type is Examined => type === "validate" || type === "summon";

/** How long the app waits for a command's receipt: only the commands that use the sandbox have a deadline. */
export function deadlineFor(type: string): number | null {
  return isExamined(type) ? COMMAND_DEADLINE_MS : null;
}

export function busyMessage(type: Examined, ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `The sandbox is busy: ${type === "validate" ? "validating" : "summoning"} took longer than ${seconds} second${seconds === 1 ? "" : "s"}. Try again.`;
}

/**
 * What the forge says about a receipt: the engine's own sentence, a "sandbox is warming" answer (notReady) and a
 * refusal included. Null for a validation with diagnostics, which the forge lists in its validation box.
 */
export function receiptNotice(type: string, result: CommandResult): { ok: boolean; text: string } | null {
  if (type === "validate" && result.validation?.diagnostics.length) return null;
  return { ok: result.accepted, text: result.message || (result.accepted ? "Accepted." : "Rejected.") };
}

export type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };

/**
 * How one attempt ended. `timeout`: no answer by the deadline (the request itself is abandoned: whatever it answers
 * later is never seen). `stale`: a newer attempt began first, so this one must change nothing.
 */
export type Attempt<T> = { status: "done"; value: T } | { status: "failed"; error: unknown } | { status: "timeout" } | { status: "stale" };

/** Attempts of one kind of request, of which only the latest may report. */
export function createAttempts(timers: Timers = realTimers) {
  let latest = 0;
  return {
    /** Run `work` with a deadline of `ms` (null: none). Never rejects. */
    run<T>(work: () => Promise<T>, ms: number | null): Promise<Attempt<T>> {
      const mine = ++latest;
      return new Promise<Attempt<T>>(resolve => {
        let timer: unknown;
        // The first to settle wins; resolving again later (a late answer) does nothing.
        const settle = (outcome: Attempt<T>) => {
          if (timer !== undefined) timers.clear(timer);
          resolve(mine === latest ? outcome : { status: "stale" });
        };
        if (ms !== null) timer = timers.set(() => { timer = undefined; settle({ status: "timeout" }); }, ms);
        let request: Promise<T>;
        try { request = work(); } catch (error) { settle({ status: "failed", error }); return; }
        request.then(value => settle({ status: "done", value }), error => settle({ status: "failed", error }));
      });
    },
  };
}
