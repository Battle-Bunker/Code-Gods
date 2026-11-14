/**
 * The setup picker's read: the presets this deployment plays (presets.ts), so the app never bundles its own copy;
 * `room.create` and `room.settings` refuse any other id. A preset that cannot deal yet (no value functions) is withheld.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireUser } from "./access";
import { PRESETS } from "./presets";
import { playable } from "./deal";

const presetRowV = v.object({
  id: v.string(), title: v.string(), variant: v.string(), families: v.array(v.string()), minPlayers: v.number(),
  planningSeconds: v.number(), worldSeconds: v.number(), startingEnergy: v.number(), startingObjects: v.number(),
  bid: v.union(v.object({ pricing: v.union(v.literal("first"), v.literal("second")), disclosure: v.union(v.literal("none"), v.literal("handicaps"), v.literal("all")), seconds: v.number() }), v.null()),
});

export const presets = query({
  args: {},
  returns: v.array(presetRowV),
  handler: async ctx => {
    await requireUser(ctx);
    return PRESETS.filter(playable).map(p => ({
      id: p.id, title: p.title, variant: p.variant, families: [...p.families], minPlayers: p.minPlayers, planningSeconds: p.planningSeconds,
      worldSeconds: p.worldSeconds, startingEnergy: p.startingEnergy, startingObjects: p.startingObjects, bid: p.bid ?? null,
    }));
  },
});
