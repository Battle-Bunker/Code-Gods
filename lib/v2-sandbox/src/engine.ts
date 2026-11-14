/** What an engine (Python, QuickJS) runs for one act, synchronously, on the thread it lives on. */
export interface ExecuteRequest {
  /** Python source, or JavaScript (TypeScript is compiled first, by trusted code). */
  source: string;
  /** The guest library for the language (guest/codegods.py or guest/codegods.js). */
  prelude: string;
  /** The offer, as JSON text, handed to the guest library's `__decode`. */
  offer: string;
  seed: bigint;
  stepBudget: number;
  wallMs: number;
}

export interface Hooks {
  /** The host channel: one request's JSON text in, the reply's JSON text out. */
  host(request: string): string;
  /** Called when trusted preparation is over and the agent's own code is about to run. */
  onExecute?(): void;
}

export interface ExecuteResult {
  /** What the guest library encoded from the agent's return value: "null" or a JSON list of calls. Untrusted. */
  calls: string;
  steps: number;
  usedRandom: boolean;
}

export interface Engine {
  execute(request: ExecuteRequest, hooks: Hooks): ExecuteResult;
}
