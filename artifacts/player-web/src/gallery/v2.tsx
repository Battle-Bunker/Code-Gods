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
 * `?scheme=dark` for the dark scheme, `?family=<id>` for one family, `?section=story|families|dealt|grids|lenses|pairs` for one section.
 * e2e/v2-views.ts takes the screenshots in docs/screenshots/v2-views/.
 */
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { evaluateObject, q, rng, walkStep, type Q, type RuleFamily, type Score } from "@workspace/v2-core";
import { divisibilityLadder, encodeLine, fromMC, lensMutators, lineQ, lineQLenses, lineType, lineZ, normalise, primeGradient, primeLanding, squareArea, treasure, wholeCrossing, type Line, type LineState } from "@workspace/v2-linear";
import { annotate, bitsLine, CompactFace, ExpandedFace, GoalCard, MoveLine, MoveSketch, ObjectChip, type RuleRef } from "@workspace/v2-views";
import { pickExamples, valueFor } from "./values";
import { emptyTank } from "@workspace/v2-views/demo";
import "@workspace/v2-views/styles.css";
import { GridsSection } from "./v2-grids";
import { canonicalPair, pairQ, pairType, wholeAnswer, type PairState } from "@workspace/v2-pair";

const mc = (m: number | Q, c: number | Q): LineState =>
  ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const abc = (a: number, b: number, c: number): LineState => ({ lines: [normalise(BigInt(a), BigInt(b), BigInt(c)) as Line] });

type Family = RuleFamily<LineState, any>;
const ruleOf = (family: Family, params: unknown): RuleRef<LineState, unknown> => ({ type: lineType, family, params, variant: lineQ });

/** Hand-picked lines per family: one at the top, one near, one far, one the rule cannot score. */
const CURATED: Readonly<Record<string, { params?: unknown; lines: readonly LineState[] }>> = {
  "empty-tank-demo": { lines: [mc(-3, 10), mc(-3, 9), mc(-2, 7), mc(2, -6)] },
  "whole-crossing": { lines: [mc(3, -7), mc(-2, 5), mc(4, -12), mc(0, 4)] },
  "divisibility-ladder": { lines: [mc(6, 6), mc(7, 60), mc(2, 1), mc(3, 0)] },
  "prime-gradient": { lines: [mc(4, -3), mc(5, 1), mc(q(5, 2), 1), abc(1, 0, -3)] },
  "triangle-area": { params: { A: 8 }, lines: [mc(-1, 4), mc(2, -6), mc(-3, 10), mc(3, 0)] },
  "m-meets-c": { lines: [mc(1, 5), mc(3, 3), mc(-2, 1), mc(q(1, 2), -1)] },
  "crossing-check": { params: { k: 1, q: 4 }, lines: [mc(2, 1), mc(1, 2), mc(-1, 5), mc(0, 4)] },
};

/** For a family nobody curated: lines from a seeded walk, the best, a middling and a low one by bits, and a WORST if met. */
function autoLines(family: Family, params: unknown): LineState[] {
  const r = rng(`gallery:${family.id}`);
  const value = valueFor(lineQ.id, family.id, params, family.tieBreakers[0]?.id);
  const met: { state: LineState; score: Score }[] = [];
  let worst: LineState | null = null;
  let s = mc(1, 1);
  for (let i = 0; i < 3000; i++) {
    s = walkStep(lineType, lineQ, s, r);
    const score = evaluateObject(lineType, family, params, s, lineQ).score;
    if (score === null) worst ??= s; else met.push({ state: s, score });
  }
  const lines = [...pickExamples(met, value), ...(worst ? [worst] : [])];
  return lines.length ? lines : [mc(1, 1)];
}

const FAMILIES: readonly Family[] = [emptyTank, ...lineType.families];
const examplesOf = (f: Family) => {
  const c = CURATED[f.id];
  const params = c?.params ?? f.dealable(lineQ)[0];
  return { params, lines: c?.lines ?? autoLines(f, params) };
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
  { title: "y = 290x + 59 · Square Area", family: squareArea, state: mc(290, 59) },
  { title: "y = 290x + 59 · Prime Landing", family: primeLanding, state: mc(290, 59) },
  { title: "near-horizontal y = x/6 + 7/6 · Whole Crossing", family: wholeCrossing, state: mc(q(1, 6), q(7, 6)) },
  { title: "far from the origin, c = 27,720 · Divisibility Ladder", family: divisibilityLadder, state: mc(27720, 27720) },
  { title: "far from the origin, y = 5x + 27,720 · Prime Landing", family: primeLanding, state: mc(5, 27720) },
  { title: "through the origin · Square Area", family: squareArea, state: mc(3, 0) },
  { title: "near-vertical, x-intercept 90 · Whole Crossing", family: wholeCrossing, state: abc(1000, -1, -90001) },
  { title: "Treasure y = 15x + 6", family: treasure, state: mc(15, 6) },
  { title: "Prime Gradient y = 997x + 3", family: primeGradient, state: mc(997, 3) },
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
              <Cell title={h.title}><CompactFace rule={rule} state={h.state} rep={h.family === squareArea ? "tri" : "cart"} /></Cell>
            </div>
            <Cell title="expanded" wide><ExpandedFace rule={rule} state={h.state} value={valueOf(rule)} improvement={false} initialRep={h.family === squareArea ? "tri" : "cart"} /></Cell>
          </div>
        );
      })}
    </section>
  );
}

// ------------------------------------------------------------------ the five lens moves

/** Each lens move on a line, as the What if pane draws it (lenses-and-mutators.md §5). */
const LENS_MOVES: { title: string; line: Line; mutator: string; args: Record<string, string> }[] = [
  { title: "turn about a pin", line: fromMC(q(1, 2), q(1)) as Line, mutator: "rot.turn", args: { centre: "2", turn: "3/4" } },
  { title: "turn about the origin", line: fromMC(q(0), q(5)) as Line, mutator: "rot.turn", args: { centre: "origin", turn: "-3/4" } },
  { title: "fold in a crease", line: fromMC(q(2), q(-1)) as Line, mutator: "fold", args: { x0: "1", s: "0" } },
  { title: "fold in a mirror", line: fromMC(q(3), q(1)) as Line, mutator: "fold", args: { mirror: encodeLine(normalise(-1n, 1n, 0n) as Line) } },
  { title: "swap gradient and y-intercept", line: fromMC(q(2), q(5)) as Line, mutator: "coef.swap", args: { pair: "m-c" } },
  { title: "swap b and c", line: fromMC(q(1, 2), q(3)) as Line, mutator: "coef.swap", args: { pair: "b-c" } },
  { title: "lean", line: fromMC(q(1), q(-2)) as Line, mutator: "basis.lean", args: { k: "1/2" } },
  { title: "zoom", line: fromMC(q(-1), q(3)) as Line, mutator: "basis.zoom", args: { f: "2" } },
];

function Lenses() {
  return (
    <section className="g-section" id="lenses" data-section="lenses">
      <h2>The five lens moves, drawn</h2>
      <p className="g-note">The old line dashed and faint, the new line bold, and what the move keeps or measures (line-q-lenses).</p>
      <div className="g-dealt-grid">
        {LENS_MOVES.map(l => {
          const m = lensMutators.find(x => x.id === l.mutator)!;
          const r = m.apply({ lines: [l.line] }, 0, m.args(lineQLenses).decode(l.args), lineQLenses) as LineState;
          return <Cell key={l.title} title={l.title}><MoveSketch before={l.line} after={r.lines[0]!} call={l} /></Cell>;
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ two-line systems

const pairOf = (p: [bigint, bigint, bigint], r: [bigint, bigint, bigint]) => canonicalPair([normalise(...p) as Line, normalise(...r) as Line], pairQ) as PairState;
/** Pairs for Whole Answer: crossing on a peg, crossing off it, an upright line, parallel lines. */
const PAIRS: { title: string; state: PairState; before?: PairState }[] = [
  { title: "crossing on a whole point", state: pairOf([1n, 1n, -3n], [1n, -1n, -1n]) },
  { title: "crossing between pegs", state: pairOf([2n, 3n, -7n], [1n, -2n, -1n]) },
  { title: "one line upright", state: pairOf([1n, 0n, -3n], [2n, -1n, 1n]) },
  { title: "parallel: no crossing", state: pairOf([2n, -1n, 1n], [2n, -1n, -4n]) },
  // A move that flips the stored order: the line that did not move keeps its colour.
  { title: "after a move (y = x − 1 up to y = x + 9)", state: pairOf([1n, -1n, 9n], [2n, 1n, -5n]), before: pairOf([1n, -1n, -1n], [2n, 1n, -5n]) },
];

function Pairs() {
  const rule = { type: pairType, family: wholeAnswer, params: wholeAnswer.dealable(pairQ)[0], variant: pairQ } as RuleRef<PairState, unknown>;
  return (
    <section className="g-section" id="pairs" data-section="pairs">
      <h2>Two-line systems: Whole Answer</h2>
      <p className="g-note">Each pair as one object: both lines on the plane, each in its own colour, the equations given side by side and solved (lines-pairs, withheld from the lobby until its starters land).</p>
      {PAIRS.map(p => (
        <div key={p.title} className="g-row" data-pair={p.title}>
          <div className="g-small"><Cell title={p.title}><CompactFace rule={rule} state={p.state} before={p.before} /></Cell></div>
          <Cell title="expanded" wide><ExpandedFace rule={rule} state={p.state} before={p.before} improvement={false} /></Cell>
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
          <a href="#story">Storyboards</a><a href="#families">Families</a><a href="#dealt">Every dealable rule</a><a href="#grids">Grids</a><a href="#lenses">Lens moves</a><a href="#pairs">Pairs</a>
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
        {show("lenses") && !only && <Lenses />}
        {show("pairs") && !only && <Pairs />}
        {section === "plot" && <Hard />}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Gallery /></StrictMode>);
