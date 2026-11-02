/** 🖼️ Picture Frame: all or nothing over the edge ring. Inside cells never matter. */
import { lens } from "../lens.ts";
import type { Part } from "../model.ts";

type P = { X: number };

export const pictureFrame = lens<P>({
  familyId: "picture_frame",
  components: () => ["frame"],
  parts: (p, b) => {
    const edge = b.cells.filter(x => b.isEdge(x)), name = b.spec.colourNames[p.X];
    const breakers = edge.filter(x => b.col(x) !== p.X), whole = breakers.length === 0;
    return [{
      id: "frame", shape: "ring", cells: edge, points: [whole ? 1 : 0],
      title: whole ? `a complete ${name} frame` : "the frame is broken",
      facts: [{ text: `${edge.length - breakers.length} of ${edge.length} edge cells are ${name}`, ok: whole }],
      spots: breakers.map(cell => ({ cell, label: `not ${name}`, tone: "zero" as const })),
    }];
  },
  select: parts => parts.slice(),
  note: (_parts, focus, p, b) => {
    const name = b.spec.colourNames[p.X];
    if (!b.isEdge(focus)) return "This cell is inside the frame: it never changes your score.";
    return b.col(focus) === p.X ? `This edge cell is ${name}: it helps close the frame.` : `This edge cell is ${b.colour(focus)}: it breaks the frame.`;
  },
});
