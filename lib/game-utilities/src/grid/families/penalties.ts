import type { GridOrdinalFamily } from "./types.ts";
import { largestComponent4 } from "./seeds-strategy-util.ts";

// Penalty families: BADNESS ordinals (higher = worse), ported exactly like reward ordinals.

/** Mirrors defence.py HATE_COLOUR's ordinal lambda: number of cells of the hated colour. */
const HATE_COLOUR: GridOrdinalFamily = {
  id: "hate_colour",
  ordinal(g, p, env) {
    const NN = env.N * env.N, col = g.col, X = p.colour;
    let n = 0;
    for (let i = 0; i < NN; i++) if (col[i] === X) n++;
    return n;
  },
};

/** Mirrors defence.py HATE_VALUE's ordinal lambda: number of cells with the hated value. */
const HATE_VALUE: GridOrdinalFamily = {
  id: "hate_value",
  ordinal(g, p, env) {
    const NN = env.N * env.N, sym = g.sym, value = env.value, V = p.value;
    let n = 0;
    for (let i = 0; i < NN; i++) if (value[sym[i]] === V) n++;
    return n;
  },
};

/** Mirrors defence.py HATE_BLOB (colour.py `kg_ord`): largest 4-connected patch of colour C, 0 if none. */
const HATE_BLOB: GridOrdinalFamily = {
  id: "hate_blob",
  ordinal(g, p, env) {
    const NN = env.N * env.N, col = g.col, C = p.C;
    const mask = new Uint8Array(NN);
    for (let i = 0; i < NN; i++) mask[i] = col[i] === C ? 1 : 0;
    return largestComponent4(env.N, col, mask);
  },
};

/** Mirrors defence.py `to_ord` (Takeover): count of the commonest colour. */
const HATE_TAKEOVER: GridOrdinalFamily = {
  id: "hate_takeover",
  ordinal(g, _p, env) {
    const NN = env.N * env.N, col = g.col;
    const cnt = new Int32Array(env.C);
    let best = 0;
    for (let i = 0; i < NN; i++) { const n = ++cnt[col[i]]; if (n > best) best = n; }
    return best;
  },
};

/** Mirrors defence.py `bb_ord` (Big blobs): largest one-colour 4-connected patch of any colour. */
const HATE_BIG_BLOB: GridOrdinalFamily = {
  id: "hate_big_blob",
  ordinal(g, _p, env) {
    return largestComponent4(env.N, g.col, null);
  },
};

/** Ports of lib/grid-lab/gridlab/rules/defence.py (penalty families). */
export const FAMILIES: readonly GridOrdinalFamily[] = [HATE_COLOUR, HATE_VALUE, HATE_BLOB, HATE_TAKEOVER, HATE_BIG_BLOB];
