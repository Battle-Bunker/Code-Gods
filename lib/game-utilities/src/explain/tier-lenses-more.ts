/**
 * More tier lenses (see ./tier-lenses.ts: one per interaction id, with the shape of an entry of `TIER_LENSES`): the
 * interactions of ✌️ Two Pair's tiers (families/grid/layered/pair-tiers.ts).
 *   - "links", "linkSums", "linksVia": one unit per pair of boxes that share a border (8 cells), scoring when exactly
 *     one number is a pair in both (and, for the last two, when the total or the shared number is the dealt one);
 *   - "equalRoads": one unit per road of equal numbers, scoring when it has exactly y cells.
 * To be registered in `TIER_LENSES` (spread `MORE_TIER_LENSES` into it).
 */
import type { TierValue } from "../families/grid/tiers.ts";
import type { Board } from "./board.ts";
import type { Cell, Fact, Part } from "./model.ts";
import { heatOf, type TierLens } from "./tier-lenses.ts";

const num = (v: TierValue, k: string) => v[k] as number;

/** The numbers a box shows exactly twice (the card's `pairsIn`), in reading order. */
function pairsIn(b: Board, box: readonly Cell[]): number[] {
  const out: number[] = [];
  for (const x of box) {
    const n = b.value(x);
    if (!out.includes(n) && box.filter(y => b.value(y) === n).length === 2) out.push(n);
  }
  return out;
}
const boxAt = (r: number, c: number): Cell[] => [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }];
const list = (ns: readonly number[]) => (ns.length === 0 ? "no pair" : ns.length === 1 ? `a pair of ${ns[0]}s` : `pairs of ${ns[0]}s and ${ns[1]}s`);

/** What a link must also be, for the tiers that count only some links. */
interface LinkTest { readonly ok: boolean; readonly fact: Fact; readonly miss: string; readonly away?: number }

function linkLens(what: (v: TierValue) => string, test: (v: TierValue, b: Board, cells: readonly Cell[], shared: number) => LinkTest | null): TierLens {
  return {
    components: v => [`linked boxes${what(v)}`],
    unit: ["link", "links"],
    hit: v => `between boxes that share exactly one pair${what(v)}`,
    parts: (v, b) => {
      const out: Part[] = [];
      for (let r = 0; r + 1 < b.N; r += 2) for (let c = 0; c + 1 < b.N; c += 2) {
        for (const [dr, dc, group] of [[0, 2, "across"], [2, 0, "down"]] as const) {
          if (!b.inside(r + dr + 1, c + dc + 1)) continue;
          const mine = boxAt(r, c), next = boxAt(r + dr, c + dc), cells = [...mine, ...next];
          const a = pairsIn(b, mine), z = pairsIn(b, next), shared = a.filter(n => z.includes(n));
          const linked = shared.length === 1, more = linked ? test(v, b, cells, shared[0]) : null;
          const facts: Fact[] = [{
            text: linked ? `both boxes hold a pair of ${shared[0]}s, and no other pair in common`
              : shared.length === 2 ? `the boxes share both pairs (${shared[0]}s and ${shared[1]}s): a link shares exactly one`
                : `one box holds ${list(a)}, the other ${list(z)}: no pair in common`,
            ok: linked,
          }];
          if (more) facts.push(more.fact);
          const ok = linked && (more?.ok ?? true);
          // How close this pair of boxes is to a link that counts: the pairs they must come to share, then the test's own gap.
          // Two stages when the tier asks for more than a link: first share exactly one pair, then meet that test.
          const stages = more || !linked ? 2 : 1;
          const heat = linked
            ? heatOf(more?.away ?? 0, 1, stages)
            : heatOf(Math.abs(shared.length - 1) + (a.length === 0 || z.length === 0 ? 1 : 0), 0, stages);
          out.push({
            id: `link:${r},${c}:${group}`, group, shape: "block", cells, points: [ok ? 1 : 0], facts, heat,
            title: ok ? `linked by the ${shared[0]}s` : linked ? `linked by the ${shared[0]}s, but ${more!.miss}` : "not linked",
          });
        }
      }
      return out;
    },
    modes: [
      { id: "across", label: "Side by side", groups: ["across"] },
      { id: "down", label: "Above and below", groups: ["down"] },
    ],
  };
}

const links = linkLens(() => "", () => null);
const linkSums = linkLens(v => ` adding up to ${num(v, "x")}`, (v, b, cells) => {
  const x = num(v, "x"), total = cells.reduce((s, c) => s + b.value(c), 0), gap = total - x;
  return {
    ok: gap === 0, away: Math.abs(gap), miss: `${Math.abs(gap)} ${gap < 0 ? "short of" : "over"} ${x}`,
    fact: { text: gap === 0 ? `the two boxes add up to ${total}` : `the two boxes add up to ${total}, not ${x}`, ok: gap === 0 },
  };
});
const linksVia = linkLens(v => ` whose shared number is ${num(v, "y")}`, (v, _b, _cells, shared) => {
  const y = num(v, "y");
  return {
    ok: shared === y, away: 1, miss: `not by ${y}s`,
    fact: { text: shared === y ? `the shared number is ${y}` : `the shared number is ${shared}, not ${y}`, ok: shared === y },
  };
});

/** "equalRoads": each road of equal numbers (side by side) with exactly y cells. */
const equalRoads: TierLens = {
  components: v => [`roads of exactly ${num(v, "y")} equal numbers`],
  unit: ["road", "roads"],
  hit: v => `of exactly ${num(v, "y")} equal numbers`,
  parts: (v, b) => {
    const y = num(v, "y");
    return b.regions((p, q) => b.value(p) === b.value(q)).map(road => {
      const n = road.length, first = road[0], ok = n === y;
      return {
        id: `road:${first.r},${first.c}`, group: "road", shape: "region" as const, cells: road, points: [ok ? 1 : 0], heat: heatOf(Math.abs(n - y)),
        title: ok ? `a road of ${n} ${b.glyph(first)}s` : n === 1 ? `a lone ${b.glyph(first)}` : `a road of ${n} ${b.glyph(first)}s, not ${y}`,
        facts: [{ text: n === 1 ? `one ${b.glyph(first)} with no equal number beside it` : `${n} ${b.glyph(first)}s joined side by side${ok ? "" : `: ${Math.abs(n - y)} ${n < y ? "short of" : "over"} ${y}`}`, ok }],
      };
    });
  },
  modes: [{ id: "road", label: "Roads", groups: ["road"] }],
};

/** By interaction id, as `TIER_LENSES` is keyed. */
export const MORE_TIER_LENSES: Readonly<Record<string, TierLens>> = Object.freeze({ links, linkSums, linksVia, equalRoads });
