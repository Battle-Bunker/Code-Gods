/**
 * The pegboard scene (Exact Change's coins: a·x + b·y = N): a board of pegs at the whole points from 0 to 12 on each
 * axis, the line drawn across it, and the pegs it passes through lit: each lit peg (x, y) is a way to pay, x coins of
 * one kind and y of the other. The representation's own numbers (the bill, the ways, the smaller pile) are its
 * readouts; on a line that is not a coin line (a and b not both positive) the board says why.
 */
import { Qn, ref, type ElementRef, type ElementValue, type Q, type SceneData } from "@workspace/v2-core";
import { fmtValue } from "../format.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, elAttrs, key, Readouts } from "./common.tsx";

type Peg = Extract<SceneData, { kind: "pegboard" }>;
type Pt = { x: Q; y: Q };

/** The whole points of the window [lo, hi]² the line passes through. */
export function pegsOn(seg: { from: Pt; to: Pt }, lo: number, hi: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const dx = Qn.sub(seg.to.x, seg.from.x), dy = Qn.sub(seg.to.y, seg.from.y);
  for (let x = lo; x <= hi; x++) for (let y = lo; y <= hi; y++) {
    // (x − x1)·dy = (y − y1)·dx: on the line.
    const lhs = Qn.mul(Qn.sub(Qn.from(x), seg.from.x), dy), rhs = Qn.mul(Qn.sub(Qn.from(y), seg.from.y), dx);
    if (Qn.eq(lhs, rhs)) out.push({ x, y });
  }
  return out;
}

const W = 260, PAD = 18;

function Scene({ p }: { p: RenderProps<Peg> }) {
  const marks = compactMarks(p);
  const q = { ...p, marks };
  const [lo, hi] = p.scene.window;
  const line = p.values(p.scene.on);
  const ways = p.values(ref(p.rep, "ways", undefined, p.scene.on.site));
  const n = hi - lo, step = (W - 2 * PAD) / n;
  const sx = (x: number) => PAD + (x - lo) * step, sy = (y: number) => W - PAD - (y - lo) * step;
  // Lit pegs are ways to pay: none on a line that is not a coin line (a and b not both positive).
  const pegs = line.kind === "segment" && ways.kind !== "undefined" ? pegsOn(line, lo, hi) : [];
  const on = new Set(pegs.map(g => `${g.x},${g.y}`));
  // The line across the board: where it meets the window's edges.
  let seg: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (line.kind === "segment") {
    const N = (v: Q) => Number(v.n) / Number(v.d);
    const x1 = N(line.from.x), y1 = N(line.from.y), x2 = N(line.to.x), y2 = N(line.to.y);
    if (x1 === x2) seg = { x1: sx(x1), y1: sy(lo), x2: sx(x1), y2: sy(hi) };
    else {
      const m = (y2 - y1) / (x2 - x1), at = (x: number) => y1 + m * (x - x1);
      seg = { x1: sx(lo), y1: sy(at(lo)), x2: sx(hi), y2: sy(at(hi)) };
    }
  }
  const placed = new Set<string>([key(p.scene.on)]);
  return (
    <>
      <svg className="v2v-pegboard" viewBox={`0 0 ${W} ${W}`} role="img" aria-label={pegText(p.scene, p.values, p.rep)}>
        <defs><clipPath id="v2v-peg-clip"><rect x={PAD / 2} y={PAD / 2} width={W - PAD} height={W - PAD} /></clipPath></defs>
        {Array.from({ length: n + 1 }, (_, i) => lo + i).flatMap(x => Array.from({ length: n + 1 }, (_, j) => lo + j).map(y => (
          <circle key={`${x},${y}`} className="peg" data-on={on.has(`${x},${y}`) ? "" : undefined} cx={sx(x)} cy={sy(y)} r={on.has(`${x},${y}`) ? 4.5 : 1.8}>
            {on.has(`${x},${y}`) && <title>{`${x} and ${y}`}</title>}
          </circle>
        )))}
        {seg && <line {...elAttrs(q, p.scene.on)} className="line" clipPath="url(#v2v-peg-clip)" {...seg} />}
        <text className="tick-label" x={sx(hi)} y={W - 3} textAnchor="end">{hi}</text>
        <text className="tick-label" x={3} y={sy(hi) + 4}>{hi}</text>
      </svg>
      {ways.kind === "undefined" && <div className="v2v-undef">{ways.reason}</div>}
      <Readouts p={q} placed={placed} />
    </>
  );
}

function pegText(scene: Peg, values: (r: ElementRef) => ElementValue, rep: string): string {
  const site = scene.on.site;
  const ways = values(ref(rep, "ways", undefined, site)), bill = values(ref(rep, "bill", undefined, site));
  if (ways.kind === "undefined") return ways.reason;
  return `the bill ${fmtValue(bill)}: ${fmtValue(ways)} ${fmtValue(ways) === "1" ? "way" : "ways"} to pay`;
}

export const pegboardRenderer: SceneRenderer<Peg> = {
  kind: "pegboard",
  box: { compact: { w: 160, h: 160 }, expanded: { w: 260, h: 260 } },
  render: p => <Scene p={p} />,
  text: pegText,
};
