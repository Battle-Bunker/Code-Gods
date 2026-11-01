/** 🤝 Number Bonds: touching pairs (right and down) whose numbers make the target. */
import { lens } from "../lens.ts";
import type { Fact, Part } from "../model.ts";

type P = { mode: "any" | "same" | "different" };

export const numberBonds = lens<P>({
  familyId: "number_bonds",
  components: () => ["best friends"],
  parts: (p, b) => {
    const T = b.spec.vmax + 1, out: Part[] = [];
    for (const x of b.cells) {
      for (const [name, y] of [["right", { r: x.r, c: x.c + 1 }], ["down", { r: x.r + 1, c: x.c }]] as const) {
        if (!b.inside(y.r, y.c)) continue;
        const sum = b.value(x) + b.value(y);
        const facts: Fact[] = [{ text: sum === T ? `${b.glyph(x)} + ${b.glyph(y)} = ${T}` : `${b.glyph(x)} + ${b.glyph(y)} = ${sum}, not ${T}`, ok: sum === T }];
        if (p.mode === "same") facts.push({ text: b.col(x) === b.col(y) ? `same colour (${b.colour(x)})` : `different colours (${b.colour(x)}, ${b.colour(y)})`, ok: b.col(x) === b.col(y) });
        if (p.mode === "different") facts.push({ text: b.col(x) !== b.col(y) ? `different colours (${b.colour(x)}, ${b.colour(y)})` : `same colour (${b.colour(x)})`, ok: b.col(x) !== b.col(y) });
        const bond = facts.every(f => f.ok);
        out.push({ id: `pair:${x.r},${x.c}:${name}`, shape: "pair", cells: [x, y], points: [bond ? 1 : 0], title: bond ? "best friends" : "not best friends", facts });
      }
    }
    return out;
  },
});
