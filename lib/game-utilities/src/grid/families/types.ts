import type { GridEnv, GridView, Ordinal } from "../env.ts";

/**
 * A TypeScript port of one Grid Lab family's ORDINAL (lib/grid-lab/gridlab/rules/<lens>.py, the
 * scalar `*_ord` function). It must return exactly Grid Lab's value (not just the same order),
 * because the shipped calibration tables are keyed by those values. Checked by
 * test/grid-families.test.ts against fixtures exported by `python3 -m gridlab.export`.
 *
 * `p` holds the draw's Grid Lab params as JSON (tuples become arrays). Cell (r, c) is at r * N + c.
 * Ordinals are integers or fixed-length integer arrays (lexicographic).
 */
export interface GridOrdinalFamily {
  readonly id: string;
  ordinal(g: GridView, p: any, env: GridEnv): Ordinal;
}
