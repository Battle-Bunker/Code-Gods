/** Errors, caps and defaults shared by the engines, the channel and the pool. */

export type ErrorCode = "CONFIG" | "COMPILE" | "EXECUTION" | "LIMIT" | "UNAVAILABLE";

export class SandboxError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; this.name = "SandboxError"; }
}
export const fail = (code: ErrorCode, message: string): never => { throw new SandboxError(code, message); };

export const LIMITS = Object.freeze({
  /** One host-channel message, either way (spec §6.5). */
  messageBytes: 16 * 1024,
  /** The agent's source. */
  sourceBytes: 16 * 1024,
  /** The encoded calls an agent returns. */
  callsBytes: 64 * 1024,
  /** The offer handed to `agent` (JSON). */
  offerBytes: 1024,
  stepBudgetMax: 10_000_000,
  hostCallCapMax: 4096,
  wallMsMax: 60_000,
});

/** Per-act defaults (spec §6.1: 500,000 steps and 64 host calls). `wallMs` is the time cap, a backstop. */
export const DEFAULT_LIMITS = Object.freeze({ stepBudget: 500_000, hostCallCap: 64, wallMs: 2000 });
export type ActLimits = { stepBudget: number; hostCallCap: number; wallMs: number };

export function actLimits(given: Partial<ActLimits> = {}): ActLimits {
  const limits = { ...DEFAULT_LIMITS, ...given };
  const check = (name: keyof ActLimits, max: number) => {
    const n = limits[name];
    if (!Number.isSafeInteger(n) || n < 1 || n > max) fail("CONFIG", `${name} must be an integer from 1 to ${max}`);
  };
  check("stepBudget", LIMITS.stepBudgetMax);
  check("hostCallCap", LIMITS.hostCallCapMax);
  check("wallMs", LIMITS.wallMsMax);
  return limits;
}

export const stepLimit = (steps: number) => `Step limit exceeded: the agent took more than ${steps} steps. Do less work per act.`;
export const timeLimit = (ms: number) => `Time limit exceeded: the agent ran for more than ${ms} ms. Do less work per act.`;

/** A 64-bit act seed from a decimal or 0x-hex string (or a bigint). */
export function parseSeed(seed: string | bigint): bigint {
  const value = typeof seed === "bigint" ? seed
    : typeof seed === "string" && /^(0x[0-9a-fA-F]{1,16}|[0-9]{1,20})$/.test(seed) ? BigInt(seed) : -1n;
  if (value < 0n || value >= 1n << 64n) fail("CONFIG", "seed must be a 64-bit unsigned integer (decimal or 0x hex)");
  return value;
}
