/** Every ported grid-lab family, by lens (lib/grid-lab/gridlab/rules/__init__.py order: seeds, strategy, ...). */
import { ARITHMETIC } from "./arithmetic.ts";
import { COLOUR } from "./colour.ts";
import { PENALTIES } from "./defence.ts";
import { GAMES } from "./games.ts";
import { GEOMETRY } from "./geometry.ts";
import { SEEDS } from "./seeds.ts";
import { STRATEGY } from "./strategy.ts";

export const GRID_LENSES = {
  seeds: SEEDS, strategy: STRATEGY, geometry: GEOMETRY, arithmetic: ARITHMETIC, colour: COLOUR, games: GAMES,
  defence: PENALTIES,
} as const;
export const GRID_FAMILIES = [...SEEDS, ...STRATEGY, ...GEOMETRY, ...ARITHMETIC, ...COLOUR, ...GAMES, ...PENALTIES];
