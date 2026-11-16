/**
 * The rule gallery's read: one family's dealable rules in a preset, each with its card and layers, what a dealt player
 * can read before any deal. `points` is empty: rules are scored by energy (decision 50) and have no value curve.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireUser } from "./access";
import { dealablePool, ruleView } from "./deal";
import { presetOf, PRESETS } from "./presets";

const pointV = v.object({ score: v.union(v.array(v.union(v.string(), v.null())), v.null()), bits: v.number() });

export const family = query({
  args: { preset: v.string(), family: v.string() },
  returns: v.array(v.object({
    ruleKey: v.string(), tieBreaker: v.union(v.string(), v.null()), title: v.string(), card: v.string(), primary: v.string(),
    layers: v.array(v.string()), points: v.array(pointV),
  })),
  handler: async (ctx, a) => {
    await requireUser(ctx);
    const p = PRESETS.find(x => x.id === a.preset);
    if (!p) return [];
    return dealablePool(presetOf(p.id)).filter(r => r.family === a.family).map(r => {
      const view = ruleView(r);
      return { ruleKey: r.ruleKey, tieBreaker: r.tieBreaker, title: view.title, card: view.card, primary: view.primary, layers: view.layers, points: [] };
    });
  },
});
