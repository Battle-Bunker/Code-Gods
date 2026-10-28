export type Language = "python" | "typescript";
/** Int: a number. string: an ASCII string. Grid: the canonical grid string in, the JSON call list out. */
export type ObjectValue = number | string;
export interface ScalarDomainSettings {
  objectType: "Int" | "string";
  intMin: number;
  intMax: number;
  stringMaxLength: number;
  /** Guest CPU budget, 1–1000 ms, default 5. Cooperative checks plus hard wall backstop. */
  interactionComputeMs?: number;
}
export type GridSymbols = "base10" | "base12" | "base16" | "cards";
export type GridColours = "rgb" | "rgby" | "rainbow6";
/**
 * The Grid object type: GridType Grid(gridSize, gridSymbols, gridColours). An agent maps a
 * read-only grid to at most 8 mutator calls. Input: the grid's canonical ASCII string (validated
 * strictly). Output: an ASCII JSON string of at most 8192 bytes, `[{"m": id, "p": params}]`, which
 * the host must still validate against Grid Lab's parameter space before pricing and applying it.
 * intMin, intMax and stringMaxLength are ignored for Grid.
 */
export interface GridDomainSettings {
  objectType: "Grid";
  gridSize: 3 | 4 | 5 | 6 | 7;
  gridSymbols: GridSymbols;
  gridColours: GridColours;
  /** Guest CPU budget, 1–1000 ms, default 5. Python Grid agents usually need 20 or more. */
  interactionComputeMs?: number;
  intMin?: number;
  intMax?: number;
  stringMaxLength?: number;
}
export type DomainSettings = ScalarDomainSettings | GridDomainSettings;
/** One element of a Grid agent's output: a Grid Lab mutator id and its parameters. */
export interface GridMutatorCall { m: string; p: Record<string, unknown> }
export type RuntimeErrorCode = "CONFIG" | "COMPILE" | "DOMAIN" | "EXECUTION" | "LIMIT" | "CAPACITY" | "UNAVAILABLE";
export class RuntimeError extends Error { readonly code: RuntimeErrorCode; constructor(code: RuntimeErrorCode, message: string); }
export interface RuntimeOptions {
  language: Language; workers?: number; queueLimit?: number;
  deadlineMs?: number; startupMs?: number; python?: string;
}
export class GameRuntime {
  constructor(options: RuntimeOptions);
  inspect(source: string, settings: DomainSettings): Promise<{cost: number}>;
  execute(source: string, input: ObjectValue, settings: DomainSettings): Promise<{value: ObjectValue}>;
  /** 1–128 inputs, fresh guest per input; rejects the entire batch on any failure. */
  executeBatch(source: string, inputs: ObjectValue[], settings: DomainSettings): Promise<{values: ObjectValue[]}>;
  validate(source: string, samples: ObjectValue[], settings: DomainSettings): Promise<{cost: number; outputs: ObjectValue[]}>;
  close(): void;
}
export function createRuntime(options: RuntimeOptions): GameRuntime;
