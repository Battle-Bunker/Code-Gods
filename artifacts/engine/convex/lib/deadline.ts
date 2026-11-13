/**
 * A bound on work that waits for the agent sandbox. Pure: no Convex or Node imports.
 *
 * A player's validate or summon examines the agent with a few hundred sandbox runs before anything is stored. Each
 * run's own bounds are per run (4 s to execute, up to 34 s queued), so under a congested queue the whole examination
 * had no useful bound and the caller (the forge, the assistant's validate_agent) waited until the action died.
 * commands.ts gives the examination EXAMINATION_DEADLINE_MS (player-client protocol.ts) as a whole.
 */

/** The work did not settle within `ms`. */
export class DeadlineExceeded extends Error {
  readonly ms: number;
  constructor(ms: number) { super(`Not finished after ${ms} ms`); this.name = "DeadlineExceeded"; this.ms = ms; }
}

/**
 * `work`'s result, or DeadlineExceeded once `ms` have passed. The work itself is not cancelled (a promise cannot be):
 * the caller stops waiting for it, and a failure it reports later is ignored.
 */
export function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineExceeded(ms)), ms);
    work.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

/** What the player or the assistant is told when the examination was given up: nothing was stored, so the same command can be sent again. */
export function examinationBusyMessage(type: "validate" | "summon" | "replace", ms: number): string {
  const seconds = Math.round(ms / 1000);
  return type === "validate"
    ? `The agent sandbox is busy: validating this agent took longer than ${seconds} seconds, so nothing was validated. Send the same command again in a moment.`
    : `The agent sandbox is busy: examining this agent took longer than ${seconds} seconds, so nothing was ${type === "replace" ? "replaced" : "summoned"} or paid. Send the same command again in a moment.`;
}
