"use node";
/**
 * Agent sandboxes for v2's Node actions (integration plan §4.3): one inline sandbox per language at module scope, so
 * a warm instance keeps QuickJS and the initialised CPython across actions. The pinned CPython bundle comes from the
 * shared runtime assets in file storage (uploaded by scripts/upload-runtime.mjs, verified by its SHA-256 pin).
 *
 * Inline, not in a worker thread: a Convex bundle carries no worker entry file. QuickJS still ends an act at its time
 * cap; Python checks the clock every 10,000 steps, so a single long native step (a catastrophic regex) runs until the
 * action's own limit. Recorded as an M1 risk: the hard wall returns with a bundled worker.
 */
import { createSandbox, provideModules, PYTHON_BUNDLE_SHA256, type Language, type Sandbox } from "@workspace/v2-sandbox";
import { getQuickJS } from "quickjs-emscripten";
import * as typescript from "typescript";
import { makeFunctionReference } from "convex/server";
import type { ActionCtx } from "../_generated/server";

// Imported here, in the engine's own module, so the bundler keeps both as installed packages (convex.json
// externalPackages); imported from inside a workspace package they would be inlined, and QuickJS would lose its .wasm.
provideModules({ getQuickJS, typescript: ((typescript as { default?: typeof typescript }).default ?? typescript) as typeof typescript });

const PYTHON_BUNDLE = "python-runtime.bin.gz";
/** The shared runtime assets (convex/runtime/assets.ts), by path: v2 imports no v1 module. */
const LOOKUP = makeFunctionReference<"query", { name: string }, { sha256: string; storageId: string } | null>("runtime/assets:lookup");

let pythonBytes: Promise<Uint8Array> | null = null;
async function pythonBundle(ctx: ActionCtx): Promise<Uint8Array> {
  pythonBytes ??= (async () => {
    const row = await ctx.runQuery(LOOKUP, { name: PYTHON_BUNDLE });
    if (!row) throw new Error("The Python runtime bundle is not uploaded: run pnpm --filter @workspace/engine upload-runtime");
    if (row.sha256 !== PYTHON_BUNDLE_SHA256) throw new Error(`The stored Python bundle (${row.sha256}) is not the pinned one`);
    const blob = await ctx.storage.get(row.storageId as never);
    if (!blob) throw new Error("The Python runtime bundle is missing from file storage");
    return new Uint8Array(await blob.arrayBuffer());
  })();
  pythonBytes.catch(() => { pythonBytes = null; });
  return pythonBytes;
}

const made = new Map<Language, Promise<Sandbox>>();
/** The warm sandbox for a language on this instance. */
export async function sandboxFor(ctx: ActionCtx, language: Language): Promise<Sandbox> {
  let s = made.get(language);
  if (!s) {
    s = language === "python"
      ? pythonBundle(ctx).then(bytes => createSandbox({ language, execution: "inline", pythonBundle: bytes }))
      : createSandbox({ language, execution: "inline" });
    s.catch(() => made.delete(language));
    made.set(language, s);
  }
  return s;
}
