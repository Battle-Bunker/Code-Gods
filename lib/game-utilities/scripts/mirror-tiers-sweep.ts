/**
 * Measurements behind Mirrormancer's tiers (archive/engine-v1:docs/layered-rules-measurements/mirror-tiers.md), on 4×4 digits:
 *
 *   node --experimental-strip-types scripts/mirror-tiers-sweep.ts [cards] [dealt] [sweep] [exact] [gate] [literal] [cross] [hall]
 *
 *   cards    the tiered cards, as dealt
 *   dealt    the liveness of every dealt value (through the family's own card: what scores in a game)
 *   sweep    halves for x = 1..17 and holding for two ys, through the family's own card
 *   exact    the exact top of the shipped forms (the top rows are independent)
 *   gate     how many mirrors a one-cell greedy climber holds after m moves
 *   literal  the forms that were NOT shipped, measured on the same base with the same hybrid law
 *   cross    cross-unit candidates (tiers that ask the columns to agree with the mirror rows)
 *   hall     the 18-line Hall of Mirrors base: its 1,000 top boards enumerated, and the tiers' exact law on them
 * No argument: everything.
 */
import { instantiate } from "@workspace/game-types";
import { context, family, paramsKey } from "../src/catalog.ts";
import { gridSpec } from "../src/families/grid/_util.ts";
import { hybridLawOf, tierLiveness } from "../src/families/grid/tiers-hybrid.ts";
import { hybridLaw, liveness, type Liveness, type HybridLaw } from "../src/tiers/hybrid.ts";
import { MIRROR_GATE, mirrorTiers } from "../src/families/grid/layered/mirror-tiers.ts";
import type { Params } from "../src/types.ts";

const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), ctx = context(inst), g = gridSpec(ctx);
const f = family("mirrormancer");
const want = (k: string) => process.argv.length <= 2 || process.argv.includes(k);
const N = 4;

function row(name: string, law: HybridLaw, live: Liveness, seconds: number): void {
  const top = -law.levels[law.levels.length - 1][1], baseTop = -law.baseLevels[law.baseLevels.length - 1][1];
  console.log(`${name.padEnd(46)} tierTop ${String(live.tierTop).padStart(2)}  min ${live.tierMin}  shareAtTop ${live.shareAtTop.toExponential(2)}  `
    + `added ${live.addedBits.toFixed(1).padStart(5)}  top ${top.toFixed(1)} (base ${baseTop.toFixed(1)})  levels ${law.levels.length}  `
    + `${seconds.toFixed(1)}s  best ${[...law.best].join("").replace(/(....)(?=.)/g, "$1/")}  ${live.problems.length ? "PROBLEMS: " + live.problems.join("; ") : "alive"}`);
}

/** A tier through the family's own card (what a game scores). */
function viaCard(name: string, tier: Params): void {
  const p = { axis: "LR", tiers: [{ ...tier, gate: MIRROR_GATE }] } as Params, t0 = performance.now();
  const law = hybridLawOf("mirrormancer", mirrorTiers, p as never, ctx)!, live = tierLiveness("mirrormancer", mirrorTiers, p as never, ctx)!;
  row(name, law, live, (performance.now() - t0) / 1000);
}

// --- plain JS tiers on the same base (forms that are not on any card) ---------------------------------------------
const rowsOf = (b: Uint8Array) => [0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => b[r * N + c]));
const colsOf = (b: Uint8Array) => [0, 1, 2, 3].map(c => [0, 1, 2, 3].map(r => b[r * N + c]));
const isMirror = (l: readonly number[]) => l[0] === l[3] && l[1] === l[2];
const count = <T,>(xs: readonly T[], ok: (x: T) => boolean) => xs.reduce((n, x) => n + (ok(x) ? 1 : 0), 0);
const distinct = (ls: readonly (readonly number[])[]) => new Set(ls.map(l => l.join(""))).size;
const baseOrdinal = (b: Uint8Array): number[] => {
  let mirrors = 0, pairs = 0;
  for (const l of rowsOf(b)) { const m = (l[0] === l[3] ? 1 : 0) + (l[1] === l[2] ? 1 : 0); pairs += m; if (m === 2) mirrors++; }
  return [mirrors, pairs];
};
function viaJs(name: string, tier: (b: Uint8Array) => number, seed = 1): void {
  const base = mirrorTiers.base({ axis: "LR" }, g)!, t0 = performance.now();
  const law = hybridLaw(base, { gate: MIRROR_GATE, tierArity: 1, seed, tier });
  const live = liveness(law, N, 10, b => { const o = baseOrdinal(b); return [...o, o[0] >= MIRROR_GATE ? tier(b) : 0]; });
  row(name, law, live, (performance.now() - t0) / 1000);
}

if (want("cards")) {
  for (const p of [{ axis: "LR", tiers: [{ id: "holding", y: 7, gate: MIRROR_GATE }] }, { axis: "TB", tiers: [{ id: "halves", x: 7, gate: MIRROR_GATE }] }]) {
    console.log(f.card.typescript(p, ctx));
    console.log(f.card.python(p, ctx));
  }
}

if (want("dealt")) {
  console.log("# dealt values, by table (through the card)");
  const seen = new Set<string>();
  for (const p of f.tiered!(ctx, 1)) {
    const canon = f.canonical(p, ctx) as Params, key = paramsKey(canon);
    if (seen.has(key)) continue;
    seen.add(key);
    const t = (canon.tiers as Params[])[0];
    viaCard(`${t.id} ${JSON.stringify(t.y ?? t.x)} (canonical)`, { ...t, gate: undefined } as never);
  }
}

if (want("sweep")) {
  console.log("# sweep: halves x = 1..17 (x and 18 − x must agree), holding for two ys (must agree)");
  for (let x = 1; x <= 17; x++) viaCard(`halves x=${x}`, { id: "halves", x });
  for (const y of [0, 7]) viaCard(`holding y=${y}`, { id: "holding", y });
}

if (want("literal")) {
  console.log("# forms that were not shipped, on the same base (rows; gate 3)");
  const holds2 = (y: number) => (l: readonly number[]) => isMirror(l) && count(l, v => v === y) === 2;
  viaJs("holding y=7, without 'different'", b => count(rowsOf(b), holds2(7)));
  for (const x of [6, 7, 9]) {
    viaJs(`halves x=${x}, literal (no clause)`, b => count(rowsOf(b), l => isMirror(l) && l[0] + l[1] === x));
    viaJs(`halves x=${x}, two numbers, without 'different'`, b => count(rowsOf(b), l => isMirror(l) && l[0] + l[1] === x && l[0] !== l[1]));
  }
  // The owner's literal words on this base: a cell is in one row and one column, so "exactly two symmetries" is "both".
  viaJs("literal: 7s in a mirror row AND a mirror column", b => {
    const rs = rowsOf(b).map(isMirror), cs = colsOf(b).map(isMirror);
    let n = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (b[r * N + c] === 7 && rs[r] && cs[c]) n++;
    return n;
  });
}

if (want("cross")) {
  console.log("# cross-unit candidates on the rows base (gate 3)");
  const holds2 = (y: number) => (l: readonly number[]) => isMirror(l) && count(l, v => v === y) === 2;
  viaJs("columns that are mirrors too", b => count(colsOf(b), isMirror));
  viaJs("mirror columns holding exactly two 7s", b => count(colsOf(b), holds2(7)));
  viaJs("different mirror columns holding exactly two 7s", b => distinct(colsOf(b).filter(holds2(7))));
  viaJs("different mirror rows OR columns holding two 7s", b => distinct([...rowsOf(b), ...colsOf(b)].filter(holds2(7))));
  viaJs("different mirror columns (any)", b => distinct(colsOf(b).filter(isMirror)));
  viaJs("mirror columns with two different numbers", b => count(colsOf(b), l => isMirror(l) && l[0] !== l[1]));
}

if (want("exact")) {
  // At the base's top the four rows are independent, uniform mirrors (100 of them), so a "different mirrors" tier's top
  // is exact: with n qualifying mirrors, n(n−1)(n−2)(n−3) of the 10⁸ top boards score 4 (n ≥ 4).
  console.log("# exact top of the shipped forms (n qualifying mirrors of 100; share of the base's 10^8 top boards)");
  const mirrors: number[][] = [];
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) mirrors.push([a, b, b, a]);
  const report = (name: string, ok: (l: number[]) => boolean) => {
    const n = count(mirrors, ok), top = Math.min(n, 4);
    let ways = 1;
    for (let i = 0; i < top; i++) ways *= n - i;
    // Boards scoring `top`: for n ≥ 4, ordered choices of 4 different qualifying mirrors; below that, counted directly.
    let boards = ways;
    if (n < 4) { boards = 0; const q = mirrors.filter(ok).map(l => l.join("")), all = mirrors.map(l => l.join(""));
      for (const r0 of all) for (const r1 of all) for (const r2 of all) for (const r3 of all) if (new Set([r0, r1, r2, r3].filter(r => q.includes(r))).size === top) boards++; }
    console.log(`${name.padEnd(20)} n ${String(n).padStart(2)}  tierTop ${top}  boards ${String(boards).padStart(8)}  added ${Math.log2(1e8 / boards).toFixed(2)} bits`);
  };
  report("holding (any y)", l => count(l, v => v === 7) === 2);
  for (let x = 1; x <= 17; x++) report(`halves x=${x}`, l => l[0] + l[1] === x && l[0] !== l[1]);
}

if (want("gate")) {
  // A lone one-cell greedy climber on the base, from a uniform board: how many mirrors after m moves.
  console.log("# gate: mirrors a one-cell greedy climber holds after m moves (2,000 uniform starts; mean, and share with ≥ 3 and with 4)");
  let seed = 12345;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const after = new Map<number, number[]>();
  for (let trial = 0; trial < 2000; trial++) {
    const b = Uint8Array.from({ length: 16 }, () => Math.floor(rand() * 10));
    for (let m = 1; m <= 10; m++) {
      let best: number[] | null = null, at = -1, to = 0;
      for (let i = 0; i < 16; i++) { const was = b[i];
        for (let v = 0; v < 10; v++) { if (v === was) continue; b[i] = v; const o = baseOrdinal(b);
          if (!best || o[0] > best[0] || (o[0] === best[0] && o[1] > best[1])) { best = o; at = i; to = v; } }
        b[i] = was; }
      const now = baseOrdinal(b);
      if (best && (best[0] > now[0] || (best[0] === now[0] && best[1] > now[1]))) b[at] = to;
      (after.get(m) ?? after.set(m, []).get(m)!).push(baseOrdinal(b)[0]);
    }
  }
  for (const [m, xs] of after) console.log(`  after ${String(m).padStart(2)} moves: mean ${(xs.reduce((a, x) => a + x, 0) / xs.length).toFixed(2)} mirrors, ≥3: ${(100 * count(xs, x => x >= 3) / xs.length).toFixed(0)}%, 4: ${(100 * count(xs, x => x === 4) / xs.length).toFixed(0)}%`);
}

if (want("hall")) {
  // Hall of Mirrors: rows, columns and every diagonal of two or more cells (18 lines). Its lines overlap, so it has no
  // disjoint units; but its top is small enough to list. All 18 lines mirror ⇔ corners p, edges q, centre t.
  const lines: number[][] = [];
  for (let i = 0; i < N; i++) { lines.push([0, 1, 2, 3].map(j => i * N + j)); lines.push([0, 1, 2, 3].map(j => j * N + i)); }
  for (let d = -(N - 2); d <= N - 2; d++) {
    const down: number[] = [], up: number[] = [];
    for (let r = 0; r < N; r++) { const c = r + d; if (c >= 0 && c < N) { down.push(r * N + c); up.push(r * N + (N - 1 - c)); } }
    lines.push(down, up);
  }
  const mirror = (b: Uint8Array, l: number[]) => l.every((c, i) => b[c] === b[l[l.length - 1 - i]]);
  const t0 = performance.now();
  // Enumerate by constraint: the 18 mirror conditions are equalities between cells, so the top is the set of boards
  // constant on each class of cells the equalities join (union-find), with 10 choices per class.
  const parent = Array.from({ length: N * N }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const l of lines) for (let i = 0; i < l.length; i++) parent[find(l[i])] = find(l[l.length - 1 - i]);
  const classes = [...new Set(parent.map((_, i) => find(i)))];
  const tops: Uint8Array[] = [];
  for (let code = 0; code < 10 ** classes.length; code++) {
    const b = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) b[i] = Math.floor(code / 10 ** classes.indexOf(find(i))) % 10;
    tops.push(b);
  }
  console.log(`# hall of mirrors: ${lines.length} lines, ${classes.length} classes of cells at the top, ${tops.length} top boards `
    + `(${(16 * Math.log2(10) - Math.log2(tops.length)).toFixed(2)} bits), listed in ${((performance.now() - t0) / 1000).toFixed(3)}s`);
  const exact = (name: string, tier: (b: Uint8Array) => number) => {
    const hist = new Map<number, number>();
    for (const b of tops) { const v = tier(b); hist.set(v, (hist.get(v) ?? 0) + 1); }
    const vals = [...hist.keys()].sort((a, b) => a - b), top = vals[vals.length - 1], n = hist.get(top)!;
    console.log(`${name.padEnd(52)} tier values ${vals.map(v => `${v}×${hist.get(v)}`).join(" ")}  top ${top} on ${n} boards: +${Math.log2(tops.length / n).toFixed(2)} bits exactly`);
  };
  const inLines = (b: Uint8Array) => { const n = new Array<number>(N * N).fill(0); for (const l of lines) if (mirror(b, l)) for (const c of l) n[c]++; return n; };
  exact("literal: 7s in exactly two mirror lines", b => { const n = inLines(b); let k = 0; for (let i = 0; i < N * N; i++) if (b[i] === 7 && n[i] === 2) k++; return k; });
  exact("holding: mirror lines holding exactly two 7s", b => count(lines, l => mirror(b, l) && count(l, c => b[c] === 7) === 2));
  exact("holding, different lines only", b => distinct(lines.filter(l => mirror(b, l) && count(l, c => b[c] === 7) === 2).map(l => l.map(c => b[c]))));
  const four = lines.filter(l => l.length === 4);
  for (const x of [6, 7, 13]) {
    exact(`halves x=${x}, literal, every line of 2+ cells`, b => count(lines, l => mirror(b, l) && l.slice(0, l.length >> 1).reduce((s, c) => s + b[c], 0) === x));
    exact(`halves4 x=${x}, two different numbers`, b => count(four, l => mirror(b, l) && b[l[0]] + b[l[1]] === x && b[l[0]] !== b[l[1]]));
  }
}
