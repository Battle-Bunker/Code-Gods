/**
 * The grid's presets (integration plan §5.7) on the beginner board. Every grid setup deals the dynamic grid rules
 * (dynamic-families.ts; owner decision 50): one family and one parameter set per seat, no tie-breakers.
 */
import type { RuleFamily } from "@workspace/v2-core";
import { grid4 } from "./type.ts";
import { dynamicGridFamilies } from "./dynamic-families.ts";

export interface GridPoolRule { readonly family: string; readonly params: unknown; readonly tieBreakers: readonly (string | null)[] }

const rules: readonly GridPoolRule[] = (dynamicGridFamilies as readonly RuleFamily<unknown, unknown>[]).flatMap(f =>
  f.dealable(grid4).map(params => ({ family: f.id, params, tieBreakers: [null] })));

export const gridPresets = [
  { id: "grids-beginner", title: "Grids · beginner", variant: grid4.id, rules },
  { id: "grids-more-rules", title: "Grids · more rules", variant: grid4.id, rules },
] as const;
