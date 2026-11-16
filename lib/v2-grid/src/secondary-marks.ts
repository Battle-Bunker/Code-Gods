/**
 * What each secondary preference of the beginner pool marks on the board (docs/engine-v2/v1-audit.md §6, G2): the
 * cells, pairs, squares or totals it counts, labelled with its own id, so a player sees where each part of their rule
 * is read (v1's lenses marked every unit of every tier). A focus picks out what counts; a note says, in the card's own
 * words, how far a unit is off. Marks for every secondary are recorded; the views show only the dealt ones.
 *
 * Marks only: no term here, nothing a score reads (a mark reads the element it cites, as the core requires). The words name cells as the cards do ("row 2, column 3").
 */
import { ref, type ElementRef, type EvalContext, type RuleFamily } from "@workspace/v2-core";
import { at, cellLabel, cellName, type GridState } from "./grid.ts";
import { boxes, boxEdges, cols, folds, gcd, leaps, pairs, rows, strangers, windows } from "./units.ts";

type Ctx = EvalContext<GridState>;
type Marker = (ctx: Ctx, v: readonly number[], n: number, p: { T?: number; axis?: string }) => void;

const cell = (n: number, i: number): ElementRef => ref("cells", cellName(n, i));
// A mark cites only what the rule read, so each mark reads its element first (the family has read most already).
const focus = (ctx: Ctx, term: string, r: ElementRef) => { ctx.read(r); ctx.mark({ kind: "focus", ref: r, term }); };
const note = (ctx: Ctx, term: string, r: ElementRef, text: string) => { ctx.read(r); ctx.mark({ kind: "note", ref: r, text, term }); };
const shareFactor = (a: number, b: number) => gcd(a, b) > 1;
const sum = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0);
const shortOver = (x: number, T: number) => (x < T ? `${T - x} short` : `${x - T} over`);

/** "4 apart, should be 1": a pair that misses its gap; nothing for a pair on target (it is focused). */
function apartPairs(ctx: Ctx, term: string, v: readonly number[], n: number, ps: readonly (readonly [number, number])[], want: number, partner: (b: number) => string): void {
  for (const [a, b] of ps) {
    const d = Math.abs(v[a]! - v[b]!);
    if (d === want) { focus(ctx, term, cell(n, a)); focus(ctx, term, cell(n, b)); }
    else note(ctx, term, cell(n, a), `${d} apart from ${partner(b)} (should be ${want})`);
  }
}

const MARKERS: Readonly<Record<string, Marker>> = {
  // ---- Mirrormancer (dealt axis rows or columns: its secondaries read along the dealt lines, or across them)
  "mirrormancer": (ctx, v, n, p) => {
    const half = Math.floor(n / 2), byRows = p.axis !== "columns";
    const along = byRows ? rows(n) : cols(n), across = byRows ? cols(n) : rows(n);
    const other = byRows ? "column" : "row", mine = byRows ? "row" : "column";
    // The other way read the same backwards with two different numbers: each cell against the cell it mirrors; a line
    // of one number is noted, not focused (v1's "different" guard).
    for (const l of across) {
      if (l.every(i => v[i] === v[l[0]!])) { note(ctx, "mirror-other-way", cell(n, l[0]!), `this ${other} holds only ${v[l[0]!]}s: a mirror needs two different numbers`); continue; }
      for (let k = 0; k < half; k++) {
        const a = l[k]!, b = l[n - 1 - k]!;
        if (v[a] === v[b]) { focus(ctx, "mirror-other-way", cell(n, a)); focus(ctx, "mirror-other-way", cell(n, b)); }
        else note(ctx, "mirror-other-way", cell(n, a), `${Math.abs(v[a]! - v[b]!)} from its mirror in the ${other} (${cellLabel(n, b)})`);
      }
    }
    // Each end number one apart from the number beside it, in each dealt line.
    const ends = along.flatMap(l => [[l[0]!, l[1]!], [l[n - 1]!, l[n - 2]!]] as [number, number][]);
    apartPairs(ctx, "one-apart", v, n, ends, 1, b => `the number beside it in the ${mine} (${v[b]})`);
    // The dealt lines' middle numbers: what is added up.
    for (const l of along) for (const i of l.slice(1, -1)) focus(ctx, "small-middle", cell(n, i));
  },
  // ---- Magic Eighteen (dealt axis rows or columns)
  "magic-eighteen": (ctx, v, n, p) => {
    const T = p.T!, byRows = p.axis !== "columns";
    (byRows ? cols(n) : rows(n)).forEach((l, k) => {
      const r = ref("tally", `${byRows ? "col" : "row"}${k}`), x = sum(l.map(i => v[i]!));
      if (x === T) focus(ctx, "other-way", r); else note(ctx, "other-way", r, shortOver(x, T));
    });
    const diags = [rows(n).map((_, k) => at(n, k, k)), rows(n).map((_, k) => at(n, k, n - 1 - k))];
    diags.forEach((d, k) => {
      for (const i of d) focus(ctx, "diagonals", cell(n, i));
      const x = sum(d.map(i => v[i]!));
      note(ctx, "diagonals", cell(n, d[0]!), `${k === 0 ? "the diagonal from the top-left" : "the diagonal from the top-right"} adds up to ${x}${x === T ? "" : `: ${shortOver(x, T)}`}`);
    });
    (byRows ? rows(n) : cols(n)).forEach((l, k) => {
      const seen = new Map<number, number>();
      for (const i of l) seen.set(v[i]!, (seen.get(v[i]!) ?? 0) + 1);
      const twice = [...seen].filter(([, c]) => c > 1).map(([x]) => x);
      if (!twice.length) for (const i of l) focus(ctx, "different-numbers", cell(n, i));
      else note(ctx, "different-numbers", cell(n, l[0]!), `${byRows ? "row" : "column"} ${k + 1} repeats ${twice.join(" and ")}`);
    });
  },
  // ---- Opposite Nines
  "opposite-nines": (ctx, v, n, p) => {
    const T = p.T!;
    for (const l of rows(n)) for (let k = 0; k < Math.floor(n / 2); k++) {
      const a = l[k]!, b = l[n - 1 - k]!, x = v[a]! + v[b]!;
      if (x === T) { focus(ctx, "mirror-nines", cell(n, a)); focus(ctx, "mirror-nines", cell(n, b)); }
      else note(ctx, "mirror-nines", cell(n, a), `with its mirror in the row (${v[b]}): ${x}, ${shortOver(x, T)}`);
    }
    // The pairs that add up to T, one note per way of splitting it.
    const ways = new Map<number, number[]>();
    pairs(n).forEach(([a, b], k) => { if (v[a]! + v[b]! === T) { const lo = Math.min(v[a]!, v[b]!); ways.set(lo, [...(ways.get(lo) ?? []), k]); } });
    for (const [lo, ks] of ways) {
      ks.forEach(k => focus(ctx, "different-splits", ref("turn", `pair${k}`)));
      if (ks.length > 1) note(ctx, "different-splits", ref("turn", `pair${ks[0]}`), `${ks.length} pairs split ${T} as ${lo} and ${T - lo}: they count once`);
    }
  },
  // ---- Two Pair
  "two-pair": (ctx, v, n) => {
    boxes(n).forEach((cs, k) => {
      const box = ref("boxes", `box${k}`), xs = cs.map(i => v[i]!);
      const hi = Math.max(...xs), lo = Math.min(...xs);
      note(ctx, "apart", box, `biggest ${hi} minus smallest ${lo}: ${hi - lo}`);
      const [a, b, c, d] = xs;
      if (a === d && b === c && a !== b) focus(ctx, "diagonal-pairs", box);
      cs.filter(i => v[i] === lo).forEach(i => focus(ctx, "small-pairs", cell(n, i)));
    });
  },
  // ---- Spread of Three
  "spread-of-three": (ctx, v, n) => {
    windows(n).forEach((w, k) => {
      const xs = w.map(i => v[i]!), hi = Math.max(...xs), lo = Math.min(...xs);
      const h = xs.indexOf(hi), l = xs.indexOf(lo);
      const single = xs.filter(y => y === hi).length === 1 && xs.filter(y => y === lo).length === 1;
      const sq = ref("windows", `w${k}`);
      if (single && h + l === 3) focus(ctx, "spread-diagonal", sq);
      if (new Set(xs).size === 4) focus(ctx, "square-different", sq);
    });
    // Each square's smallest number: the cells that are some square's smallest.
    const smallest = new Set(windows(n).flatMap(w => { const lo = Math.min(...w.map(i => v[i]!)); return w.filter(i => v[i] === lo); }));
    for (const i of smallest) focus(ctx, "spread-small", cell(n, i));
  },
  // ---- Strangers
  "strangers": (ctx, v, n) => {
    const bx = boxes(n), boxOf = (i: number) => bx.findIndex(cs => cs.includes(i));
    const inBox = new Set(bx.flatMap(boxEdges).map(([a, b]) => `${a}:${b}`));
    for (let i = 0; i < n * n; i++) for (const j of [i + 1, i + n]) {
      if (j >= n * n || (j === i + 1 && j % n === 0) || boxOf(i) === boxOf(j) || inBox.has(`${i}:${j}`)) continue;
      if (strangers(v[i]!, v[j]!)) { focus(ctx, "across-strangers", cell(n, i)); focus(ctx, "across-strangers", cell(n, j)); }
    }
  },
  // ---- Leapfrog
  "leapfrog": (ctx, v, n) => {
    const lp = leaps(n);
    rows(n).forEach(l => {
      const s = l.slice(0, -2).map((i, k) => Math.sign(v[l[k + 2]!]! - v[i]!));
      if (s.length > 0 && s[0] !== 0 && s.every(x => x === s[0])) lp.forEach(([a], k) => { if (l.includes(a)) focus(ctx, "same-way", ref("leaps", `leap${k}`)); });
    });
    const down = cols(n).flatMap(l => l.slice(0, -2).map((i, k) => [i, l[k + 2]!] as [number, number]));
    apartPairs(ctx, "columns-leap", v, n, down, 1, b => `the number two cells down (${v[b]})`);
    for (const l of rows(n)) l.slice(0, -2).forEach((a, k) => {
      const m = l[k + 1]!, b = l[k + 2]!;
      if (shareFactor(v[m]!, v[a]!) && shareFactor(v[m]!, v[b]!)) focus(ctx, "middle-factors", cell(n, m));
    });
  },
  // ---- Crosswise Threes
  "crosswise-threes": (ctx, v, n) => {
    folds(n).forEach(([a, b], k) => {
      const f = ref("fold", `fold${k}`);
      if (v[a]! > v[b]!) focus(ctx, "bigger-side", f);
      if (shareFactor(v[a]!, v[b]!)) focus(ctx, "fold-factors", f);
    });
    const other = rows(n).flatMap((_, r) => rows(n).map((_, c) => [at(n, r, c), at(n, c, r)] as [number, number]).filter((_, c) => r < c));
    apartPairs(ctx, "other-fold", v, n, other, 3, b => cellLabel(n, b));
  },
};

/** A family with its secondaries' marks added after its own evaluation (families without a marker are returned as they are). */
export function withSecondaryMarks<P extends object>(f: RuleFamily<GridState, P>, n: number): RuleFamily<GridState, P> {
  const marker = MARKERS[f.id];
  if (!marker) return f;
  return { ...f, evaluate: (ctx, p) => { f.evaluate(ctx, p); marker(ctx, ctx.state.cells, n, p as { T?: number; axis?: string }); } };
}
