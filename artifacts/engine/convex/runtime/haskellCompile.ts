"use node";
/**
 * Haskell compilation, in an action of its own. MicroHs's compiler holds about 250 MiB while it runs (its heap and V8's
 * optimised code), which a 512 MiB Node action cannot hold beside the agent pools. Node actions run one at a time per
 * instance, so the actions that act or examine Haskell agents (engine/runtime.ts haskellProgram) call this one, which
 * runs on another instance, frees that instance's idle agent pools, compiles, and stores the outcome for every action:
 * the program, or the agent's own compile failure (COMPILE, LIMIT).
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { Compiled } from "@workspace/game-runtime";
import { actSettings } from "../engine/runtime";
import { bindHaskell, haskellCompilePool, haskellKey } from "./node";

export type CompileReply = ({ ok: true } & Compiled) | { ok: false; code: string; message: string };
/** The agent's own compile failures; any other is the host's (never stored, never blamed on the player). */
const AGENT_CODES = new Set(["COMPILE", "LIMIT"]);

export const compile = internalAction({
  args: { source: v.string(), settings: v.any() },
  handler: async (ctx, { source, settings }): Promise<CompileReply> => {
    const room = actSettings(settings, "haskell"), key = haskellKey(source, room);
    const stored = await ctx.runQuery(internal.runtime.haskellPrograms.get, { key });
    if (stored?.error) return { ok: false, ...stored.error };
    if (stored) return { ok: true, inspection: stored.inspection, js: stored.js };
    await bindHaskell(ctx);
    let compiled: Compiled;
    try { compiled = await haskellCompilePool().compile(source, room); }
    catch (error) {
      const code = String((error as { code?: unknown }).code ?? ""), message = String((error as Error)?.message ?? error).slice(0, 4000);
      if (!AGENT_CODES.has(code)) return { ok: false, code: code === "CAPACITY" || code === "CONFIG" ? code : "UNAVAILABLE", message };
      await ctx.runMutation(internal.runtime.haskellPrograms.put, { key, js: "", inspection: null, error: { code, message } });
      return { ok: false, code, message };
    }
    await ctx.runMutation(internal.runtime.haskellPrograms.put, { key, js: compiled.js, inspection: compiled.inspection });
    return { ok: true, inspection: compiled.inspection, js: compiled.js };
  },
});
