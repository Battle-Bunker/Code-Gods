import type { GameSettings, ObjectValue } from "@workspace/game-core";

// Explicit injection boundary for the independently developed packages.
export interface RuntimeAdapter {
  languages: string[];
  inspect(source: string, settings: GameSettings): Promise<{ cost: number }>;
  execute(source: string, input: ObjectValue, settings: GameSettings): Promise<ObjectValue>;
}
export interface ValuesAdapter {
  generate(settings: GameSettings, count: number, seed: string): { source: string; descriptor: unknown }[];
  evaluate(descriptor: unknown, value: ObjectValue): number;
}
export let runtime: RuntimeAdapter | undefined;
export let values: ValuesAdapter | undefined;
export function registerAdapters(next: { runtime: RuntimeAdapter; values: ValuesAdapter }) {
  runtime = next.runtime;
  values = next.values;
}
export function requireAdapters() {
  if (!runtime || !values) throw Object.assign(
    new Error("Game execution is unavailable until isolated runtime and value generator integration is complete"),
    { status: 503, code: "RUNNER_UNAVAILABLE" },
  );
  return { runtime, values };
}
