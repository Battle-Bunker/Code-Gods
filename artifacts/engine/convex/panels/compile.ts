"use node";
/** The compiler as an internal Node action (TypeScript is an external package of the Node runtime). */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { compilePanel, type CompileResult } from "./compiler";

export const compile = internalAction({
  args: { source: v.string() },
  handler: async (_ctx, { source }): Promise<CompileResult> => compilePanel(source),
});
