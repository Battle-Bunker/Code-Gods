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
   * CPU backstop, 1–1000 ms, default 5 (not deterministic; see the README's Determinism section). Open
   * agents should run with a generous value (e.g. 1000) so that the deterministic step budget binds.
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
/**
 * Where the Python runtime bundle comes from (dist/python-runtime.bin.gz, gzip or raw): its bytes, a
 * file path, or an async loader (e.g. a fetch from Convex file storage). Loaded once per process per
 * source, checked against PYTHON_BUNDLE_SHA256, compiled once and shared by every worker.
 */
export type PythonAssets = Uint8Array | ArrayBuffer | string | (() => Promise<Uint8Array | ArrayBuffer>);
export interface RuntimeOptions {
  language: Language;
  /** Engines (worker_threads), 1–16, started lazily on concurrent demand (or by `warm`). Default 1. */
  workers?: number;
  /** Waiting requests beyond the busy workers, 1–1024 (default 32); more is CAPACITY. */
  queueLimit?: number;
  /** Execution hard wall cap, ms (default 4000). The wall is min(deadlineMs, max(50, 10 × interactionComputeMs)). */
  deadlineMs?: number;
  /** Worker startup and queue-wait bound, ms (default 30000). */
  startupMs?: number;
  /** Hard wall for trusted preparation (compile, inspect, prelude, decode), ms. Default: Python 3000, TypeScript startupMs. */
  prepareMs?: number;
  /**
   * "worker" (default): each engine in a worker_thread; a hard wall terminates a worker stuck past its
   * deadline (e.g. inside one long native step). "inline": one engine on the calling thread, requests one
   * at a time, no hard wall (the deterministic step budget and the post-execution CPU check still apply).
   */
  execution?: "worker" | "inline";
  /** Python only. Default: dist/python-runtime.bin.gz in this package (absent when the package is bundled). */
  assets?: PythonAssets;
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

/** SHA-256 of the uncompressed Python runtime bundle this package accepts. */
export const PYTHON_BUNDLE_SHA256: string;
/** File name of the built bundle (in dist/; the object stored in Convex file storage). */
export const PYTHON_BUNDLE_FILE: "python-runtime.bin.gz";
/** Absolute files of `typescript` and `quickjs-emscripten` that TypeScript workers load (ESM resolution). */
export function typescriptPaths(): { typescript: string; quickjs: string };
/** Loads, verifies and compiles the Python bundle once per `assets` source (what workers share). */
export function loadPythonRuntime(assets?: PythonAssets): Promise<unknown>;

export class GameRuntime {
  constructor(options: RuntimeOptions);
  readonly language: Language;
  readonly execution: "worker" | "inline";
  /** Engine count (1 when inline). */
  readonly workers: number;
  /** Starts up to `count` engines (default: all) ahead of demand and resolves when they are ready. */
  warm(count?: number): Promise<void>;
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
