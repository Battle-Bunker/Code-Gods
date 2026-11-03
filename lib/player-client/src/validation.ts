/**
 * What a validate_agent receipt means for the next step: a verdict (works, warns: works but most acts would fail, fails,
 * never changes anything, does not compile), one line saying why, the summon price against the player's energy, and what to do next. The receipt's
 * own `valid` only says the source compiled and was priced; an agent that raises on every object is still "valid".
 * The in-client assistant once validated thirteen variants of a failing agent because every receipt read
 * "Accepted". Pure: the registry adds it to validate_agent results and the activity chip summarises it.
 */
import type { CommandResult } from "./protocol.ts";

export type ValidationVerdict = "works" | "warns" | "fails" | "no_change" | "rejected" | "not_ready";
export interface ValidationAssessment {
  verdict: ValidationVerdict;
  /** One line: what the measurement found. */
  summary: string;
  /** What to do next (for a model; a person reads the summary). */
  next: string;
  /** The examination's warnings (docs/rules-design.md §11), for the player before any summon. */
  warnings?: string[];
  cost?: number; expectedActCost?: number; energy?: number; affordable?: boolean;
}

/** Below this expected success rate (two passes over a sample world) a working agent warns (game-types LOW_SUCCESS). */
export const LOW_SUCCESS_RATE = 0.5;

/** At least this share of failing or invalid acts on the reference objects: the agent fails. */
export const FAILING_RATE = 0.5;

const pct = (rate: number) => `${Math.round(100 * rate)}%`;
const bits = (n: number) => `${n.toFixed(1)} bits`;

/** The receipt's first concrete failure ("On object 1 it fails: …", else the measurement line), shortened. */
function failureLine(diagnostics: readonly string[]): string | undefined {
  const sample = diagnostics.find(d => d.startsWith("On object 1 it fails:"));
  if (sample) return sample.replace(/^On object 1 it fails:\s*/, "").slice(0, 240);
  const measured = diagnostics.find(d => d.startsWith("Measured on"));
  const errors = measured?.match(/invalid or failing \d+% \((.*)\);/)?.[1];
  return errors?.slice(0, 240);
}

export function assessValidation(receipt: CommandResult): ValidationAssessment {
  if (receipt.notReady) {
    // The agent's language's sandbox is still booting (or failed to boot): nothing ran, so nothing about the code is known.
    return { verdict: "not_ready", summary: receipt.message, next: `Nothing ran and the code is not at fault. Wait ${(receipt.notReady.retryAfterMs / 1000).toFixed(1)} s and validate the identical source again; this does not count as a failed attempt.` };
  }
  const v = receipt.validation;
  if (!receipt.accepted || !v || !v.valid) {
    const why = (v?.diagnostics[0] ?? receipt.message).slice(0, 300);
    return { verdict: "rejected", summary: `Rejected: ${why}`, next: "It does not compile or was refused: fix the error and validate again." };
  }
  const money = { cost: v.cost, expectedActCost: v.expectedActCost, ...(v.energy !== undefined ? { energy: v.energy } : {}), ...(v.affordable !== undefined ? { affordable: v.affordable } : {}) };
  const price = `Summon price ${bits(v.cost)}${v.energy !== undefined ? `; the player had ${bits(v.energy)} of energy when it was validated (${v.affordable ? "affordable" : "not affordable yet"})` : ""}. Each act costs about ${v.expectedActCost.toFixed(2)} bits.`;
  const fixIt = "Do not summon it. Check the exact mutator and helper signatures (the writing-agents skill, or get_observation instance.helpers), fix the code, and validate again. After three failed attempts, show the player the draft and the error and ask how to go on.";
  if (v.invalidRate !== undefined && v.invalidRate >= FAILING_RATE) {
    const why = failureLine(v.diagnostics);
    return { verdict: "fails", summary: `Fails or is invalid on ${pct(v.invalidRate)} of reference objects${why ? `: ${why}` : ""}. ${price}`, next: fixIt, ...money };
  }
  if (v.changeRate !== undefined && v.changeRate === 0) {
    return { verdict: "no_change", summary: `Never changes a reference object: every act would pay without effect. ${price}`, next: fixIt, ...money };
  }
  const poor = v.affordable === false ? ` It is not affordable yet (${bits(v.energy ?? 0)} of ${bits(v.cost)}; energy grows over time).` : "";
  // Most of its acts would fail (constant, idempotent, identity, or a low rate): warn, never block.
  const futile = (v.futility && (v.futility.constant || v.futility.idempotent || v.futility.identity)) ||
    (v.expectedSuccessRate !== undefined && v.expectedSuccessRate < LOW_SUCCESS_RATE);
  if (v.warnings?.length && futile) {
    const rate = v.expectedSuccessRate !== undefined ? `About ${pct(v.expectedSuccessRate)} of its acts would succeed: ` : "";
    return { verdict: "warns", summary: `${rate}${v.warnings.join(" ")} ${price}`, warnings: v.warnings, ...money,
      next: `Tell the player the warning in plain words before any summon, and offer a fix: an act whose result depends on the object it is given (so different objects get different values) and that keeps changing an object it has changed before. Validate the fix. Summon this version only if the player still wants it; the summon card shows them the warning.${poor}` };
  }
  const measured = v.changeRate !== undefined ? `Works: changes ${pct(v.changeRate)} of reference objects${v.invalidRate ? `, ${pct(v.invalidRate)} invalid or failing` : ""}. ` : "Works. ";
  const next = v.affordable === false
    ? `The player could not afford it when validated (${bits(v.energy ?? 0)} of ${bits(v.cost)}; energy grows over time). Tell them, and offer a shorter, cheaper version or to wait.`
    : "Stop validating: tell the player the agent (what it does), its summon price against their energy and its cost per act. If they asked you to summon, call summon_agent with the identical source and language (they confirm on a card); otherwise offer to.";
  // A working agent's other warnings (the player already runs this code): told, not a reason to rewrite it.
  if (v.warnings?.length) {
    return { verdict: "works", summary: `${measured}${price} ${v.warnings.join(" ")}`, warnings: v.warnings, ...money,
      next: `${next} Tell them first: ${v.warnings.join(" ")}` };
  }
  return { verdict: "works", summary: `${measured}${price}`, next, ...money };
}
