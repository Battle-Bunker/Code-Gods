/**
 * The rule gallery's read: one family's dealable rules in a preset, each with its card, layers and ladder, every rung
 * with its ✨ rarity from the bundled artefacts (what a dealt player sees in `play:myRule`, before any deal). The
 * artefacts are large, so this module is the gallery's alone; a pane subscribes per family it shows.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireUser } from "./access";
import { dealablePool, ruleView } from "./deal";
import { presetOf, PRESETS } from "./presets";

const rungV = v.object({ level: v.number(), label: v.string(), rarityBits: v.number(), layer: v.optional(v.string()) });

export const family = query({
  args: { preset: v.string(), family: v.string() },
  returns: v.array(v.object({
    ruleKey: v.string(), tieBreaker: v.union(v.string(), v.null()), title: v.string(), card: v.string(), primary: v.string(),
    layers: v.array(v.string()), ladder: v.array(rungV),
  })),
  handler: async (ctx, a) => {
    await requireUser(ctx);
    const p = PRESETS.find(x => x.id === a.preset);
    if (!p) return [];
    return dealablePool(presetOf(p.id)).filter(r => r.family === a.family).map(r => {
      const view = ruleView(r);
      return { ruleKey: r.ruleKey, tieBreaker: r.tieBreaker, title: view.title, card: view.card, primary: view.primary, layers: view.layers, ladder: view.ladder };
    });
  },
});
