/**
 * The two native-ish packages the sandbox runs on: the TypeScript compiler (transpiling agents) and QuickJS (running
 * them). By default they are loaded from this package's dependencies. A bundled host passes its own copies with
 * `provideModules`: the engine's Convex Node actions import both from their own module, so the bundler keeps them as
 * installed packages (an inlined QuickJS cannot find its .wasm).
 */
import { createRequire } from "node:module";

type TS = typeof import("typescript");
type GetQuickJS = typeof import("quickjs-emscripten").getQuickJS;

let provided: { typescript?: TS; getQuickJS?: GetQuickJS } = {};

export function provideModules(modules: { typescript?: TS; getQuickJS?: GetQuickJS }): void {
  provided = { ...provided, ...modules };
}

let ts: TS | null = null;
export const typescriptModule = (): TS => provided.typescript ?? (ts ??= createRequire(import.meta.url)("typescript") as TS);

export async function quickjsModule(): Promise<GetQuickJS> {
  return provided.getQuickJS ?? (await import("quickjs-emscripten")).getQuickJS;
}
