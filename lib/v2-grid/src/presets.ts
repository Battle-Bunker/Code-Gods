/**
 * The grid's preset (integration plan §5.7): the beginner board and the beginner pool (the old beginner grid's eight
 * rules), every family with each of its tie-breakers. The deal refuses any rule whose artefact is not dealable, so the artefacts decide what is live.
 */
import { tieBreakersOn } from "@workspace/v2-core";
import { gridType, grid4 } from "./type.ts";
import { beginnerGridFamilies } from "./families.ts";
import { gridParams } from "./grid.ts";

const BEGINNER = new Set(beginnerGridFamilies(gridParams(grid4).size).map(f => f.id));

export interface GridPoolRule { readonly family: string; readonly params: unknown; readonly tieBreakers: readonly string[] }

export const gridPresets = [
  {
    id: "grids-beginner", title: "Grids · beginner", variant: grid4.id,
    rules: gridType.families.filter(f => BEGINNER.has(f.id)).flatMap(f => f.dealable(grid4).map(params => ({ family: f.id, params, tieBreakers: tieBreakersOn(f, grid4).map(t => t.id) }))) as readonly GridPoolRule[],
  },
] as const;
