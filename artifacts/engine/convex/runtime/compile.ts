"use node";
/**
 * Agent compilation (TypeScript and Haskell), in an action of its own. A compiler holds a lot of memory while it runs
 * (TypeScript's about 140 MiB once it has type-checked, MicroHs's about 250 MiB), which a 512 MiB Node action cannot
 * hold beside the agent pools. Node actions run one at a time per instance, so the actions that act or examine agents
 * (engine/runtime.ts program) call this one, which runs on another instance, frees that instance's idle agent pools,
 * compiles, and stores the outcome for every action (runtime/programs.ts): the program, or the agent's own compile
 * failure (COMPILE, LIMIT).
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { compilationKey, type Compiled } from "@workspace/game-runtime";
import { actSettings } from "../engine/runtime";
import { bindHaskell, compilePool } from "./node";

export type CompileReply = ({ ok: true } & Compiled) | { ok: false; code: string; message: string };
/** The agent's own compile failures; any other is the host's (never stored, never blamed on the player). */
const AGENT_CODES = new Set(["COMPILE", "LIMIT"]);

export const compile = internalAction({
  args: { language: v.union(v.literal("typescript"), v.literal("haskell")), source: v.string(), settings: v.any() },
  handler: async (ctx, { language, source, settings }): Promise<CompileReply> => {
    const room = actSettings(settings, language), key = compilationKey(language, source, room);
    const stored = await ctx.runQuery(internal.runtime.programs.get, { key });
    if (stored?.error) return { ok: false, ...stored.error };
    if (stored) return { ok: true, inspection: stored.inspection, js: stored.js };
    if (language === "haskell") await bindHaskell(ctx);
    let compiled: Compiled;
    try { compiled = await compilePool(language).compile(source, room); }
    catch (error) {
      const code = String((error as { code?: unknown }).code ?? ""), message = String((error as Error)?.message ?? error).slice(0, 4000);
      if (!AGENT_CODES.has(code)) return { ok: false, code: code === "CAPACITY" || code === "CONFIG" ? code : "UNAVAILABLE", message };
      await ctx.runMutation(internal.runtime.programs.put, { key, language, js: "", inspection: null, error: { code, message } });
      return { ok: false, code, message };
    }
    await ctx.runMutation(internal.runtime.programs.put, { key, language, js: compiled.js, inspection: compiled.inspection });
    return { ok: true, inspection: compiled.inspection, js: compiled.js };
  },
});
