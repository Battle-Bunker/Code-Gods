/**
 * The sequence scene (seq): the pattern's terms as boxes with "+ step" between them; whole terms from 0 to 12 also get
 * a small stack of tiles (the growth pattern a class draws). Cited terms outside the layout (term 0, term 7) are added
 * at their place, after a gap; a cited step lights every "+ step".
 */
import { Fragment } from "react";
import { Qn, ref, type ElementRef, type ElementValue, type SceneData } from "@workspace/v2-core";
import { fmtQ, fmtValue, signedTerm } from "../format.ts";
import { markRefs } from "../refs.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, El, key, numberOf, Readouts } from "./common.tsx";

type Seq = Extract<SceneData, { kind: "sequence" }>;

function Tiles({ v }: { v: ElementValue }) {
  const q = numberOf(v);
  if (!q || q.d !== 1n || q.n > 12n || q.n < -12n || q.n === 0n) return null;
  const n = Number(q.n < 0n ? -q.n : q.n);
  return <span className="v2v-tiles" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} data-neg={q.n < 0n ? "" : undefined} />)}</span>;
}

function Scene({ p }: { p: RenderProps<Seq> }) {
  const marks = compactMarks(p);
  const q = { ...p, marks };
  const first = p.scene.terms[0];
  if (first && p.values(first.el).kind === "undefined") return <div className="v2v-undef">{fmtValue(p.values(first.el))}</div>;
  const site = first?.el.site;
  // Terms: the layout's, plus cited term(n) and term 0 (zeroth) where marks ask for them.
  const terms = new Map<number, { n: number; el: ElementRef; faint: boolean }>();
  for (const t of p.scene.terms) terms.set(t.n, { n: t.n, el: t.el, faint: false });
  const cited = marks.flatMap(markRefs).filter(r => r.rep === p.rep);
  for (const r of cited) {
    if (r.name === "term" && r.args?.n !== undefined) {
      const n = Number(r.args.n);
      if (!terms.has(n)) terms.set(n, { n, el: r, faint: false });
    }
    if (r.name === "zeroth" && !terms.has(0)) terms.set(0, { n: 0, el: r, faint: true });
    if (r.name === "first" && terms.has(1)) terms.set(1, { ...terms.get(1)!, el: r });
  }
  const list = [...terms.values()].sort((a, b) => a.n - b.n);
  const stepRef = ref(p.rep, "step", undefined, site);
  const step = numberOf(p.values(stepRef));
  const placed = new Set<string>([key(stepRef), ...list.map(t => key(t.el))]);
  const st = step ? signedTerm(step) : null;
  return (
    <>
      <div className="v2v-seq" role="img" aria-label={seqText(p.scene, p.values)}>
        {list.map((t, i) => {
          const prev = list[i - 1];
          const between = prev && t.n - prev.n === 1
            ? <El p={q} r={stepRef} className="v2v-seq-step">{st ? `${st.op}${st.mag}` : ""}</El>
            : prev ? <span className="v2v-seq-gap">…</span> : null;
          return (
            <Fragment key={t.n}>
              {between}
              <span className="v2v-seq-term" data-faint={t.faint ? "" : undefined}>
                {p.size === "expanded" && <Tiles v={p.values(t.el)} />}
                <El p={q} r={t.el} className="v2v-seq-val" title={`term ${t.n}`}>{fmtValue(p.values(t.el))}</El>
                <span className="v2v-seq-n">{t.n === 0 ? "start" : `term ${t.n}`}</span>
              </span>
            </Fragment>
          );
        })}
      </div>
      <Readouts p={q} placed={placed} />
    </>
  );
}

function seqText(scene: Seq, values: (r: ElementRef) => ElementValue): string {
  const vals = scene.terms.map(t => values(t.el));
  if (vals[0]?.kind === "undefined") return vals[0].reason;
  const nums = vals.map(v => numberOf(v));
  const step = nums.length > 1 && nums[0] && nums[1] ? Qn.sub(nums[1], nums[0]) : null;
  const s = step ? signedTerm(step) : null;
  return `${vals.map(fmtValue).join(", ")}, …${s ? ` (${s.op} ${s.mag} each time; start ${fmtQ(Qn.sub(nums[0]!, step!))})` : ""}`;
}

export const sequenceRenderer: SceneRenderer<Seq> = {
  kind: "sequence",
  box: { compact: { w: 160, h: 100 }, expanded: { w: 320, h: 220 } },
  render: p => <Scene p={p} />,
  text: seqText,
};
