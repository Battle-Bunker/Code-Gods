/**
 * Engine v2 views gallery (dev only: `pnpm --filter @workspace/player-web dev`, then /v2-views.html).
 *
 * 1. The storyboards of integration plan §3.4 on the two-part Empty Tank rule: the goal card, an objects row, the
 *    expanded face and act log lines.
 * 2. Every rule family of the line (v2-linear's registry, read at run time, so new families appear here) on example
 *    lines: the chip, the compact face and the expanded face.
 * 3. Every dealable rule (family × parameters) as a compact face.
 * 4. Grids (v2-grids.tsx): a board in every representation, a storyboard, and every grid family on example boards.
 *
 * `?scheme=dark` for the dark scheme, `?family=<id>` for one family, `?section=story|families|dealt|grids|lenses|pairs|tree` for one section.
 * e2e/v2-views.ts takes the screenshots in docs/screenshots/v2-views/.
 */
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { q } from "@workspace/v2-core";
import { crossingSliver, encodeLine, fromMC, lineType, multiples, normalise, primeHug, squareTriangle, steppingCoefficients, type Line, type LineState } from "@workspace/v2-linear";
import { annotate, bitsLine, CompactFace, ExpandedFace, GameSummary, GoalCard, MoveLine, ObjectChip, summarise, type RuleRef } from "@workspace/v2-views";
import { valueFor } from "./values";
import { abc, autoLines, CURATED, mc, type LineFamily } from "./line-examples";
import { emptyTank, treePrimeIntercept } from "@workspace/v2-views/demo";
import "@workspace/v2-views/styles.css";
import { GridsSection } from "./v2-grids";
import { variantOf as configuredVariant } from "../sdk/object-types.ts";
const lineQ = configuredVariant("line-q");
const lineZ = configuredVariant("line-z");

type Family = LineFamily;
const ruleOf = (family: Family, params: unknown): RuleRef<LineState, unknown> => ({ type: lineType, family, params, variant: lineQ });

const FAMILIES: readonly Family[] = [emptyTank, ...lineType.families];
const examplesOf = (f: Family) => {
  const c = CURATED[f.id];
  const params = c?.params ?? f.dealable(lineQ)[0];
  return { params, lines: c?.lines ?? autoLines(f, params, valueFor(lineQ.id, f.id, params, f.tieBreakers[0]?.id)) };
};

/** The rule's value function from its calibrated record (the storyboard rule has none: no bits shown for it). */
const valueOf = (r: RuleRef<LineState, unknown>) => valueFor(r.variant.id, r.family.id, r.params, r.tieBreaker === undefined ? r.family.tieBreakers[0]?.id : r.tieBreaker);

const params = new URLSearchParams(location.search);
const scheme = params.get("scheme") === "dark" ? "dark" : "light";
const only = params.get("family");
const section = params.get("section");

function Cell({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return <figure className="g-cell" data-wide={wide ? "" : undefined}><figcaption>{title}</figcaption>{children}</figure>;
}

// ------------------------------------------------------------------ 1. storyboards

function Storyboards() {
  const rule = ruleOf(emptyTank, {});
  const line = mc(-3, 10);
  const a = annotate(rule, line);
  return (
    <section className="g-section" id="story" data-section="story">
      <h2>Storyboards: a line under a two-part beginner rule</h2>
      <p className="g-note">Empty Tank is the plan's illustration (§3.4), not a dealt rule; its points are made up and it has no calibrated rarity.</p>
      <h3>On the goal card</h3>
      <GoalCard rule={rule} example={line} />
      <h3>In the Objects list (a row)</h3>
      <div className="g-objrow">
        <CompactFace rule={rule} state={line} annotation={a} next />
        <div className="g-objrow-text">
          <ObjectChip type={lineType} state={line} />
          <div>{bitsLine(a) || (a.score === null ? "not scoring" : "scoring")}</div>
          <div className="g-note">width your bits, height the others' bits, area your points</div>
        </div>
      </div>
      <div className="g-objrow">
        <CompactFace rule={rule} state={mc(2, -6)} />
        <div className="g-objrow-text">
          <ObjectChip type={lineType} state={mc(2, -6)} />
          <div>{annotate(rule, mc(2, -6)).worst} · 0.00 bits · not scoring</div>
        </div>
      </div>
      <h3>In the act log</h3>
      <div className="g-log">
        <MoveLine rule={rule} before={line} after={mc(-3, 9)} who="Your agent Tank-1" what="move the line down 1"
          points={{ before: 8.2, after: 16.3, want: 2.4 }} />
        <MoveLine rule={rule} before={mc(-3, 9)} after={mc(-2, 7)} who="Ada's agent"
          points={{ before: 16.3, after: 7.9, want: 2.4 }} />
        <MoveLine rule={rule} before={mc(-2, 7)} after={mc(-2, 6)} who="Your agent Tank-1" what="move the line down 1"
          points={{ before: 7.9, after: 13.1, want: 2.1, wantBefore: 2.4 }} />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 2. every family on example lines

function FamilySection({ f }: { f: Family }) {
  const { params: p, lines } = examplesOf(f);
  const rule = ruleOf(f, p);
  return (
    <section className="g-rule" data-family={f.id}>
      <h3>{f.title}{f === emptyTank ? " (storyboard rule, not in v2-linear's pool)" : ""}</h3>
      <p className="g-note">{f.card(p, f.tieBreakers[0]?.id ?? null)}</p>
      {lines.map(s => <LineRow key={lineType.encode(s)} rule={rule} state={s} />)}
    </section>
  );
}

function LineRow({ rule, state }: { rule: RuleRef<LineState, unknown>; state: LineState }) {
  const value = valueOf(rule);
  const a = annotate(rule, state, { value });
  return (
    <div className="g-row" data-line={lineType.encode(state)}>
      <div className="g-small">
        <Cell title="chip"><ObjectChip type={lineType} state={state} extra={bitsLine(a)} /></Cell>
        <Cell title="compact"><CompactFace rule={rule} state={state} annotation={a} next /></Cell>
      </div>
      <Cell title="expanded" wide><ExpandedFace rule={rule} state={state} value={value} /></Cell>
    </div>
  );
}

// ------------------------------------------------------------------ 4. the plane's hard cases (annotations-design §6)

/** Lines real games produce that a fixed window draws badly, under the rules that read them on the plane. */
const HARD: readonly { title: string; family: Family; state: LineState; tb?: string }[] = [
  { title: "y = 290x + 59 · Square Triangle", family: squareTriangle, state: mc(290, 59) },
  { title: "y = 290x + 59 · Multiples", family: multiples, state: mc(290, 59) },
  { title: "near-horizontal y = x/6 + 7/6 · Crossing Sliver", family: crossingSliver, state: mc(q(1, 6), q(7, 6)) },
  { title: "far from the origin, c = 27,720 · Multiples", family: multiples, state: mc(27720, 27720) },
  { title: "far from the origin, y = 5x + 27,720 · Multiples", family: multiples, state: mc(5, 27720) },
  { title: "through the origin · Square Triangle", family: squareTriangle, state: mc(3, 0) },
  { title: "near-vertical, x-intercept 90 · Crossing Sliver", family: crossingSliver, state: abc(1000, -1, -90001) },
  { title: "Stepping Coefficients y = 15x + 6", family: steppingCoefficients, state: mc(15, 6) },
  { title: "Prime Hug y = 997x + 3", family: primeHug, state: mc(997, 3) },
];

function Hard() {
  return (
    <section className="g-section" id="plot" data-section="plot">
      <h2>The plane on hard lines</h2>
      <p className="g-note">The window is fitted to what the rule reads (its marks, projected by meaning), with nice ticks; the labels that matter are placed at rest without overlap.</p>
      {HARD.map(h => {
        const rule: RuleRef<LineState, unknown> = { type: lineType, family: h.family, params: h.family.dealable(lineZ)[0], variant: lineZ, tieBreaker: h.tb };
        return (
          <div key={h.title} className="g-row" data-hard={h.title}>
            <div className="g-small">
              <Cell title={h.title}><CompactFace rule={rule} state={h.state} rep={h.family === squareTriangle ? "tri" : "cart"} /></Cell>
            </div>
            <Cell title="expanded" wide><ExpandedFace rule={rule} state={h.state} value={valueOf(rule)} improvement={false} initialRep={h.family === squareTriangle ? "tri" : "cart"} /></Cell>
          </div>
        );
      })}
    </section>
  );
}

// ------------------------------------------------------------------ the end summary

/** "What earned your points" for a ladder rule on lines on and off its rungs (round 29: "…dealt prime…: −½"). */
function EndSummary() {
  const rule = { type: lineType, family: primeHug, params: primeHug.dealable(lineQ)[0], variant: lineQ, tieBreaker: primeHug.tieBreakers[0]?.id ?? null } as RuleRef<LineState, unknown>;
  const objects = [
    { number: 1, state: mc(11, 3), points: 41.2, bits: 6.1, want: 6.75 },
    { number: 2, state: mc(10, 3), points: 12.5, bits: 2.5, want: 5 },
    { number: 3, state: mc(-7, 2), points: 3.1, bits: 1, want: 3.1 },
  ];
  const summary = summarise({ rule, objects, tugs: [], total: 56.8 });
  return (
    <section className="g-section" id="summary" data-section="summary">
      <h2>The end of a game: Prime Gradient</h2>
      <p className="g-note">What earned the points, each line said through its rule's main part: on a rung in the rule's own words, off the rungs as the reading and the nearest prime.</p>
      <GameSummary summary={summary as never} rule={rule as never} />
    </section>
  );
}

// ------------------------------------------------------------------ the tree shape (pool-plan v2)

/** Lines for the tree-shaped rule: on a target, a little off it, between targets, and on a big target. */
const TREE: { title: string; state: LineState }[] = [
  { title: "on the target 31", state: { lines: [fromMC(q(1, 31), q(31))] } },
  { title: "1 above 31", state: { lines: [fromMC(q(1, 31), q(32))] } },
  { title: "between 41 and 61", state: { lines: [fromMC(q(2, 7), q(103, 2))] } },
  { title: "on 101", state: { lines: [fromMC(q(1, 101), q(101))] } },
];

function Tree() {
  const rule = { type: lineType, family: treePrimeIntercept, params: { ends: 1 }, variant: lineQ, tieBreaker: "close>times" } as RuleRef<LineState, unknown>;
  return (
    <section className="g-section" id="tree" data-section="tree">
      <h2>A rule in the tree shape: target, closeness, third</h2>
      <p className="g-note">The line rules' coming shape (pool-plan v2), drawn from the annotation contract alone: the reading, the nearest target and its neighbours, the closeness as a bracket, the third's working.</p>
      {TREE.map(t => (
        <div key={t.title} className="g-row" data-tree={t.title}>
          <div className="g-small"><Cell title={t.title}><CompactFace rule={rule} state={t.state} /></Cell></div>
          <Cell title="expanded" wide><ExpandedFace rule={rule} state={t.state} improvement={false} initialRep="cart" /></Cell>
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ 3. every dealable rule

function Dealt() {
  return (
    <section className="g-section" id="dealt" data-section="dealt">
      <h2>Every dealable rule, compact</h2>
      <p className="g-note">Each family with every parameter set a deal can draw, on the family's first example line.</p>
      {lineType.families.filter(f => !only || f.id === only).map(f => {
        const line = examplesOf(f).lines[0]!;
        return (
          <div key={f.id} className="g-dealt">
            <h3>{f.title}</h3>
            <div className="g-dealt-grid">
              {f.dealable(lineQ).map(p => (
                <Cell key={JSON.stringify(p)} title={Object.entries(p as object).map(([k, v]) => `${k} = ${v}`).join(", ") || "no parameters"}>
                  <CompactFace rule={ruleOf(f, p)} state={line} next />
                </Cell>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

const CSS = `
  body { margin: 0; }
  .g-page { padding: 16px; background: var(--v2v-paper); min-height: 100vh; box-sizing: border-box; }
  .g-page h1 { font-size: 20px; margin: 0 0 4px; }
  .g-page h2 { font-size: 17px; margin: 28px 0 4px; padding-top: 12px; border-top: 2px solid var(--v2v-rule); }
  .g-page h3 { font-size: 15px; margin: 18px 0 6px; }
  .g-nav { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; }
  .g-nav a { color: var(--v2v-cand); }
  .g-note { margin: 0 0 8px; color: var(--v2v-muted); font-size: 13px; max-width: 62ch; }
  .g-rule { margin: 12px 0 24px; }
  .g-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--v2v-rule); }
  .g-cell { margin: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 100%; }
  .g-cell figcaption { font-size: 10px; color: var(--v2v-faint); text-transform: uppercase; letter-spacing: 0.06em; }
  .g-small { display: flex; flex-direction: column; gap: 10px; width: 180px; }
  .g-cell[data-wide] { flex: 1 1 600px; }
  .g-objrow { display: flex; gap: 12px; align-items: center; padding: 8px; border: 1px solid var(--v2v-rule); border-radius: 10px; background: var(--v2v-card); margin-bottom: 8px; max-width: 560px; }
  .g-objrow-text { display: flex; flex-direction: column; gap: 4px; font-size: 13px; min-width: 0; }
  .g-log { display: flex; flex-direction: column; gap: 6px; max-width: 760px; }
  .g-dealt-grid { display: flex; flex-wrap: wrap; gap: 12px; }
  .g-dealt figcaption { text-transform: none; letter-spacing: 0; font-size: 11px; }
  @media (max-width: 700px) {
    .g-small { flex-direction: row; flex-wrap: wrap; width: auto; }
    .g-cell[data-wide] { flex-basis: 100%; }
    .g-objrow { flex-direction: column; align-items: flex-start; }
  }
`;

function Gallery() {
  const show = (s: string) => !section || section === s;
  const other = scheme === "dark" ? "light" : "dark";
  const link = (patch: Record<string, string>) => {
    const u = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(patch)) u.set(k, v);
    return `?${u}`;
  };
  return (
    <div data-v2v-scheme={scheme}>
      <style>{CSS}</style>
      <main className="v2v g-page">
        <h1>Engine v2 views</h1>
        <p className="g-note">The chip, the compact face and the expanded face for every rule of the line and of the grid. Point at a number to light the same quantity in every view; point at a part to see only its marks.</p>
        <nav className="g-nav">
          <a href="#story">Storyboards</a><a href="#families">Families</a><a href="#dealt">Every dealable rule</a><a href="#grids">Grids</a><a href="#tree">Tree rules</a>
          <a href={link({ scheme: other })}>{other} scheme</a>
        </nav>
        {show("story") && !only && <Storyboards />}
        {show("families") && (
          <section className="g-section" id="families" data-section="families">
            <h2>Every family on example lines</h2>
            {FAMILIES.filter(f => !only || f.id === only).map(f => <FamilySection key={f.id} f={f} />)}
          </section>
        )}
        {show("dealt") && <Dealt />}
        {show("grids") && <GridsSection only={only} />}
        {show("tree") && !only && <Tree />}
        {show("summary") && !only && <EndSummary />}
        {section === "plot" && <Hard />}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Gallery /></StrictMode>);
