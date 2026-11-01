"use node";
/** The Node half of setups.save (convex/setups.ts): a setup's settings are complete, valid, offered and within limits. */
import { v } from "convex/values";
import type { GameSettings } from "@workspace/game-core";
import { internalAction } from "../_generated/server";
import { calibrationManifest } from "../engine/calibration";
import { assertCompleteSettings } from "../engine/node";

export const check = internalAction({
  args: { settings: v.any() },
  handler: async (ctx, { settings }): Promise<GameSettings> => assertCompleteSettings(await calibrationManifest(ctx), settings),
});
