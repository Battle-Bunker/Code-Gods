/**
 * Annotations of tiered draws (docs/layered-rules-design.md §4). A tiered draw's ordinal is its base's ordinal followed
 * by one component per tier, counted once the base's first component reaches the gate. Its explanation is therefore the
 * base lens's units (their points padded with zeros for the tier components) plus, from the gate on, each tier's own
 * units, which score the tier's component only. Below the gate there are no tier units: the explanation's `tiers` says
 * how many more base points open the ★ tier.
 *
 * A tier lens is written once per interaction (the registry is keyed by the interaction's id, families/grid/tiers.ts),
 * so every family whose params carry `tiers` and whose base has a lens is explained, with no per-family code.
 */
import type { CardTier, Params } from "../types.ts";
import { baseParams, tierValue, tiersOf, type TierValue } from "../families/grid/tiers.ts";
import type { Board } from "./board.ts";
import { count, type Lens } from "./lens.ts";
import type { BreakdownItem, Cell, Part, TierStatus } from "./model.ts";
import { defaultGeometry, type HoverMode } from "./units.ts";

/** One interaction's annotation: its units on a board, each scoring the tier's own components. */
export interface TierLens {
  /** What each of the tier's components counts: ["rows, columns and long diagonals adding up to 18"]. */
  components(v: TierValue, b: Board): string[];
  /** The tier's unit, for the raw-score breakdown: [one, many]. */
  readonly unit: readonly [one: string, many: string];
  /** What a scoring unit does, after its count: "adding up to 18". */
  hit(v: TierValue, b: Board): string;
  /**
   * Every unit the tier looks at, scoring or not (a near miss says how far it is). `points` are the tier's own
   * components; `group` is one of the modes' groups; ids are unique within the tier.
   */
  parts(v: TierValue, b: Board): Part[];
  /** How the board picks the tier's units: one mode per kind of unit that overlaps another kind. */
  readonly modes: readonly HoverMode[];
}

const num = (v: TierValue, k: string) => v[k] as number;

/** A set of cells against a total: a point when it adds up to it, else how far off it is. */
function sumUnit(b: Board, x: number, id: string, group: string, shape: Part["shape"], name: string, cells: Cell[]): Part {
  const total = cells.reduce((s, c) => s + b.value(c), 0), gap = total - x;
  const sum = `${cells.map(c => b.glyph(c)).join(" + ")} = ${total}`;
  return {
    id, group, shape, cells, points: [gap === 0 ? 1 : 0],
    title: gap === 0 ? `${name} adds up to ${x}` : `${name}: ${Math.abs(gap)} ${gap < 0 ? "short of" : "over"} ${x}`,
    facts: [{ text: gap === 0 ? sum : `${sum}, not ${x}`, ok: gap === 0 }],
  };
}

/** "lines": each row, column and long diagonal that adds up to x. */
const lines: TierLens = {
  components: v => [`rows, columns and long diagonals adding up to ${num(v, "x")}`],
  unit: ["line", "lines"],
  hit: v => `adding up to ${num(v, "x")}`,
  parts: (v, b) => {
    const x = num(v, "x"), N = b.N, at = (r: number, c: number): Cell => b.cells[r * N + c];
    const all = Array.from({ length: N }, (_, i) => i);
    return [
      ...all.map(r => sumUnit(b, x, `row:${r}`, "row", "line", `Row ${r + 1}`, b.row(r))),
      ...all.map(c => sumUnit(b, x, `column:${c}`, "column", "line", `Column ${c + 1}`, b.column(c))),
      sumUnit(b, x, "diagonal:down", "diagonal", "line", "The ↘ diagonal", all.map(i => at(i, i))),
      sumUnit(b, x, "diagonal:up", "diagonal", "line", "The ↙ diagonal", all.map(i => at(i, N - 1 - i))),
    ];
  },
  modes: [
    { id: "row", label: "Rows", groups: ["row"] },
    { id: "column", label: "Columns", groups: ["column"] },
    { id: "diagonal", label: "Diagonals", groups: ["diagonal"] },
  ],
};

/** "squares": each 2×2 square, anywhere on the board, that adds up to x. */
const squares: TierLens = {
  components: v => [`2×2 squares adding up to ${num(v, "x")}`],
  unit: ["2×2 square", "2×2 squares"],
  hit: v => `adding up to ${num(v, "x")}`,
  parts: (v, b) => {
    const x = num(v, "x"), N = b.N, at = (r: number, c: number): Cell => b.cells[r * N + c], out: Part[] = [];
    for (let r = 0; r + 1 < N; r++) for (let c = 0; c + 1 < N; c++) {
      out.push(sumUnit(b, x, `square:${r},${c}`, "square", "block", `The square at row ${r + 1}, column ${c + 1}`, [at(r, c), at(r, c + 1), at(r + 1, c), at(r + 1, c + 1)]));
    }
    return out;
  },
  modes: [{ id: "square", label: "2×2 squares", groups: ["square"] }],
};

/** The tier lenses, by interaction id. */
export const TIER_LENSES: Readonly<Record<string, TierLens>> = Object.freeze({ lines, squares });

// ------------------------------------------------------------------------------------------------
// a tiered draw's lens: its base's lens and its tiers'
// ------------------------------------------------------------------------------------------------

interface PlannedTier { readonly block: CardTier; readonly value: TierValue; readonly lens: TierLens; readonly key: string }
interface Plan { readonly arity: number; readonly tiers: readonly PlannedTier[] }

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * `base` extended to the family's tiered draws: for a draw without `tiers` (or whose tiers it cannot explain: an
 * interaction without a tier lens, the "unlock" composition, a base lens that explains only part of the base's ordinal)
 * it is `base` on the base's params, unchanged. `blocksOf` gives a draw's ★ blocks (`UtilityFamily.cardTiers`): where
 * each tier's points sit in the ordinal, and its gate.
 */
export function tieredLens(base: Lens, blocksOf: (p: Params) => readonly CardTier[]): Lens {
  const plan = (p: Params, b: Board): Plan | null => {
    const dealt = tiersOf(p);
    if (!dealt.length) return null;
    const blocks = blocksOf(p), baseArity = base.components(baseParams(p), b).length;
    if (blocks.length !== dealt.length) return null;
    const tiers: PlannedTier[] = [];
    let index = baseArity;
    for (let i = 0; i < dealt.length; i++) {
      const lens = Object.hasOwn(TIER_LENSES, dealt[i].id) ? TIER_LENSES[dealt[i].id] : undefined, block = blocks[i];
      // The tiers follow the whole base, in order (the gated and plain compositions).
      if (!lens || dealt[i].compose || block.id !== dealt[i].id || block.index !== index) return null;
      tiers.push({ block, value: tierValue(dealt[i]), lens, key: `tier${block.index}` });
      index += block.arity;
    }
    return { arity: index, tiers };
  };
  const pad = (points: readonly number[], at: number, arity: number) => { const out = new Array<number>(arity).fill(0); points.forEach((x, k) => { out[at + k] = x; }); return out; };
  const reached = (parts: readonly Part[]) => parts.reduce((s, part) => s + part.points[0], 0);
  /** A tier's units as parts of the whole explanation. */
  const tierParts = (t: PlannedTier, b: Board, arity: number): Part[] => t.lens.parts(t.value, b).map(part => ({
    ...part, id: `${t.key}:${part.id}`, group: `${t.key}:${part.group ?? "unit"}`, points: pad(part.points, t.block.index, arity),
    facts: part.facts.map(f => ({ ...f, tier: t.block.index + (f.tier ?? 0) })),
  }));
  const baseUnit = (p: Params, b: Board, baseParts: readonly Part[]) => base.breakdown(baseParams(p), b, baseParts).unit;

  return {
    familyId: base.familyId,
    components(p, b) {
      const pl = plan(p, b), names = base.components(baseParams(p), b);
      return pl ? [...names, ...pl.tiers.flatMap(t => t.lens.components(t.value, b))] : names;
    },
    parts(p, b) {
      const pl = plan(p, b), baseParts = base.parts(baseParams(p), b);
      if (!pl) return baseParts;
      const got = reached(baseParts);
      return [
        ...baseParts.map(part => ({ ...part, points: pad(part.points, 0, pl.arity) })),
        ...pl.tiers.filter(t => got >= t.block.gate).flatMap(t => tierParts(t, b, pl.arity)),
      ];
    },
    breakdown(p, b, parts) {
      const pl = plan(p, b);
      if (!pl) return base.breakdown(baseParams(p), b, parts);
      // The base's own tally of its own units, padded; then one line per tier that scores.
      const baseParts = base.parts(baseParams(p), b), own = base.breakdown(baseParams(p), b, baseParts);
      const items: BreakdownItem[] = own.items.map(it => ({ text: it.text, points: pad(it.points, 0, pl.arity) }));
      for (const t of pl.tiers) {
        const hits = parts.filter(part => part.id.startsWith(`${t.key}:`) && part.points.some(x => x !== 0));
        if (!hits.length) continue;
        items.push({ text: `★ ${count(hits.length, t.lens.unit[0], t.lens.unit[1])} ${t.lens.hit(t.value, b)}`, points: hits[0].points.map((_, k) => hits.reduce((s, part) => s + part.points[k], 0)) });
      }
      return { unit: own.unit, items };
    },
    hover(p, b) {
      const pl = plan(p, b), bp = baseParams(p);
      if (!pl) return base.hover ? base.hover(bp, b) : defaultGeometry(base.parts(bp, b));
      const baseParts = base.parts(bp, b);
      // A base with one unnamed mode is named after its unit, so the toggle reads [Opposite pairs | ★ Rows | …].
      const own = base.hover ? base.hover(bp, b).modes : defaultGeometry(baseParts).modes.map(m => ({ ...m, label: capital(baseUnit(p, b, baseParts)[1]) }));
      return { modes: [...own, ...pl.tiers.flatMap(t => t.lens.modes.map(m => ({ id: `${t.key}:${m.id}`, label: `★ ${m.label}`, groups: m.groups.map(g => `${t.key}:${g}`) })))] };
    },
    tiers(p, b) {
      const pl = plan(p, b);
      if (!pl) return undefined;
      const baseParts = base.parts(baseParams(p), b), got = reached(baseParts), [one, many] = baseUnit(p, b, baseParts);
      return pl.tiers.map((t): TierStatus => {
        const short = Math.max(0, t.block.gate - got), names = t.lens.components(t.value, b).join(", ");
        return {
          id: t.block.id, index: t.block.index, arity: t.block.arity, gate: t.block.gate, open: short === 0, short,
          note: short === 0 ? `★ Open: ${names}.` : `${count(short, `more ${one}`, `more ${many}`)} to open ★: ${names}.`,
        };
      });
    },
    ...(base.seeds ? { seeds: (p: Params, b: Board) => base.seeds!(baseParams(p), b) } : {}),
  };
}
