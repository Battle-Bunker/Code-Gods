export type Language = "python" | "typescript";
/** An object's wire value: a safe integer, or an ASCII string of at most `wireMaxLength` chars. */
export type WireValue = number | string;
/** One mutator call in wire form (lib/game-types MutatorCallWire). */
export type WireCall = [string, Record<string, unknown>];

/**
 * The room's pricing vocabulary for one language: the game-specific part of the ast-bits tables.
 * Every list: at most 4096 non-empty strings of at most 128 characters.
 */
export interface PricingVocab {
  /** Every external API name the prelude binds (helpers, constructors, constants such as colour names). */
  api: string[];
  /** Attribute / method names of the objects the API hands an agent (grid.cells, cell.colour, ...). */
  attrs: string[];
  /** Keyword / parameter names of the API constructors. */
  params: string[];
  /** Strings the API gives meaning to (colour names, mutator ids, field values, suits, digit glyphs). */
  strings: string[];
  /** The names in `api` that are mutator constructors (a literal call of one is a literal move). */
  mutators: string[];
  /** The names in `api` that build areas (allowed inside a literal move's arguments). */
  areas: string[];
}

/** Trusted guest source for one instantiation (lib/game-types `PreludeParts`, with `key = hash`). */
export interface RuntimePrelude {
  /** Identity of the prelude (the PreludeParts sha256); 1–128 printable ASCII chars. Part of every cache key. */
  key: string;
  /** Each part: NUL-free UTF-8, at most 65536 bytes. */
  python: string;
  js: string;
  dts: string;
  /** Pricing vocabulary; `typescript` defaults to `python`. Part of every cache key. */
  pricing: { python: PricingVocab; typescript?: PricingVocab };
}

/** Room settings this package reads; extra fields (a full GameSettings) are ignored. */
export interface ActSettings {
  /** Type name, for cache keys only (/^[A-Za-z][A-Za-z0-9_]{0,63}$/). The runtime knows no type. */
  objectType: string;
  /** Maximum wire string length, 0–1024 (0 for numeric types). */
  wireMaxLength: number;
  /**
   * CPU backstop, 1–1000 ms, default 5. Also scales the deterministic Python fuel ceiling
   * (2,000,000 Wasm instructions per ms). Open agents should run with a generous value (e.g. 1000)
   * so that the deterministic step budget is what binds.
   */
  interactionComputeMs?: number;
  /** Deterministic step budget per act, 1–10,000,000, default 500,000. */
  stepBudget?: number;
  prelude: RuntimePrelude;
}

/** A summon price, by part, in bits. The host adds the literal moves (see `inspect`). */
export interface Inspection {
  complexityFunctionId: "ast-bits-v1" | "ts-ast-bits-v1-uniform";
  /** structure + names + literals + moveFlags: every bit except the literal moves'. */
  cost: number;
  /** The legacy ast-bytes-v1 price (integer), for comparison and telemetry. */
  astBytes: number;
  parts: { structure: number; names: number; literals: number; moveFlags: number };
  /** Calls of API mutator constructors on literal arguments, as the trusted prelude built them. */
  literalMoves: WireCall[];
  /** For each literal move: its bits coded as an ordinary call (flag false + fields), if the host rejects it. */
  literalMoveFallbackBits: number[];
}

export interface ActResult {
  /** The exact ASCII string the guest's `__encode_calls` produced (≤ 64 KiB), UNPARSED and UNTRUSTED. */
  calls: string;
  /** The act drew from the seeded generator (or from entropy past the proxies). */
  usedRandom: boolean;
  /** Deterministic steps used (Python: LINE + JUMP events in the player's code; JS: interrupt ticks, 10,000 granularity). */
  steps: number;
}

export type RuntimeErrorCode = "CONFIG" | "COMPILE" | "DOMAIN" | "EXECUTION" | "LIMIT" | "CAPACITY" | "UNAVAILABLE";
export class RuntimeError extends Error { readonly code: RuntimeErrorCode; constructor(code: RuntimeErrorCode, message: string); }
export interface RuntimeOptions {
  language: Language; workers?: number; queueLimit?: number;
  deadlineMs?: number; startupMs?: number; python?: string;
}

export const GRAMMAR_IDS: Readonly<Record<Language, "python-agent-v1" | "typescript-agent-v1">>;
export const COMPLEXITY_IDS: Readonly<{ python: "ast-bits-v1"; typescript: "ts-ast-bits-v1-uniform" }>;
/** -log2(1/8): the flag bits of a literal move, before log2(#available) + D(fields). */
export const MOVE_FLAG_BITS: 3;
export const STEP_BUDGET_DEFAULT: 500000;
export const STEP_BUDGET_MAX: 10000000;
export const WIRE_MAX_LENGTH: 1024;
export const PRELUDE_PART_MAX_BYTES: 65536;
/** Maximum length of the encoded call list an act returns. */
export const CALLS_MAX_BYTES: 65536;

export class GameRuntime {
  constructor(options: RuntimeOptions);
  readonly language: Language;
  readonly grammarId: "python-agent-v1" | "typescript-agent-v1";
  /**
   * Parse, shape-check and (TS) type-check against `prelude.dts`, without evaluating the player's source;
   * price it with the language's code. Summon price =
   *   cost + Σ_i (valid_i ? MOVE_FLAG_BITS + log2(#available mutators) + D(literalMoves[i]) : literalMoveFallbackBits[i]).
   */
  inspect(source: string, settings: ActSettings): Promise<Inspection>;
  /**
   * One act in a fresh, deterministic guest: prelude + `__decode(input)` (trusted, outside the budget), then
   * the player's module, `agent(obj)` and `__encode_calls(result)` (inside the budget). The virtual clock
   * starts at 2026-01-01T00:00:00Z and `random` / `Math.random` are seeded with `seed`
   * (a 64-bit decimal or 0x-hex string): the same (source, input, settings, seed) gives the same result.
   */
  act(source: string, input: WireValue, settings: ActSettings, seed: string): Promise<ActResult>;
  /** inspect + one act per sample (1–32 samples, one seed each, fresh guest each); rejects on the first failure. */
  validate(source: string, samples: WireValue[], settings: ActSettings, seeds: string[]): Promise<{ inspection: Inspection; acts: ActResult[] }>;
  close(): void;
}
export function createRuntime(options: RuntimeOptions): GameRuntime;
