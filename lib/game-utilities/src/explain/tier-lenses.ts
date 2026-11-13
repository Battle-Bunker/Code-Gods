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
import { MORE_TIER_LENSES } from "./tier-lenses-more.ts";
import { count, type Lens } from "./lens.ts";
import type { BreakdownItem, Cell, Part, TierStatus } from "./model.ts";
import { defaultGeometry, type HoverMode } from "./units.ts";
import { courtScore, courtSquares, noKingPenalty } from "../families/grid/layered/royal_court.ts";

/** One interaction's annotation: its units on a board, each scoring the tier's own components. */
export interface TierLens {
  /** What each of the tier's components counts: ["rows, columns and long diagonals adding up to 18"]. */
  components(v: TierValue, b: Board): string[];
  /** The tier's unit, for the raw-score breakdown: [one, many]. */
  readonly unit: readonly [one: string, many: string];
  /** What a scoring unit does, after its count: "adding up to 18" ("" when the unit's name says it all). */
  hit(v: TierValue, b: Board): string;
  /**
   * Every unit the tier looks at, scoring or not (a near miss says how far it is). `points` are the tier's own
   * components; `group` is one of the modes' groups; ids are unique within the tier. `base` is the draw's base params
   * (the base's vocabulary: which lines can be mirrors, which boxes hold a king).
   */
  parts(v: TierValue, b: Board, base: Params): Part[];
  /** How the board picks the tier's units: one mode per kind of unit that overlaps another kind. */
  readonly modes: readonly HoverMode[];
}

const num = (v: TierValue, k: string) => v[k] as number;

/**
 * How close a unit that scores nothing is, for `Part.heat`. A unit may have to meet several conditions in turn (these
 * two boxes must share exactly one pair, and then add up to x): `met` of `conditions` already hold and the next is
 * `away` off. Meeting one more condition always beats closing a gap, so a search that follows heat uphill never trades
 * the link away to bring the sum nearer.
 */
export const heatOf = (away: number, met = 0, conditions = 1): number =>
  (met + 1 / (1 + Math.max(0, away))) / (conditions + 1);

/** A set of cells against a total: a point when it adds up to it, else how far off it is. */
function sumUnit(b: Board, x: number, id: string, group: string, shape: Part["shape"], name: string, cells: Cell[]): Part {
  const total = cells.reduce((s, c) => s + b.value(c), 0), gap = total - x;
  const sum = `${cells.map(c => b.glyph(c)).join(" + ")} = ${total}`;
  return {
    id, group, shape, cells, points: [gap === 0 ? 1 : 0], heat: heatOf(Math.abs(gap)),
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

// ---- 🪞 Mirrormancer's tiers (families/grid/layered/mirror-tiers.ts) ----

/**
 * One unit per line that can be a mirror (the base's rows or columns). A mirror that passes `test` scores 1 the first
 * time its reading appears and 0 when an earlier line reads the same (the card counts different mirrors).
 */
function mirrorUnits(b: Board, base: Params, test: (numbers: number[]) => { ok: boolean; fact: string; miss?: string; away?: number }, hit: string): Part[] {
  const rows = base.axis !== "TB", kind = rows ? "Row" : "Column", seen = new Map<string, number>();
  return Array.from({ length: b.N }, (_, i): Part => {
    const cells = rows ? b.row(i) : b.column(i), numbers = cells.map(c => b.value(c)), read = cells.map(c => b.glyph(c)).join(" ");
    const unit = { id: `mirror:${i}`, group: "mirror", shape: "line" as const, cells };
    // A line that does not read the same both ways is as far from the tier as the cells that break it (heat ≤ 1/2).
    const broken = numbers.filter((n, k) => n !== numbers[numbers.length - 1 - k]).length;
    if (broken) return { ...unit, points: [0], heat: heatOf(broken, 0, 2), title: `${kind} ${i + 1} is not a mirror`, facts: [{ text: `${read} does not read the same both ways`, ok: false }] };
    const { ok, fact, miss, away } = test(numbers), key = numbers.join(" "), first = seen.get(key);
    if (!ok) return { ...unit, points: [0], heat: heatOf(away ?? 1, 1, 2), title: `${kind} ${i + 1}: a mirror, but ${miss}`, facts: [{ text: fact, ok: false }] };
    if (first !== undefined) {
      return { ...unit, points: [0], heat: heatOf(2, 1, 2), title: `${kind} ${i + 1} repeats ${kind.toLowerCase()} ${first + 1}`, facts: [{ text: fact, ok: true }, { text: `${read} is already counted: the same mirror counts once`, ok: false }] };
    }
    seen.set(key, i);
    return { ...unit, points: [1], title: `${kind} ${i + 1}: a mirror ${hit}`, facts: [{ text: fact, ok: true }] };
  });
}
const MIRROR_MODES: readonly HoverMode[] = [{ id: "mirror", label: "Mirrors", groups: ["mirror"] }];

/** "holding": each different mirror holding exactly two ys. */
const holding: TierLens = {
  components: v => [`different mirrors holding exactly two ${num(v, "y")}s`],
  unit: ["different mirror", "different mirrors"],
  hit: v => `holding exactly two ${num(v, "y")}s`,
  parts: (v, b, base) => {
    const y = num(v, "y");
    return mirrorUnits(b, base, numbers => {
      const held = numbers.filter(n => n === y).length;
      return { ok: held === 2, away: Math.abs(held - 2), fact: held === 2 ? `holds exactly two ${y}s` : `holds ${held === 0 ? "no" : held} ${y}${held === 1 ? "" : "s"}, not two`, miss: `without exactly two ${y}s` };
    }, `holding exactly two ${y}s`);
  },
  modes: MIRROR_MODES,
};

/** "halves": each different mirror whose half adds up to x with two different numbers. */
const halves: TierLens = {
  components: v => [`different mirrors whose half adds up to ${num(v, "x")}`],
  unit: ["different mirror", "different mirrors"],
  hit: v => `whose half adds up to ${num(v, "x")}`,
  parts: (v, b, base) => {
    const x = num(v, "x");
    return mirrorUnits(b, base, numbers => {
      const half = numbers.slice(0, Math.floor(numbers.length / 2)), total = half.reduce((s, n) => s + n, 0);
      const sum = `${half.join(" + ")} = ${total}`, different = half.some(n => n !== half[0]);
      if (total !== x) return { ok: false, away: Math.abs(total - x), fact: `its half: ${sum}, not ${x}`, miss: `its half does not add up to ${x}` };
      return different ? { ok: true, fact: `its half: ${sum}` } : { ok: false, away: 1, fact: `its half: ${sum}, but the numbers are not different`, miss: "its half is one number repeated" };
    }, `whose half adds up to ${x}`);
  },
  modes: MIRROR_MODES,
};

// ---- 🫅 Kings and Subjects' tiers (families/grid/layered/court-tiers.ts) ----

/** The base's vocabulary on a board: the king of each court and the courts' other cells, in the card's order. */
function courts(b: Board): { kings: Cell[]; subjects: Cell[] } {
  const kings: Cell[] = [], subjects: Cell[] = [], noKing = noKingPenalty(b.spec);
  for (const { r, c } of courtSquares(b.N, "corners")) {
    const cells = [b.cells[r * b.N + c], b.cells[r * b.N + c + 1], b.cells[(r + 1) * b.N + c], b.cells[(r + 1) * b.N + c + 1]];
    const { score, king } = courtScore(cells.map(x => b.value(x)), noKing);
    if (score[0] !== 1) continue;
    kings.push(cells[king]);
    subjects.push(...cells.filter((_, i) => i !== king));
  }
  return { kings, subjects };
}

/** Every path from `from` to `to` that moves side by side and always gets closer, both ends included. */
function walks(b: Board, from: Cell, to: Cell): Cell[][] {
  if (from.r === to.r && from.c === to.c) return [[from]];
  const out: Cell[][] = [], at = (r: number, c: number) => b.cells[r * b.N + c];
  if (from.r !== to.r) for (const rest of walks(b, at(from.r + Math.sign(to.r - from.r), from.c), to)) out.push([from, ...rest]);
  if (from.c !== to.c) for (const rest of walks(b, at(from.r, from.c + Math.sign(to.c - from.c)), to)) out.push([from, ...rest]);
  return out;
}

/**
 * "pairs": each pair of kings joined by a path whose numbers in between add up to x. One unit per pair of kings that
 * do not touch, drawn as the path that counts (or the one that comes nearest). Paths cross, so each unit is picked on
 * the board by one cell of its own (`anchor`): a cell between its kings where one is free.
 */
const pairs: TierLens = {
  components: v => [`pairs of kings with ${num(v, "x")} between them`],
  unit: ["pair of kings", "pairs of kings"],
  hit: v => `with a path adding up to ${num(v, "x")} between them`,
  parts: (v, b) => {
    const x = num(v, "x"), { kings } = courts(b), out: Part[] = [], taken = new Set<Cell>();
    for (let i = 0; i < kings.length; i++) for (let j = i + 1; j < kings.length; j++) {
      const a = kings[i], z = kings[j];
      if (Math.abs(a.r - z.r) + Math.abs(a.c - z.c) < 2) continue; // touching kings have nothing in between
      const between = (path: Cell[]) => path.slice(1, -1).reduce((s, c) => s + b.value(c), 0);
      const all = walks(b, a, z), good = all.filter(path => between(path) === x);
      const path = good[0] ?? all.reduce((best, p) => (Math.abs(between(p) - x) < Math.abs(between(best) - x) ? p : best));
      const inner = path.slice(1, -1), total = between(path), ok = good.length > 0;
      const anchor = [...inner, a, z, ...b.cells].find(c => !taken.has(c))!;
      taken.add(anchor);
      const names = `kings ${b.glyph(a)} and ${b.glyph(z)}`, sum = `${inner.map(c => b.glyph(c)).join(" + ")} = ${total}`;
      out.push({
        id: `pair:${a.r},${a.c}-${z.r},${z.c}`, group: "pair", shape: "region", cells: path, anchor, points: [ok ? 1 : 0],
        heat: heatOf(Math.abs(total - x)),
        title: ok ? `${names}: ${x} between them` : `${names}: no path with ${x} between them`,
        facts: [{ text: ok ? `in between: ${sum}` : `the nearest path: ${sum}, not ${x}`, ok }],
        spots: [{ cell: a, label: "king", tone: ok ? "gain" : "zero" }, { cell: z, label: "king", tone: ok ? "gain" : "zero" }],
      });
    }
    return out;
  },
  modes: [{ id: "pair", label: "Pairs of kings", groups: ["pair"] }],
};

/**
 * "sameRoads": each road of subjects showing one number, of exactly y subjects. One unit per road of two or more
 * subjects, and per lone subject when y is 1 (a road that is too short or too long says so).
 */
const sameRoads: TierLens = {
  components: v => [`same-number roads of exactly ${num(v, "y")} subjects`],
  unit: ["same-number road", "same-number roads"],
  hit: v => `of exactly ${num(v, "y")} subjects`,
  parts: (v, b) => {
    const y = num(v, "y"), subjects = new Set(courts(b).subjects), out: Part[] = [];
    const roads = b.regions((p, q) => subjects.has(p) && subjects.has(q) && b.value(p) === b.value(q));
    for (const road of roads) {
      if (!subjects.has(road[0]) || (road.length < 2 && y !== 1)) continue;
      const ok = road.length === y, shows = b.glyph(road[0]);
      out.push({
        id: `road:${road[0].r},${road[0].c}`, group: "road", shape: "region", cells: road, points: [ok ? 1 : 0],
        heat: heatOf(Math.abs(road.length - y)),
        title: ok ? `a road of ${y} subjects showing ${shows}` : `a road of ${road.length} subjects showing ${shows}: not ${y}`,
        facts: [{ text: `${count(road.length, "subject")} showing ${shows} ${road.length === 1 ? "stands alone" : "touch side by side"}`, ok }],
      });
    }
    return out;
  },
  modes: [{ id: "road", label: "Roads", groups: ["road"] }],
};

/** The tier lenses, by interaction id. */
/** One lens per interaction id; the Two Pair ones live beside, in ./tier-lenses-more.ts. */
export const TIER_LENSES: Readonly<Record<string, TierLens>> = Object.freeze({ lines, squares, holding, halves, pairs, sameRoads, ...MORE_TIER_LENSES });

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
/**
 * Whether a tiered draw's units can add up to its ordinal at all. The "unlock" composition's first component is
 * `min(base, gate)`, a clamp and not a sum of units, so no additive annotation can verify against it; an interaction
 * with no tier lens cannot be drawn either. Such a draw is annotated like a family without a lens: the example board
 * and its score, no units (explain/index.ts).
 */
export const explainableTiers = (p: Params): boolean =>
  tiersOf(p).every(t => !t.compose && Object.hasOwn(TIER_LENSES, t.id));

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
  const tierParts = (t: PlannedTier, b: Board, arity: number, bp: Params): Part[] => t.lens.parts(t.value, b, bp).map(part => ({
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
        ...pl.tiers.filter(t => got >= t.block.gate).flatMap(t => tierParts(t, b, pl.arity, baseParams(p))),
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
