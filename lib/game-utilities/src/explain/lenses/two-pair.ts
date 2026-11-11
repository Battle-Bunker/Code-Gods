/**
 * ✌️ Two Pair: one unit per 2×2 box that tiles the board (the 4 corner boxes on 4×4). Two different pairs score a
 * primary point; one pair or three of a kind a secondary point; no pair and four of a kind nothing. The boxes don't
 * overlap, so the board picks the box under the pointer.
 */
import { lens, tally, count } from "../lens.ts";
import type { Board } from "../board.ts";
import type { Cell, Fact, Part } from "../model.ts";

type P = Record<string, never>;

/** The box's numbers grouped by value, in reading order of first appearance: [["4", "4"], ["2"], ["5"]], biggest group first. */
function groups(b: Board, cells: readonly Cell[]): string[][] {
  const by = new Map<number, string[]>();
  for (const x of cells) by.set(b.value(x), [...(by.get(b.value(x)) ?? []), b.glyph(x)]);
  return [...by.values()].sort((x, y) => y.length - x.length);
}

/** What a box is, its points tuple and its facts (in the card's words, with the box's own numbers). */
function judge(g: string[][]): { title: string; points: [number, number]; facts: Fact[] } {
  const shape = g.map(x => x.length).join(" "), joined = (x: string[]) => x.join(" ");
  const rest = (from: number) => g.slice(from).map(x => x[0]);
  const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0]);
  switch (shape) {
    case "2 2": return { title: "two pairs", points: [1, 0], facts: [{ text: `two pairs: ${joined(g[0])} and ${joined(g[1])}`, ok: true }] };
    case "2 1 1": return { title: "one pair", points: [0, 1], facts: [
      { text: `only one pair: ${joined(g[0])}, then ${and(rest(1))}`, ok: false }, { text: `one pair (${joined(g[0])})`, ok: true, tier: 1 }] };
    case "3 1": return { title: "three of a kind", points: [0, 1], facts: [
      { text: `three of a kind: ${joined(g[0])}, then ${and(rest(1))}`, ok: false }, { text: `three of a kind (${joined(g[0])})`, ok: true, tier: 1 }] };
    case "4": return { title: "four of a kind", points: [0, 0], facts: [{ text: `four of a kind: ${joined(g[0])} scores nothing`, ok: false }] };
    default: return { title: "no pair", points: [0, 0], facts: [{ text: `no pair: ${and(rest(0))} all differ`, ok: false }] };
  }
}

export const twoPair = lens<P>({
  familyId: "two_pair",
  components: () => ["boxes with two different pairs", "boxes with one pair or three of a kind"],
  breakdown: (_p, _b, parts) => ({
    unit: ["two-pair box", "two-pair boxes"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: n => `${count(n, "box", "boxes")} with two different pairs` },
      { of: t => t.points[1] > 0, text: n => `${count(n, "box", "boxes")} with one pair or three of a kind` },
      { of: () => true, text: n => `${count(n, "box", "boxes")} with no pair, or four of a kind: worth nothing` },
    ]),
  }),
  parts: (_p, b) => {
    const out: Part[] = [];
    for (let r = 0; r + 1 < b.N; r += 2) for (let c = 0; c + 1 < b.N; c += 2) {
      const cells = [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }];
      out.push({ id: `box:${r},${c}`, shape: "block", group: "box", cells, ...judge(groups(b, cells)) });
    }
    return out;
  },
});
