/**
 * The in-client assistant's limits, turn statuses and engine notes: plain values with no imports, so the modules of
 * hot reactive queries (assistant.ts, and rooms.ts through game/lobby.ts) can use them without loading the tool
 * registry that rules.ts needs (test/unit/hot-query-bundles.test.ts).
 */
export const LIMITS = {
  /** Model steps per turn, and a turn's wall-clock deadline. */
  maxSteps: 12,
  turnMs: 10 * 60_000,
  /** A confirmation card waits this long before the call counts as denied. */
  confirmMs: 2 * 60_000,
  /** Stored sizes (bytes of UTF-16 text; Convex documents stay small). A message holds a whole model context echo. */
  textChars: 32 * 1024,
  argsChars: 8 * 1024,
  resultChars: 8 * 1024,
  userTextChars: 4000,
  /** Streaming flushes: about every 250 ms or 400 characters. */
  flushMs: 250,
  flushChars: 400,
  /**
   * Output ceiling per model step (thinking included): `outputTokens` by default (it bounds the step's reservation, not
   * its bill), `maxOutputTokens` once a step was cut or a tool that writes code is loaded (outputCeiling).
   */
  outputTokens: 2048,
  maxOutputTokens: 8192,
  /** At most this many tools per load_tools call. */
  loadTools: 16,
  /** A step's stored model blocks (assistantMessages.contentJson; at most 3 bytes a character keeps the document under 1 MiB); larger ones are replayed without thinking. */
  contentChars: 200_000,
  /** Tool calls run per model step, and layout (dock) tools among them; more are answered with an error. */
  callsPerStep: 16,
  layoutCallsPerStep: 2,
  waitMs: 60_000,
  /** Model context: the thread's history is cut (oldest first) to this many characters. */
  historyChars: 60_000,
  historyMessages: 60,
  /**
   * The same tool with the same arguments and the same result as the call just before it: the first repeat is answered
   * with an engine note; at the `repeatStop`-th repeat in a row the next model step becomes the turn's last (the model
   * is going round in circles), so it answers the player instead of calling again.
   */
  repeatStop: 2,
  /** Messages a player may have queued at once (each ≤ userTextChars). */
  queued: 5,
} as const;

export type TurnStatus = "running" | "awaiting_confirmation" | "cancelling" | "done" | "failed" | "cancelled" | "budget_exhausted";
export const ACTIVE: readonly TurnStatus[] = ["running", "awaiting_confirmation", "cancelling"];
export const isActive = (status: TurnStatus) => ACTIVE.includes(status);

/**
 * A stored result with the engine's note in front (the model reads it first), after a TRUNCATED notice (the prompt
 * says a cut result's first field is TRUNCATED); notes accumulate.
 */
export function withEngineNote(resultJson: string, note: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(resultJson); } catch { parsed = resultJson; }
  const body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed };
  const { TRUNCATED, ENGINE_NOTE: earlier, ...rest } = body;
  return JSON.stringify({ ...(TRUNCATED !== undefined ? { TRUNCATED } : {}), ENGINE_NOTE: typeof earlier === "string" ? `${earlier} ${note}` : note, ...rest });
}

/** The engine notes (not from the player or a tool). */
export const ENGINE_NOTES = {
  repeat: (tool: string, times: number) => `Engine note: you just called ${tool} with these exact arguments ${times === 1 ? "once" : `${times} times`} in a row and got this same result. Repeating it will not change anything: use what you have, try something different, or answer the player.`,
  repeatStop: "Engine note: you are going round in circles, so the engine ends this turn after your next step. Do not call tools: tell the player where you got stuck (what you tried, the result, the error) and what you suggest.",
  lastStep: "Engine note: your next step is the last of this turn. Do not call tools: answer the player now in text: what you did, what you found (with the numbers), and what you suggest next.",
} as const;
