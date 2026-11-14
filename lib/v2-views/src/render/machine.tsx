/**
 * The machine scene (mach): input → [stage] → [stage] → output. Each run a mark cites is drawn as its own row: a
 * forward run for an output element (out(q): q goes in), a backward run for an inverse element (reverse(q): q comes out,
 * the input is the answer), two passes for twice(q). Without cited runs the layout's own run is drawn. The stages are
 * the coordinates (× m, + c), so a mark or a hover on them lights every row's stage.
 */
import { Qn, ref, type ElementRef, type ElementValue, type SceneData } from "@workspace/v2-core";
import { fmtQ, fmtValue, MINUS } from "../format.ts";
import { markRefs } from "../refs.ts";
import type { RenderProps, SceneRenderer } from "../scene.ts";
import { compactMarks, El, key, numberOf, Readouts, termText } from "./common.tsx";

type Mach = Extract<SceneData, { kind: "machine" }>;
type Run = { dir: "forward" | "backward" | "twice"; q: string; el: ElementRef };

const ARROW = "→";

function stageText(label: string, v: ElementValue): string {
  const q = numberOf(v);
  if (!q) return `${label} ?`;
  if (label === "+" && q.n < 0n) return `${MINUS} ${fmtQ({ n: -q.n, d: q.d })}`;
  return `${label} ${fmtQ(q)}`;
}

function Stages({ p, site }: { p: RenderProps<Mach>; site?: number }) {
  const tight = (t: string) => (p.size === "compact" ? t.replace(" ", "") : t);
  return (
    <>
      {p.scene.stages.map((s, i) => {
        const r = s.el ? ref(p.rep, s.el, undefined, site) : null;
        return (
          <span key={i} style={{ display: "contents" }}>
            <span className="v2v-mach-arrow">{ARROW}</span>
            {r ? <El p={p} r={r} className="v2v-mach-stage">{tight(stageText(s.label, p.values(r)))}</El> : <span className="v2v-mach-stage">{s.label}</span>}
          </span>
        );
      })}
      <span className="v2v-mach-arrow">{ARROW}</span>
    </>
  );
}

/** The runs to draw: every cited out/reverse/twice element of this representation, or the layout's own run. */
function runs(p: RenderProps<Mach>): Run[] {
  const out: Run[] = [];
  const seen = new Set<string>();
  for (const m of p.marks) for (const r of markRefs(m)) {
    if (r.rep !== p.rep || seen.has(key(r)) || r.args?.q === undefined) continue;
    const dir = r.name === "out" ? "forward" : r.name === "reverse" ? "backward" : r.name === "twice" ? "twice" : null;
    if (!dir) continue;
    seen.add(key(r));
    out.push({ dir, q: r.args.q, el: r });
  }
  if (!out.length) out.push({ dir: "forward", q: p.scene.input.args?.q ?? "1", el: p.scene.output });
  return out;
}

function Scene({ p }: { p: RenderProps<Mach> }) {
  const marks = compactMarks(p);
  const q = { ...p, marks };
  const site = p.scene.output.site;
  const first = p.scene.stages.find(s => s.el);
  if (first) {
    const v = p.values(ref(p.rep, first.el!, undefined, site));
    if (v.kind === "undefined") return <div className="v2v-undef">{v.reason}</div>;
  }
  const rs = runs(q).slice(0, p.size === "compact" ? 2 : 4);
  const placed = new Set<string>([...rs.map(r => key(r.el)), ...p.scene.stages.filter(s => s.el).map(s => key(ref(p.rep, s.el!)))]);
  const measures = marks.filter(m => m.kind === "measure");
  // A gap between two runs the rule compares, labelled with its term (the term cites both runs).
  const gap = rs.length >= 2 ? [...p.terms.values()].find(t => t.from.length >= 2 && rs.slice(0, 2).every(r => t.from.some(f => key(f) === key(r.el)))) : undefined;
  return (
    <>
      <div className="v2v-mach" role="img" aria-label={machText(p.scene, p.values, p.rep)}>
        {rs.map(r => {
          const v = p.values(r.el);
          const qv = fmtQ(Qn.parse(r.q));
          if (r.dir === "backward") {
            return (
              <div key={key(r.el)} className="v2v-mach-run">
                <El p={q} r={r.el} className="v2v-mach-io" title={`${p.labelOf(r.el)} (${qv})`}>{v.kind === "undefined" ? "?" : fmtValue(v)}</El>
                <Stages p={q} site={site} />
                <span className="v2v-mach-io">{qv}</span>
              </div>
            );
          }
          return (
            <div key={key(r.el)} className="v2v-mach-run">
              <span className="v2v-mach-io">{qv}</span>
              <Stages p={q} site={site} />
              {r.dir === "twice" && <><span className="v2v-mach-caption">×2</span><span className="v2v-mach-arrow">{ARROW}</span></>}
              <El p={q} r={r.el} className="v2v-mach-io" title={`${p.labelOf(r.el)} (${qv})`}>{fmtValue(v)}</El>
            </div>
          );
        })}
        {p.size === "expanded" && rs.some(r => r.dir === "backward") && <div className="v2v-mach-caption">run backwards: which input gives that output?</div>}
        {gap && <div className="v2v-mach-gap" data-mark="measure" data-term={gap.id}>gap {termText(p, { kind: "measure", from: rs[0]!.el, to: rs[1]!.el, term: gap.id })}</div>}
        {!gap && measures.length > 0 && <div className="v2v-mach-gap">{measures.map(m => termText(p, m)).join(", ")}</div>}
      </div>
      <Readouts p={q} placed={placed} />
    </>
  );
}

function machText(scene: Mach, values: (r: ElementRef) => ElementValue, rep: string): string {
  const site = scene.output.site;
  const stages = scene.stages.map(s => (s.el ? stageText(s.label, values(ref(rep, s.el, undefined, site))) : s.label));
  const first = scene.stages.find(s => s.el);
  if (first) {
    const v = values(ref(rep, first.el!, undefined, site));
    if (v.kind === "undefined") return v.reason;
  }
  const inp = scene.input.args?.q ?? "1";
  return `${fmtQ(Qn.parse(inp))} ${ARROW} ${stages.join(` ${ARROW} `)} ${ARROW} ${fmtValue(values(scene.output))}`;
}

export const machineRenderer: SceneRenderer<Mach> = {
  kind: "machine",
  box: { compact: { w: 160, h: 100 }, expanded: { w: 320, h: 220 } },
  render: p => <Scene p={p} />,
  text: machText,
};
