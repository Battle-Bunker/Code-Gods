import type { GridOrdinalFamily } from "./types.ts";
import { FAMILIES as seeds } from "./seeds.ts";
import { FAMILIES as strategy } from "./strategy.ts";
import { FAMILIES as geometry } from "./geometry.ts";
import { FAMILIES as arithmetic } from "./arithmetic.ts";
import { FAMILIES as colour } from "./colour.ts";
import { FAMILIES as games } from "./games.ts";
import { FAMILIES as penalties } from "./penalties.ts";

export type { GridOrdinalFamily } from "./types.ts";

export const GRID_ORDINALS: ReadonlyMap<string, GridOrdinalFamily> = new Map(
  [...seeds, ...strategy, ...geometry, ...arithmetic, ...colour, ...games, ...penalties].map(f => [f.id, f]));

/** The ordinal port for a family; defence variants ("base+penalty") use their base family's reward ordinal. */
export function gridOrdinal(id: string): GridOrdinalFamily {
  const f = GRID_ORDINALS.get(id) ?? GRID_ORDINALS.get(id.split("+")[0]);
  if (!f) throw new Error(`No Grid ordinal port for ${id}`);
  return f;
}
