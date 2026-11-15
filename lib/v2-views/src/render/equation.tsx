/**
 * The equation scene (si, gen, crossing …): the template with each coordinate as an element node, written as
 * equation-text.ts writes it (signs folded, "−x", no "+ 0"). A coefficient of 1 a rule cites is shown, faint, so its
 * mark has a number to sit on; a term of 0 is left out, and a rule's mark on it is shown among the readouts.
 *
 * A worked equation (the crossing) also has steps, one line each, and a caption of words under them: "0 = 3x − 7",
 * "3x = 7", "x = 2⅓", then "nearest whole number 2, off by ⅓". A step that needs an element the line lacks (a vertical
 * line has no gradient) is left out, and so is a step that reads the same as the one before ("x = 4" twice); when the
 * last step itself is undefined, its sentence is the whole scene. A compact face shows the last step and the caption.
 */
import { Qn, type ElementRef } from "@workspace/v2-core";
import { fmtQ } from "../format.ts";
import { isWorked, lineText, pieces, text, worked, type Eq, type Piece } from "../equation-text.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, El, key, markState, Readouts } from "./common.tsx";

/** One line of an equation: its text with italic variables, its numbers as element nodes. */
function Line({ p, ps, label }: { p: RenderProps<Eq>; ps: Piece[]; label: string }) {
  return (
    <div className="v2v-eq-line" aria-label={label}>
      {ps.map((x, i) => x.kind === "text"
        ? <span key={i}>{x.text.split(/([a-z])/i).map((t, j) => (/^[a-z]$/i.test(t) ? <span key={j} className="v2v-var">{t}</span> : t))}</span>
        : (
          <El key={i} p={p} r={x.r}>
            {p.before && p.size === "expanded" ? <Was p={p} r={x.r} /> : null}
            {x.op}{x.mag}
            {/* A coefficient of 1 a rule cites carries its mark on the variable: no "1" is written (it read as "1x"). */}
            {x.variable && <span className="v2v-var">{x.variable}</span>}
          </El>
        ))}
    </div>
  );
}

function Template({ p }: { p: RenderProps<Eq> }) {
  const marks = compactMarks(p);
  const q = { ...p, marks };
  if (isWorked(p.scene)) return <WorkedScene p={q} />;
  const ps = pieces(p.scene.template, p.rep, p.values);
  if ("undefined" in ps) return <div className="v2v-undef">{ps.undefined}</div>;
  const placed = new Set(ps.flatMap(x => (x.kind === "el" ? [key(x.r)] : [])));
  return (
    <div className="v2v-eq">
      <Line p={q} ps={ps} label={lineText(ps)} />
      <Readouts p={q} placed={placed} />
    </div>
  );
}

function WorkedScene({ p }: { p: RenderProps<Eq> }) {
  const w = worked(p.scene, p.rep, p.values);
  if ("undefined" in w) return <div className="v2v-undef">{w.undefined}</div>;
  // A compact face shows the given lines (a system's equations, all of them) and the last worked step.
  const shown = w.lines.map((ps, i) => ({ ps, given: i < w.given }));
  const lines = p.size === "compact" ? shown.filter((x, i) => x.given || i === shown.length - 1) : shown;
  const placed = new Set([
    ...lines.flatMap(({ ps }) => ps.flatMap(x => (x.kind === "el" ? [key(x.r)] : []))),
    ...(w.caption ?? []).flatMap(x => (typeof x === "string" ? [] : [key(x.r)])),
  ]);
  return (
    <div className="v2v-eq" data-worked="" aria-label={text(p.scene, p.values, p.rep)}>
      <div className="v2v-eq-steps">
        {lines.map(({ ps, given }, i) => (
          <div key={i} className="v2v-eq-step" data-given={given ? "" : undefined} data-after-given={!given && i > 0 && lines[i - 1]!.given ? "" : undefined}>
            <Line p={p} ps={ps} label={lineText(ps)} />
          </div>
        ))}
      </div>
      {w.caption && (
        <div className="v2v-eq-caption">
          {w.caption.map((x, i) => (typeof x === "string" ? <span key={i}>{x}</span> : <El key={i} p={p} r={x.r}>{x.text}</El>))}
        </div>
      )}
      <Readouts p={p} placed={placed} />
    </div>
  );
}

/** The previous value, struck through, when it changed. */
function Was({ p, r }: { p: RenderProps; r: ElementRef }) {
  const b = p.before!(r), v = p.values(r);
  if (b.kind !== "number" || v.kind !== "number" || Qn.eq(b.q, v.q)) return null;
  return <span className="v2v-was">{fmtQ(b.q)}</span>;
}

export const equationRenderer: SceneRenderer<Eq> = {
  kind: "equation",
  box: { compact: { w: 160, h: 100 }, expanded: { w: 320, h: 220 } },
  render: p => <Template p={p} />,
  text,
};

/** Whether an equation scene is a single line (a chip can write it) rather than worked out in steps. */
export const isSingleLine = (scene: Eq): boolean => !isWorked(scene);
