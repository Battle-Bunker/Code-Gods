/**
 * What a validation's dry run means for the player (pure). The examination (engine/pricing.ts) already runs the
 * agent, with no effect on the game, on the game's own objects and the reference objects of its board. A receipt
 * used to say VALID whenever the code compiled, so an agent that raised on its first act was summoned and then
 * failed every act. Now: failing on every sample object is INVALID, with the error the agent raised first (the
 * same text "My agents" shows later); never moving, or failing on most objects, validates with a warning.
 */

/** At least this share of failing sample objects: a warning (the agent still validates). */
export const MOSTLY_FAILING = 0.5;

export interface DryRun {
  /** Shares of the sample objects on which the act failed or was invalid, returned no moves, and changed the object. */
  invalidRate?: number; skipRate?: number; changeRate?: number;
  /** The first failure, as the sandbox reported it ("NameError: name 'line' is not defined (line 2)"). */
  firstError?: string;
}

export interface DryRunVerdict {
  valid: boolean;
  /** For an invalid agent: the error, first in the receipt's diagnostics. */
  lead?: string;
  /** For an invalid agent: what the error means, second in the diagnostics. */
  detail?: string;
  warnings: string[];
}

const EVERY = 1 - 1e-9;

export function dryRunVerdict(run: DryRun): DryRunVerdict {
  const invalid = run.invalidRate ?? 0, skip = run.skipRate ?? 0;
  // The sandbox's own wrapper adds nothing for the player: "agent raised an error: NameError: …" reads as "NameError: …".
  const error = run.firstError?.trim().replace(/^agent (raised|threw) an error:\s*/, "").slice(0, 300);
  if (invalid >= EVERY) {
    return {
      valid: false, warnings: [],
      lead: error || "It failed on every sample object.",
      ...(error ? { detail: "It failed on every sample object, so every act would fail. Fix the error and validate again." } : {}),
    };
  }
  if (skip >= EVERY) return { valid: true, warnings: ["This agent made no move on any sample object. It may do nothing."] };
  if (invalid >= MOSTLY_FAILING) return { valid: true, warnings: [`It fails on ${Math.round(100 * invalid)}% of sample objects${error ? `: ${error}` : "."}`] };
  return { valid: true, warnings: [] };
}

/**
 * What a SUMMON receipt says about the dry run (pure). A summon is not refused for failing its dry run (AI seats, the
 * assistant, the CLI and MCP `summon_agent` summoned such agents before and do not all handle a refusal), but it must
 * not be silent either: the verdict's own warnings, and for an agent that fails on every sample object one warning with
 * the error it raised.
 */
export function summonDryRunWarnings(verdict: DryRunVerdict): string[] {
  if (verdict.valid) return verdict.warnings;
  const failing = "This agent failed on every sample object, so every act will fail";
  return [verdict.detail && verdict.lead ? `${failing}: ${verdict.lead}` : `${failing}.`, ...verdict.warnings];
}
