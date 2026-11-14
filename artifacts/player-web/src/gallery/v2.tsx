/**
 * Engine v2 views gallery (dev only: `pnpm --filter @workspace/player-web dev`, then /v2-views.html). Every rule family
 * in v2-linear, plus the storyboard's two-part Empty Tank, on a few example lines each: the chip, the compact face and
 * every representation the rule depends on, expanded. `?scheme=dark` shows the dark scheme; `?family=<id>` one family.
 */
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { q, type Q, type RuleFamily } from "@workspace/v2-core";
import { crossingCheck, fromMC, lineQ, lineType, mMeetsC, normalise, primeGradient, triangleArea, type Line, type LineState } from "@workspace/v2-linear";
import { annotate, CompactFace, ExpandedFace, levelText, ObjectChip, type RuleRef } from "@workspace/v2-views";
import { emptyTank } from "@workspace/v2-views/demo";
import "@workspace/v2-views/styles.css";

const mc = (m: number | Q, c: number | Q): LineState =>
  ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const abc = (a: number, b: number, c: number): LineState => ({ lines: [normalise(BigInt(a), BigInt(b), BigInt(c)) as Line] });

interface Example { readonly family: RuleFamily<LineState, any>; readonly params: unknown; readonly lines: readonly LineState[] }

/** Per family: a line at the top, one near, one far, and one the rule cannot score. */
const EXAMPLES: readonly Example[] = [
  { family: emptyTank, params: {}, lines: [mc(-3, 10), mc(-3, 9), mc(-2, 7), mc(2, -6)] },
  { family: primeGradient, params: {}, lines: [mc(4, -3), mc(5, 1), mc(q(5, 2), 1), abc(1, 0, -3)] },
  { family: triangleArea, params: { A: 8 }, lines: [mc(-1, 4), mc(2, -6), mc(-3, 10), mc(3, 0)] },
  { family: mMeetsC, params: {}, lines: [mc(1, 5), mc(3, 3), mc(-2, 1), mc(q(1, 2), -1)] },
  { family: crossingCheck, params: { k: 1, q: 4 }, lines: [mc(2, 1), mc(1, 2), mc(-1, 5), mc(0, 4)] },
];

const params = new URLSearchParams(location.search);
const scheme = params.get("scheme") === "dark" ? "dark" : "light";
const only = params.get("family");

function Rule({ ex }: { ex: Example }) {
  const rule: RuleRef<LineState, unknown> = { type: lineType, family: ex.family, params: ex.params, variant: lineQ };
  const f = ex.family;
  return (
    <section className="g-rule" data-family={f.id}>
      <h2>{f.title}{f === emptyTank ? " (storyboard rule, not in v2-linear's pool)" : ""}</h2>
      <p className="g-card">{f.card(ex.params)}</p>
      {ex.lines.map(s => <LineRow key={lineType.encode(s)} rule={rule} state={s} />)}
    </section>
  );
}

/** Made-up ✨ rarities per step for the storyboard rule (real ones come from the rule's calibration artefact). */
const DEMO_RARITIES: Readonly<Record<string, readonly number[]>> = { "empty-tank-demo": [0, 0.4, 0.9, 1.5, 2.1, 3.4, 4.6, 5.7, 6.8] };

function LineRow({ rule, state }: { rule: RuleRef<LineState, unknown>; state: LineState }) {
  const rarities = DEMO_RARITIES[rule.family.id];
  const a = annotate(rule, state, { rarities });
  const level = levelText(a, true);
  return (
    <div className="g-row" data-line={lineType.encode(state)}>
      <div className="g-small">
        <Cell title="chip"><ObjectChip type={lineType} state={state} extra={level} /></Cell>
        <Cell title="compact"><CompactFace rule={rule} state={state} annotation={a} /></Cell>
      </div>
      <Cell title="expanded" wide><ExpandedFace rule={rule} state={state} rarities={rarities} /></Cell>
    </div>
  );
}

function Cell({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return <figure className="g-cell" data-wide={wide ? "" : undefined}><figcaption>{title}</figcaption>{children}</figure>;
}

const CSS = `
  body { margin: 0; }
  .g-page { padding: 16px; background: var(--v2v-paper); min-height: 100vh; box-sizing: border-box; }
  .g-page h1 { font-size: 20px; margin: 0 0 4px; }
  .g-rule { margin: 20px 0 28px; }
  .g-rule h2 { font-size: 16px; margin: 0 0 2px; }
  .g-card { margin: 0 0 10px; color: var(--v2v-muted); font-size: 13px; max-width: 60ch; }
  .g-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--v2v-rule); }
  .g-cell { margin: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 100%; }
  .g-cell figcaption { font-size: 10px; color: var(--v2v-faint); text-transform: uppercase; letter-spacing: 0.06em; }
  .g-small { display: flex; flex-direction: column; gap: 10px; width: 180px; }
  .g-cell[data-wide] { flex: 1 1 600px; }
  @media (max-width: 700px) { .g-small { flex-direction: row; flex-wrap: wrap; width: auto; } .g-cell[data-wide] { flex-basis: 100%; } }
`;

function Gallery() {
  return (
    <div data-v2v-scheme={scheme}>
      <style>{CSS}</style>
      <main className="v2v g-page">
        <h1>Engine v2 views</h1>
        <p className="g-card">Every rule on example lines: the chip, the compact face and the expanded face. Point at a number to light the same quantity in every view; point at a part to see only its marks.</p>
        {EXAMPLES.filter(ex => !only || ex.family.id === only).map(ex => <Rule key={ex.family.id} ex={ex} />)}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Gallery /></StrictMode>);
