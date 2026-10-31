/**
 * Exact survival functions for string families: μ is uniform over all ASCII strings (128 code points) of length
 * 0..L, so the length is n with probability 128^n / Σ_m 128^m and, given n, the characters are iid uniform
 * (derivations: docs/analytic-calibration/solutions.md §string).
 *
 * Tools: a chain over positions with a REDUCED alphabet (only the character classes the rule distinguishes, with
 * their probabilities), read off at every length and mixed with the length law; KMP automata for substrings;
 * equality chains (echo, mirror, endings) collapse to 128^−k.
 */
import type { Instantiation } from "@workspace/game-types";
import type { Params } from "../types.ts";
import { add, combine, dist, levels, map, occupancy, point, type Dist, type Levels, type Vec } from "./kit.ts";

const A = 128;

/** P(length = n), n = 0..L, as 2^(7(n − L)) normalised (no overflow at L = 128). */
export function lengthLaw(L: number): number[] {
  const w = Array.from({ length: L + 1 }, (_, n) => 2 ** (7 * (n - L)));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / s);
}

/** Σ_n P(len = n) · law_n, where law_n comes from sweeping a chain one character at a time. */
function sweep(L: number, start: Dist, letter: Dist, step: (s: Vec, c: Vec) => Vec, out: (s: Vec, n: number) => Vec): Dist {
  const w = lengthLaw(L), res: Dist = new Map();
  let d = start;
  for (let n = 0; n <= L; n++) {
    for (const e of d.values()) add(res, out(e.v, n), e.p * w[n]);
    if (n < L) d = combine(d, letter, step);
  }
  return res;
}

/** Mixture over lengths of a per-length law. */
function mixture(L: number, law: (n: number) => Dist): Dist {
  const w = lengthLaw(L), res: Dist = new Map();
  for (let n = 0; n <= L; n++) for (const e of law(n).values()) add(res, e.v, e.p * w[n]);
  return res;
}

/** A two-class letter: [1] with probability m/128, else [0]. */
const member = (m: number) => dist([[[1], m / A], [[0], 1 - m / A]]);

/** "first k matched" laws where P(≥ k | n) = 128^−k for k ≤ kmax(n) (equality chains). */
function geometricMatch(L: number, kmax: (n: number) => number): Dist {
  return mixture(L, n => {
    const K = Math.max(0, kmax(n)), d: Dist = new Map();
    for (let k = 0; k <= K; k++) add(d, [k], k < K ? A ** -k * (1 - 1 / A) : A ** -k);
    return d;
  });
}

const CLASSES: Readonly<Record<string, string>> = {
  vowels: "aeiouAEIOU", digits: "0123456789", lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", hex: "0123456789abcdef",
};

type Solver = (p: any, L: number) => Dist;

const SOLVERS: Readonly<Record<string, Solver>> = {
  "glyph-glutton": (_p, L) => sweep(L, point([0]), member(1), ([k], [c]) => [k + c], s => s),
  purist: (p, L) => sweep(L, point([0]), member(CLASSES[p.kind].length), ([k], [c]) => [k + (c ? 1 : -1)], s => s),
  streaker: (p, L) => sweep(L, point([0, 0]), member(CLASSES[p.kind].length),
    ([best, run], [c]) => { const r = c ? run + 1 : 0; return [Math.max(best, r), r]; }, ([best]) => [best]),
  /** Ending matched from the back: ≥ k iff n ≥ k and the last k characters agree. */
  "last-word": (p, L) => geometricMatch(L, n => Math.min(n, String(p.ending).length)),
  mirror: (_p, L) => geometricMatch(L, n => Math.floor(n / 2)),
  echo: (p, L) => geometricMatch(L, n => n - p.period),
  "haiku-master": (p, L) => mixture(L, n => point([-Math.abs(n - p.length)])),
  /** The largest k such that the spell's k-prefix occurs = the largest KMP state ever reached. */
  incantor: (p, L) => {
    const S = String(p.spell), m = S.length, fail = kmpFail(S);
    // Letter classes: each distinct spell character, plus "anything else".
    const chars = [...new Set(S)];
    const letter = dist([...chars.map((c, i) => [[i], 1 / A] as const), [[-1], 1 - chars.length / A] as const]);
    const next = (s: number, ci: number): number => {
      if (ci < 0) return 0;
      const c = chars[ci];
      let k = s === m ? fail[m - 1] : s;
      while (k > 0 && S[k] !== c) k = fail[k - 1];
      return S[k] === c ? k + 1 : 0;
    };
    return sweep(L, point([0, 0]), letter, ([best, s], [ci]) => { const t = next(s, ci); return [Math.max(best, t), t]; }, ([best]) => [best]);
  },
  /** Depth walk: '(' up, ')' closes (when depth > 0) and records the depth it closed at. */
  "nest-builder": (_p, L) => sweep(L, point([0, 0]), dist([[[1], 1 / A], [[-1], 1 / A], [[0], 1 - 2 / A]]),
    ([best, depth], [c]) => (c > 0 ? [best, depth + 1] : c < 0 && depth > 0 ? [Math.max(best, depth), depth - 1] : [best, depth]),
    ([best]) => [best]),
  /** Pieces between spaces; a word is 2..10 lowercase letters. State: [words, piece length (capped 11), all lowercase]. */
  wordsmith: (_p, L) => {
    const isWord = (len: number, ok: number) => (ok && len >= 2 && len <= 10 ? 1 : 0);
    return sweep(L, point([0, 0, 1]), dist([[[0], 1 / A], [[1], 26 / A], [[2], 101 / A]]),
      ([w, len, ok], [c]) => (c === 0 ? [w + isWord(len, ok), 0, 1] : [w, Math.min(len + 1, 11), c === 1 ? ok : 0]),
      ([w, len, ok]) => [w + isWord(len, ok)]);
  },
  /** Digit characters' values summed: −|total − T|. */
  tallykeeper: (p, L) => sweep(L, point([0]), dist([...Array.from({ length: 10 }, (_, d) => [[d], 1 / A] as const), [[0], 118 / A] as const]),
    ([s], [d]) => [s + d], ([s]) => [-Math.abs(s - p.total)]),
  /** (−|distinct − K|, min(n, 32)): distinct characters ~ occupancy of n draws over 128. */
  "palette-keeper": (p, L) => mixture(L, n => map(occupancy(n, A), ([k]) => [-Math.abs(k - p.colours), Math.min(n, 32)])),
  /** Σ char codes: n-fold convolution of uniform{0..127}; −|weight − W|. */
  "scale-keeper": (p, L) => {
    const w = lengthLaw(L), res: Dist = new Map();
    let cur = new Float64Array([1]);
    for (let n = 0; n <= L; n++) {
      cur.forEach((q, s) => add(res, [-Math.abs(s - p.weight)], q * w[n]));
      if (n === L) break;
      const nx = new Float64Array(cur.length + A - 1);
      for (let s = 0; s < cur.length; s++) { const q = cur[s] / A; if (q) for (let c = 0; c < A; c++) nx[s + c] += q; }
      cur = nx;
    }
    return res;
  },
  /**
   * Longest strictly increasing run of char codes. For each t, P(best ≥ t) by an absorbing chain over (last code c,
   * current run ρ < t): the next code c' > c extends the run, c' ≤ c restarts it at 1; reaching ρ = t absorbs.
   * Prefix sums over c make each step O(128·t). Absorbed mass only grows (positive sums, no cancellation).
   */
  ascender: (_p, L) => {
    const w = lengthLaw(L), atLeast: number[] = [1];
    for (let t = 1; t <= Math.min(L, A); t++) {
      let st = new Float64Array(A * t); // st[c * t + ρ − 1], ρ = 1..t−1
      let absorbed = 0, total = 0;
      for (let n = 0; n <= L; n++) {
        total += w[n] * absorbed;
        if (n === L) break;
        const nx = new Float64Array(A * t);
        if (n === 0) { if (t === 1) absorbed += 1; else for (let c = 0; c < A; c++) nx[c * t] += 1 / A; }
        for (let r = 0; r < t - 1; r++) {
          let below = 0;
          for (let c2 = 0; c2 < A; c2++) { // from any c < c2: run r+1 → r+2
            if (r + 2 >= t) absorbed += below / A; else nx[c2 * t + r + 1] += below / A;
            below += st[c2 * t + r];
          }
          let atOrAbove = 0;
          for (let c2 = A - 1; c2 >= 0; c2--) { atOrAbove += st[c2 * t + r]; nx[c2 * t] += atOrAbove / A; } // restart at 1
        }
        st = nx;
      }
      atLeast.push(total);
    }
    const d: Dist = new Map();
    for (let t = 0; t < atLeast.length; t++) add(d, [t], atLeast[t] - (t + 1 < atLeast.length ? atLeast[t + 1] : 0));
    return d;
  },
};

function kmpFail(S: string): number[] {
  const f = new Array<number>(S.length).fill(0);
  for (let i = 1, k = 0; i < S.length; i++) {
    while (k > 0 && S[i] !== S[k]) k = f[k - 1];
    if (S[i] === S[k]) k++;
    f[i] = k;
  }
  return f;
}

export function stringLevels(familyId: string, params: Params, inst: Instantiation): Levels | null {
  const s = SOLVERS[familyId];
  return s ? levels(s(params, Number(inst.args.maxLength))) : null;
}

export const STRING_SOLVED: readonly string[] = Object.keys(SOLVERS);
