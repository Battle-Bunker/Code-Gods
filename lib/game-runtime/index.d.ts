export type Language = "python" | "typescript";
/** An object's wire value: a safe integer, or an ASCII string of at most `wireMaxLength` chars. */
export type WireValue = number | string;

/** Trusted guest source for one instantiation (lib/game-types `PreludeParts`, with `key = hash`). */
export interface RuntimePrelude {
  /** Identity of the prelude (the PreludeParts sha256); 1–128 printable ASCII chars. Part of every cache key. */
  key: string;
  /** Each part: NUL-free UTF-8, at most 65536 bytes. */
  python: string;
  js: string;
  dts: string;
}

/** Room settings this package reads; extra fields (a full GameSettings) are ignored. */
export interface ActSettings {
  /** Type name, for cache keys only (/^[A-Za-z][A-Za-z0-9_]{0,63}$/). The runtime knows no type. */
  objectType: string;
  /** Maximum wire string length, 0–1024 (0 for numeric types). */
  wireMaxLength: number;
  /** Guest CPU budget, 1–1000 ms, default 5. Cooperative checks plus hard wall backstop. */
  interactionComputeMs?: number;
  prelude: RuntimePrelude;
}

export type RuntimeErrorCode = "CONFIG" | "COMPILE" | "DOMAIN" | "EXECUTION" | "LIMIT" | "CAPACITY" | "UNAVAILABLE";
export class RuntimeError extends Error { readonly code: RuntimeErrorCode; constructor(code: RuntimeErrorCode, message: string); }
export interface RuntimeOptions {
  language: Language; workers?: number; queueLimit?: number;
  deadlineMs?: number; startupMs?: number; python?: string;
}

export const GRAMMAR_IDS: Readonly<Record<Language, "python-agent-v1" | "typescript-agent-v1">>;
export const WIRE_MAX_LENGTH: 1024;
export const PRELUDE_PART_MAX_BYTES: 65536;
/** Maximum length of the encoded call list an act returns. */
export const CALLS_MAX_BYTES: 65536;

export class GameRuntime {
  constructor(options: RuntimeOptions);
  readonly language: Language;
  readonly grammarId: "python-agent-v1" | "typescript-agent-v1";
  /** Parse, shape-check and (TS) type-check against `prelude.dts`, without evaluating. ast-bytes-v1 price of the user source only. */
  inspect(source: string, settings: ActSettings): Promise<{ cost: number }>;
  /**
   * One act in a fresh guest: prelude + `__decode(input)` (trusted, outside the budget), then the
   * user's module, `agent(obj)` and `__encode_calls(result)` (inside the budget). `calls` is the exact
   * ASCII string the guest encoder produced (≤ 64 KiB), UNPARSED and UNTRUSTED: the host must parse
   * it as MutatorCallWire[] and validate every call.
   */
  act(source: string, input: WireValue, settings: ActSettings): Promise<{ calls: string }>;
  /** inspect + one act per sample (1–32 samples, fresh guest each); rejects on the first failure. */
  validate(source: string, samples: WireValue[], settings: ActSettings): Promise<{ cost: number; outputs: string[] }>;
  close(): void;
}
export function createRuntime(options: RuntimeOptions): GameRuntime;
