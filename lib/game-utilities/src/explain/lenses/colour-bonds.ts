/** 🎨 Colour Bonds: touching pairs (right and down) whose numbers make the target and whose colours are the same. */
import { lens, tally, count } from "../lens.ts";
import type { Fact, Part } from "../model.ts";

type P = Record<string, never>;

export const colourBonds = lens<P>({
  familyId: "colour_bonds",
  components: () => ["best friends"],
  breakdown: (_p, b, parts) => ({
    unit: ["best-friend pair", "best-friend pairs"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: n => `${count(n, "best-friend pair")} (touching, adding to ${b.spec.vmax + 1}, the same colour)` },
      { of: () => true, text: n => `${count(n, "other touching pair")}, not best friends` },
    ]),
  }),
  parts: (_p, b) => {
    const T = b.spec.vmax + 1, out: Part[] = [];
    for (const x of b.cells) {
      for (const [name, y] of [["right", { r: x.r, c: x.c + 1 }], ["down", { r: x.r + 1, c: x.c }]] as const) {
        if (!b.inside(y.r, y.c)) continue;
        const sum = b.value(x) + b.value(y), same = b.col(x) === b.col(y);
        const facts: Fact[] = [
          { text: sum === T ? `${b.glyph(x)} + ${b.glyph(y)} = ${T}` : `${b.glyph(x)} + ${b.glyph(y)} = ${sum}, not ${T}`, ok: sum === T },
          { text: same ? `same colour (${b.colour(x)})` : `different colours (${b.colour(x)}, ${b.colour(y)})`, ok: same },
        ];
        const bond = facts.every(f => f.ok);
        out.push({ id: `pair:${x.r},${x.c}:${name}`, shape: "pair", group: "pair", cells: [x, y], points: [bond ? 1 : 0], title: bond ? "best friends" : "not best friends", facts });
      }
    }
    return out;
  },
});
