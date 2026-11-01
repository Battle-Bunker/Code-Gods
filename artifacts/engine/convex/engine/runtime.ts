"use node";
/**
 * The ONE place the engine reaches agent sandboxes: the in-process runtime of convex/runtime/node.ts
 * (QuickJS for TypeScript, CPython-WASI on Node's WebAssembly for Python), whose warm workers live at
 * module scope and are reused across tick actions and summon examinations. Every action that can run
 * agent code calls `bindRuntime(ctx)` first, so the Python bundle can load from file storage.
 */
import { LANGUAGE_SPECS, codecOf, defaultSettingsFor, instantiationOf, validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { objectType, withCommitClause } from "@workspace/game-types";
import type { ActResult, ActSettings, GameRuntime, Inspection, Language, PricingVocab } from "@workspace/game-runtime";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { RETRY_AFTER_MS, notReadyMessage } from "../lib/sandboxes";
import { RUNTIME_ASSETS, runtimeFor, runtimeVersion } from "../runtime/node";
import type { LanguageSandbox } from "../runtime/readiness";
export { bindRuntime, runtimeVersion } from "../runtime/node";

/** Acts in flight per tick wave (the runtime pools queue beyond their worker count). */
export const WORKERS = 4;
const unavailable = new Map<Language, string>();
const pool = async (language: Language): Promise<GameRuntime> => runtimeFor(language);

/** Runtime failures caused by the agent's own code; CONFIG is a server bug, CAPACITY/UNAVAILABLE are the host's. */
export const AGENT_FAULTS: ReadonlySet<string> = new Set(["COMPILE", "DOMAIN", "EXECUTION", "LIMIT"]);
export const isAgentFault = (error: unknown) =>
  !!error && typeof error === "object" && AGENT_FAULTS.has(String((error as { code?: unknown }).code));

const actSettingsCache = new Map<string, ActSettings>();
/**
 * The runtime's view of a room for one language: the instantiation's prelude and wire bound, never the full settings.
 * Only a Haskell runtime gets the Haskell Room module (built on first use; the others never read it).
 */
export function actSettings(settings: GameSettings, language: Language): ActSettings {
  const inst = instantiationOf(settings), haskell = language === "haskell";
  const key = `${inst.key}\0${settings.interactionComputeMs}\0${settings.stepBudget}\0${settings.commitClause}\0${haskell}`;
  let cached = actSettingsCache.get(key);
  if (!cached) {
    const base = objectType(inst.objectType).prelude(inst), parts = settings.commitClause ? withCommitClause(base) : base;
    cached = Object.freeze({
      objectType: inst.objectType, wireMaxLength: codecOf(settings).maxLength,
      interactionComputeMs: settings.interactionComputeMs, stepBudget: settings.stepBudget,
      prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts, ...(haskell ? { haskell: parts.haskell } : {}),
        pricing: parts.pricing as unknown as { python: PricingVocab; typescript: PricingVocab } },
    }) as ActSettings;
    if (actSettingsCache.size >= 64) actSettingsCache.delete(actSettingsCache.keys().next().value!);
    actSettingsCache.set(key, cached);
  }
  return cached;
}

async function guarded<T>(language: Language, run: (rt: GameRuntime) => Promise<T>): Promise<T> {
  const rt = await pool(language);
  try { return await run(rt); }
  catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "CONFIG") {
      console.error("Runtime configuration error (server bug)", (error as Error).message);
      throw Object.assign(new Error("The game runtime is misconfigured"), { code: "RUNTIME_CONFIG" });
    }
    if (code === "UNAVAILABLE") unavailable.set(language, (error as Error).message);
    throw error;
  }
}

/**
 * The source's description bits and literal moves, in the agent's own language (one the game allows: the caller
 * checks that). Never evaluates.
 */
export function inspect(source: string, language: Language, settings: GameSettings): Promise<Inspection> {
  validateSettings(settings);
  return guarded(language, rt => rt.inspect(source, actSettings(settings, language)));
}
/** One deterministic act (frozen clock, `random` seeded with `seed`) of an agent in `language`: the UNTRUSTED encoded call list. */
export function act(source: string, language: Language, input: ObjectValue, settings: GameSettings, seed: bigint): Promise<ActResult> {
  return guarded(language, rt => rt.act(source, input as string | number, actSettings(settings, language), seed.toString()));
}

/**
 * Boot a language's sandbox on this instance and prove it: an empty agent must round-trip on a default instantiation.
 * A success is remembered for the instance's life; a failure reports why and is retried by the next call.
 */
const probes = new Map<Language, Promise<{ ok: true } | { ok: false; reason: string }>>();
export function probeLanguage(language: Language): Promise<{ ok: true } | { ok: false; reason: string }> {
  let p = probes.get(language);
  if (!p) {
    p = (async () => {
      try {
        const settings = defaultSettingsFor("Int", [language]);
        const inst = instantiationOf(settings), T = objectType(inst.objectType);
        const { seededRng } = await import("@workspace/game-types");
        const value = T.codec(inst).encode(T.spawn(inst, seededRng(`code-gods:probe:${inst.key}`)));
        const result = await act(LANGUAGE_SPECS[language].emptyAgent, language, value, settings, 0n);
        if (result.calls !== "[]") throw new Error(`the probe agent returned ${result.calls.slice(0, 100)}`);
        return { ok: true as const };
      } catch (error) {
        console.warn(`Isolated ${language} runtime unavailable: ${(error as Error).message}`);
        probes.delete(language);
        return { ok: false as const, reason: (error as Error).message.slice(0, 500) };
      }
    })();
    probes.set(language, p);
  }
  return p;
}

/**
 * Each language's sandbox readiness for this code, scheduling the warm-ups that are due (runtime/readiness.ts ensure;
 * one mutation, no writes when all are ready). `keepWarm`: a proactive caller, which also refreshes a ready runtime
 * so a Node instance stays warm. Never boots anything itself: no caller waits on a sandbox.
 */
export async function ensureSandboxes(ctx: ActionCtx, languages: readonly Language[], keepWarm = false): Promise<LanguageSandbox[]> {
  const unique = [...new Set(languages)];
  if (!keepWarm) {
    // The common case (validate, summon, run_code): every language already booted at this version; a query says so.
    const found = await ctx.runQuery(internal.runtime.readiness.rows, { languages: unique });
    if (found.every(({ row }) => row?.state === "ready" && row.version === runtimeVersion(row.language))) {
      return found.map(({ language, row }) => ({ language, state: "ready" as const, ...(row!.readyAt !== undefined ? { readyAt: row!.readyAt } : {}) }));
    }
  }
  return ctx.runMutation(internal.runtime.readiness.ensure, {
    runtimes: unique.map(language => ({ language, version: runtimeVersion(language), ...(RUNTIME_ASSETS[language] ? { asset: RUNTIME_ASSETS[language]!.name } : {}) })),
    ...(keepWarm ? { keepWarm } : {}),
  });
}

/** The typed "not ready yet" answer of a function that needs a warm sandbox (validate, summon, run_code). */
export type NotReady = { language: Language; state: "warming" | "failed"; reason?: string; retryAfterMs: number; message: string };
/** null when `language`'s sandbox is ready; else why not (and a warm-up is scheduled if one is due). */
export async function sandboxGate(ctx: ActionCtx, language: Language): Promise<NotReady | null> {
  const [view] = await ensureSandboxes(ctx, [language]);
  if (view.state === "ready") return null;
  return { language, state: view.state, ...(view.reason ? { reason: view.reason } : {}), retryAfterMs: RETRY_AFTER_MS,
    message: notReadyMessage(LANGUAGE_SPECS[language].label, view) };
}
