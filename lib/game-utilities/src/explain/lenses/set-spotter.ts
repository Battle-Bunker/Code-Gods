/** 🔺 Set Spotter: trios in a line. The focus expands the trios that END at it (a middle cell is another cell's end). */
import { lens, tally, count } from "../lens.ts";
import type { Board } from "../board.ts";
import type { Cell, Fact, Part } from "../model.ts";

type P = Record<string, never>;
const DIRS = [["right", 0, 1], ["down", 1, 0], ["down-right", 1, 1], ["down-left", 1, -1]] as const;
/** The hover toggle: one mode per line direction (trios of different directions share centres). */
const ARROWS: Readonly<Record<string, string>> = { right: "→", down: "↓", "down-right": "↘", "down-left": "↙" };

function colourFact(b: Board, t: readonly Cell[]): Fact {
  const names = t.map(x => b.colour(x)), distinct = new Set(names).size;
  if (distinct === 1) return { text: `colours all the same (${names[0]})`, ok: true };
  if (distinct === 3) return { text: `${b.say.distinctColours(3)} used (${names.join(", ")})`, ok: true };
  return { text: `two colours match and one doesn't (${names.join(", ")})`, ok: false };
}
function numberFact(b: Board, t: readonly Cell[]): Fact {
  const v = t.map(x => b.value(x)), shown = t.map(x => b.glyph(x)).join(", ");
  const d1 = v[1] - v[0], d2 = v[2] - v[1];
  const word = b.spec.cards ? "values" : "numbers";
  if (d1 === 0 && d2 === 0) return { text: `${word} all the same (${shown})`, ok: true };
  if (d1 === d2) return { text: `${word} evenly spaced (${shown}: ${d1 > 0 ? "+" : "−"}${Math.abs(d1)} each step)`, ok: true };
  return { text: `${word} not evenly spaced (${shown})`, ok: false };
}

export const setSpotter = lens<P>({
  familyId: "set_spotter",
  components: () => ["SETs"],
  breakdown: (_p, _b, parts) => ({
    unit: ["SET", "SETs"],
    items: tally(parts, [
      { of: t => t.points[0] > 0, text: n => `${count(n, "SET")} (colours and numbers both fit)` },
      { of: () => true, text: n => `${count(n, "trio")} that ${n === 1 ? "is" : "are"} not a SET` },
    ]),
  }),
  parts: (_p, b) => {
    const out: Part[] = [];
    for (const x of b.cells) {
      for (const [name, dr, dc] of DIRS) {
        if (!b.inside(x.r + 2 * dr, x.c + 2 * dc)) continue;
        const t = [x, { r: x.r + dr, c: x.c + dc }, { r: x.r + 2 * dr, c: x.c + 2 * dc }];
        const facts = [colourFact(b, t), numberFact(b, t)];
        const set = facts.every(f => f.ok);
        out.push({ id: `trio:${x.r},${x.c}:${name}`, shape: "line", group: name, cells: t, points: [set ? 1 : 0], title: set ? "SET" : "not a SET", facts });
      }
    }
    return out;
  },
  hover: () => ({ modes: DIRS.map(([name]) => ({ id: name, label: ARROWS[name], groups: [name] })) }),
});
