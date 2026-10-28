/**
 * Host-side view of a GridType and its grids, mirroring lib/grid-lab/gridlab/core.py so the
 * TypeScript ports of utility functions read the same tables as Grid Lab.
 */
import {
  COLOUR_COMPONENTS, SYMBOL_COMPONENTS, decodeGrid, gridTypeKey,
  type GridTypeArgs, type GridValue,
} from "@workspace/game-core";

/** An ordinal utility: an integer, or a fixed-length integer tuple compared lexicographically. */
export type Ordinal = number | number[];

/** Paint mixing (Mixable), by colour name: unordered parent pair -> child. Same as core.py MIXES. */
const MIXES: Record<string, [string, string, string][]> = {
  rgb: [],
  rgby: [["yellow", "blue", "green"]],
  rainbow6: [["red", "yellow", "orange"], ["yellow", "blue", "green"], ["red", "blue", "violet"]],
};

export interface GridEnv {
  readonly args: GridTypeArgs;
  readonly key: string;
  readonly N: number;
  /** Number of symbols and colours. */
  readonly S: number;
  readonly C: number;
  readonly cards: boolean;
  /** Valued: points per symbol (digits: the digit; cards: A=1 .. K=13). */
  readonly value: Int16Array;
  /** Ranked: counting-order position, 0..ranks-1 (cards: by rank, suit ignored). */
  readonly rank: Int16Array;
  readonly ranks: number;
  /** Suited (cards only): 0..3 = ♠ ♥ ♦ ♣. */
  readonly suit: Int16Array | null;
  /** Faced (cards only): J, Q, K. */
  readonly face: Uint8Array | null;
  /** Numeral (digit sets only): the positional base. */
  readonly base: number | null;
  readonly colourNames: readonly string[];
  /** Mixable: mix[a * C + b] = child colour index, or -1. */
  readonly mix: Int16Array;
  /** Capability classes, superclass closure applied (core.py GridType.caps). */
  readonly caps: ReadonlySet<string>;
  /** Index of a colour name, or null if the colour set lacks it. */
  colour(name: string): number | null;
  /** Ranked step with wrap; cards keep their suit (core.py GridType.step). */
  step(s: number, k: number): number;
}

const envs = new Map<string, GridEnv>();

export function gridEnv(args: GridTypeArgs): GridEnv {
  const key = gridTypeKey(args);
  const cached = envs.get(key);
  if (cached) return cached;
  const sc = SYMBOL_COMPONENTS[args.symbols], cc = COLOUR_COMPONENTS[args.colours];
  const cards = args.symbols === "cards", S = sc.count, C = cc.count;
  const idx = Array.from({ length: S }, (_, i) => i);
  const mix = new Int16Array(C * C).fill(-1);
  const at = (name: string) => cc.names.indexOf(name);
  for (const [a, b, child] of MIXES[args.colours]) {
    mix[at(a) * C + at(b)] = mix[at(b) * C + at(a)] = at(child);
  }
  const caps = new Set(["Finite", "Valued", "Ranked", "Spectral"]);
  if (cards) { caps.add("Suited"); caps.add("Faced"); } else caps.add("Numeral");
  if (args.colours === "rainbow6") caps.add("Wheel");
  if (MIXES[args.colours].length) caps.add("Mixable");
  const env: GridEnv = Object.freeze({
    args: Object.freeze({ ...args }), key, N: args.size, S, C, cards,
    value: Int16Array.from(idx, i => cards ? (i % 13) + 1 : i),
    rank: Int16Array.from(idx, i => cards ? i % 13 : i),
    ranks: cards ? 13 : S,
    suit: cards ? Int16Array.from(idx, i => Math.floor(i / 13)) : null,
    face: cards ? Uint8Array.from(idx, i => (i % 13 >= 10 ? 1 : 0)) : null,
    base: cards ? null : S,
    colourNames: cc.names,
    mix, caps,
    colour(name: string) { const i = cc.names.indexOf(name); return i < 0 ? null : i; },
    step(s: number, k: number) {
      const mod = (a: number, m: number) => ((a % m) + m) % m;
      return cards ? Math.floor(s / 13) * 13 + mod((s % 13) + k, 13) : mod(s + k, S);
    },
  });
  envs.set(key, env);
  return env;
}

/** A decoded grid as utility functions see it: row-major indices, cell (r, c) at r * N + c. */
export type GridView = GridValue;

export function decode(text: string, env: GridEnv): GridView {
  return decodeGrid(text, env.args);
}
