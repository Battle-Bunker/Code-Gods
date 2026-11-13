/**
 * The deadline on the forge's Validate and Summon, and the guard against answers that come too late. Pure (the timer
 * is passed in), so the runner (runner.ts) only maps an outcome to state.
 *
 * Both commands examine the agent in the sandbox before anything is stored. The engine bounds that examination at
 * EXAMINATION_DEADLINE_MS (20 s) and then answers UNAVAILABLE with nothing applied; this deadline is that plus a
 * margin for the round trip and the command's own queries and mutations, so the engine's answer normally comes first
 * and this one catches what the engine cannot say: an action that never started or a connection that stalled. It is one
 * user-initiated request; while the game is busy the runner sends the SAME envelope again a few times (BUSY_ATTEMPTS),
 * then stops and offers one "Try again".
 */
import { EXAMINATION_DEADLINE_MS, type CommandResult } from "@workspace/player-client";

/** The round trip, the sandbox gate, the abuse cap and the commit around the engine's examination. */
export const COMMAND_MARGIN_MS = 5_000;
export const COMMAND_DEADLINE_MS = EXAMINATION_DEADLINE_MS + COMMAND_MARGIN_MS;

export type Examined = "validate" | "summon" | "replace";
const isExamined = (type: string): type is Examined => type === "validate" || type === "summon" || type === "replace";

/** How long the app waits for a command's receipt: only the commands that use the sandbox have a deadline. */
export function deadlineFor(type: string): number | null {
  return isExamined(type) ? COMMAND_DEADLINE_MS : null;
}

/** How many times the forge sends an examined command by itself while the game is busy checking agents (the first try included). */
export const BUSY_ATTEMPTS = 4;
/** The pause before the forge sends the same command again. */
export const BUSY_RETRY_MS = 2_000;

/**
 * The game could not check the agent in time: no answer by the deadline, or the engine's UNAVAILABLE (nothing was
 * examined, stored or paid). The same envelope can be sent again: its command id makes a second arrival a no-op.
 */
export function isBusy(outcome: { status: string; error?: unknown }): boolean {
  if (outcome.status === "timeout") return true;
  return outcome.status === "failed" && (outcome.error as { data?: { code?: string } } | undefined)?.data?.code === "UNAVAILABLE";
}

/** What the forge says while a command waits for the sandbox: plain words, the seconds waited so far and which try it is; no number the engine might contradict. */
export function progressLine(type: Examined, retry?: { attempt: number; of: number } | null, elapsedMs?: number): string {
  // From two seconds on, the seconds waited so far (the client's clock), so a long check is not read as stuck.
  const seconds = elapsedMs !== undefined && elapsedMs >= 2_000 ? Math.floor(elapsedMs / 1000) : null;
  if (retry && retry.attempt > 1) return `The game is busy checking agents. Trying again (${retry.attempt} of ${retry.of})…${seconds !== null ? ` ${seconds} s` : ""}`;
  if (type === "validate") return seconds !== null ? `Checking your agent… ${seconds} s (this can take up to 20 seconds).` : "Checking your agent… this can take up to 20 seconds.";
  return `${type === "replace" ? "Replacing its program" : "Summoning"}…${seconds !== null ? ` ${seconds} s` : ""}`;
}

/** After the last try: what did not happen, and that nothing was spent. The forge puts one "Try again" button beside it. */
export function busyMessage(type: Examined): string {
  return type === "validate"
    ? "The game is still busy checking agents, so yours was not checked. Your code is safe."
    : `The game is still busy checking agents, so yours was not ${type === "replace" ? "replaced" : "summoned"} and nothing was spent. Your code is safe.`;
}

/**
 * What the forge says about a receipt: the engine's own sentence, a "sandbox is warming" answer (notReady) and a
 * refusal included. Null for a validation with diagnostics, which the forge lists in its validation box.
 */
export function receiptNotice(type: string, result: CommandResult): { ok: boolean; text: string } | null {
  if (type === "validate" && result.validation?.diagnostics.length) return null;
  // An accepted summon with no sentence of its own: the forge's "Summoned: …" line says it; a bare "Accepted." says nothing.
  if (type === "summon" && result.accepted && !result.message) return null;
  return { ok: result.accepted, text: result.message || (result.accepted ? "Accepted." : "Rejected.") };
}

/**
 * The notice under the header for a receipt that is not the forge's: the engine's own sentence when it has one, else
 * what happened in plain words (`say`, from the caller who knows the names: "Destroyed: Keeper. Its power share is
 * yours again."), never a bare "Accepted." for a command whose effect can be named.
 */
export function headerNotice(type: string, result: Pick<CommandResult, "accepted" | "message">, say?: string): string {
  if (!result.accepted) return result.message || "Rejected.";
  if (say) return say;
  if (result.message) return result.message;
  return type === "destroy" ? "Destroyed. Its power share is yours again." : type === "allocatePower" ? "Power share set." : "Accepted.";
}
/** What the Destroy button says once the engine accepted it. */
export const destroyedText = (name: string | undefined): string => `Destroyed: ${name?.trim() || "your agent"}. Its power share is yours again.`;

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
