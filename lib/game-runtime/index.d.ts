export type Language = "python" | "typescript";
export type ObjectValue = number | string;
export interface DomainSettings {
  objectType: "Int" | "string";
  intMin: number;
  intMax: number;
  stringMaxLength: number;
  /** Guest CPU budget, 1–1000 ms, default 5. Cooperative checks plus hard wall backstop. */
  interactionComputeMs?: number;
}
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
