/**
 * What the Line Rules Mirror lists (rules-mirror.tsx): every rule family of the line, split into those the beginner
 * line preset deals and those it does not, each with its dealable parameter sets and its secondary-preference variants.
 * "Dealt" is the dealer's own test (artifacts/engine/convex/v2/deal.ts buildPool): the preset's pool rule has shipped
 * starters and a value function under its rule key. test/rules-mirror-pool.test.ts holds this list to the dealer's.
 * Pure: the caller says which rule keys have a value function.
 */
import { joinTieBreakers, type ObjectType, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { hasStarters } from "@workspace/v2-agents/pure";
import { lineQ, lineType, preset, type LineState } from "@workspace/v2-linear";
import { ruleKey } from "@workspace/v2-valuation";

export const MIRROR_PRESET = "lines-beginner";
export type LineFamily = RuleFamily<LineState, any>;

export interface MirrorVariant {
  /** The tie-breaker as dealt: one layer id, or several joined by ">" (a tree-shaped rule's chain). */
  readonly tieBreaker: TieBreaker;
  /** The layers after the main part, in order, by their titles. */
  readonly layers: readonly string[];
  readonly ruleKey: string;
  /** The beginner line preset deals exactly this rule. */
  readonly dealt: boolean;
  /** It has a value function (bits can be shown). */
  readonly valued: boolean;
}
export interface MirrorParams { readonly params: unknown; readonly label: string; readonly variants: readonly MirrorVariant[] }
export interface MirrorFamily {
  readonly family: LineFamily;
  readonly dealt: boolean;
  /** A tuple family valued down its tree (RuleFamily.valuation). */
  readonly tree: boolean;
  readonly params: readonly MirrorParams[];
}
export interface MirrorCatalogue {
  readonly preset: { id: string; title: string; variant: string };
  readonly dealt: readonly MirrorFamily[];
  readonly undealt: readonly MirrorFamily[];
  /** How many rules (family × parameters × secondary) the preset deals. */
  readonly dealtRules: number;
}

export const paramsLabel = (params: unknown): string =>
  Object.entries((params ?? {}) as object).map(([k, v]) => `${k} = ${String(v)}`).join(", ") || "no parameters";

/** The secondary variants a family can be shown with: each tie-breaker alone; for a tree family its chains, longest first. */
function variantIds(f: LineFamily, tree: boolean): TieBreaker[] {
  const ids = f.tieBreakers.map(t => t.id);
  if (!ids.length) return [null];
  if (!tree) return ids;
  return ids.map((_, i) => joinTieBreakers(ids.slice(0, ids.length - i)));
}

export function mirrorCatalogue(valued: (ruleKey: string) => boolean): MirrorCatalogue {
  const p = preset(MIRROR_PRESET);
  const variant = lineType.variants.find(v => v.id === p.variant);
  if (!variant || variant !== lineQ) throw new Error(`${MIRROR_PRESET} is expected on line-q, not ${p.variant}`);
  const type = lineType as unknown as ObjectType<unknown>;
  const keyOf = (f: LineFamily, params: unknown, tb: TieBreaker) => ruleKey(type, variant, f.id, params, tb ?? "none");
  // The dealer's test, rule by rule.
  const dealtKeys = new Set<string>();
  for (const r of p.rules) {
    const f = lineType.families.find(x => x.id === r.family);
    if (!f || !hasStarters(r.family)) continue;
    for (const tb of r.tieBreakers) { const k = keyOf(f, r.params, tb); if (valued(k)) dealtKeys.add(k); }
  }
  const all: MirrorFamily[] = lineType.families.map(f => {
    const tree = f.valuation === "tree";
    const params = (f.dealable(variant) as unknown[]).map(ps => ({
      params: ps, label: paramsLabel(ps),
      variants: variantIds(f, tree).map(tb => {
        const key = keyOf(f, ps, tb);
        const layers = (tb === null ? [] : tb.split(">")).map(id => f.tieBreakers.find(t => t.id === id)!.title);
        return { tieBreaker: tb, layers, ruleKey: key, dealt: dealtKeys.has(key), valued: valued(key) };
      }),
    }));
    return { family: f, tree, params, dealt: params.some(x => x.variants.some(v => v.dealt)) };
  });
  return {
    preset: { id: p.id, title: p.title, variant: p.variant },
    dealt: all.filter(f => f.dealt), undealt: all.filter(f => !f.dealt), dealtRules: dealtKeys.size,
  };
}
