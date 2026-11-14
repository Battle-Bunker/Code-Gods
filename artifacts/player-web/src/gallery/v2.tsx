/**
 * Engine v2 views gallery (dev only: `pnpm --filter @workspace/player-web dev`, then /v2-views.html).
 *
 * 1. The storyboards of integration plan §3.4 on the two-part Empty Tank rule: the goal card, an objects row, the
 *    expanded face and act log lines.
 * 2. Every rule family of the line (v2-linear's registry, read at run time, so new families appear here) on example
 *    lines: the chip, the compact face and the expanded face.
 * 3. Every dealable rule (family × parameters) as a compact face.
 *
 * `?scheme=dark` for the dark scheme, `?family=<id>` for one family, `?section=story|families|dealt` for one section.
 * e2e/v2-views.ts takes the screenshots in docs/screenshots/v2-views/.
 */
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { evaluateObject, levelOf, objectLadder, q, rng, walkStep, type Q, type RuleFamily } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, normalise, type Line, type LineState } from "@workspace/v2-linear";
import { annotate, CompactFace, ExpandedFace, GoalCard, levelText, MoveLine, ObjectChip, type RuleRef } from "@workspace/v2-views";
import { emptyTank } from "@workspace/v2-views/demo";
import "@workspace/v2-views/styles.css";

const mc = (m: number | Q, c: number | Q): LineState =>
  ({ lines: [fromMC(typeof m === "number" ? q(m) : m, typeof c === "number" ? q(c) : c)] });
const abc = (a: number, b: number, c: number): LineState => ({ lines: [normalise(BigInt(a), BigInt(b), BigInt(c)) as Line] });

type Family = RuleFamily<LineState, any>;
const ruleOf = (family: Family, params: unknown): RuleRef<LineState, unknown> => ({ type: lineType, family, params, variant: lineQ });

/** Hand-picked lines per family: one at the top, one near, one far, one the rule cannot score. */
const CURATED: Readonly<Record<string, { params?: unknown; lines: readonly LineState[] }>> = {
  "empty-tank-demo": { lines: [mc(-3, 10), mc(-3, 9), mc(-2, 7), mc(2, -6)] },
  "prime-gradient": { lines: [mc(4, -3), mc(5, 1), mc(q(5, 2), 1), abc(1, 0, -3)] },
  "triangle-area": { params: { A: 8 }, lines: [mc(-1, 4), mc(2, -6), mc(-3, 10), mc(3, 0)] },
  "m-meets-c": { lines: [mc(1, 5), mc(3, 3), mc(-2, 1), mc(q(1, 2), -1)] },
  "crossing-check": { params: { k: 1, q: 4 }, lines: [mc(2, 1), mc(1, 2), mc(-1, 5), mc(0, 4)] },
};

/** For a family nobody curated: lines from a seeded walk, the best, a middling and a low one, and a WORST if met. */
function autoLines(family: Family, params: unknown): LineState[] {
  const r = rng(`gallery:${family.id}`);
  const ladder = objectLadder(lineType, family, params, lineQ);
  const byLevel = new Map<number, LineState>();
  let worst: LineState | null = null;
  let s = mc(1, 1);
  for (let i = 0; i < 3000 && (byLevel.size < 6 || !worst); i++) {
    s = walkStep(lineType, lineQ, s, r);
    const score = evaluateObject(lineType, family, params, s, lineQ).score;
    if (score === null) { worst ??= s; continue; }
    const l = levelOf(score, ladder);
    if (!byLevel.has(l)) byLevel.set(l, s);
  }
  const levels = [...byLevel.keys()].sort((a, b) => b - a);
  const pick = [levels[0], levels[Math.floor(levels.length / 2)], levels[levels.length - 1]].filter((x, i, a) => x !== undefined && a.indexOf(x) === i);
  const lines = [...pick.map(l => byLevel.get(l!)!), ...(worst ? [worst] : [])];
  return lines.length ? lines : [mc(1, 1)];
}

const FAMILIES: readonly Family[] = [emptyTank, ...lineType.families];
const examplesOf = (f: Family) => {
  const c = CURATED[f.id];
  const params = c?.params ?? f.dealable(lineQ)[0];
  return { params, lines: c?.lines ?? autoLines(f, params) };
};

/** Made-up ✨ rarities per step for the storyboard rule (real ones come from the rule's calibration artefact). */
const TANK_RARITIES = [0, 0.4, 0.9, 1.5, 2.1, 3.4, 4.6, 5.7, 6.8];
const raritiesOf = (f: Family) => (f === emptyTank ? TANK_RARITIES : undefined);

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
  const a = annotate(rule, line, { rarities: TANK_RARITIES });
  return (
    <section className="g-section" id="story" data-section="story">
      <h2>Storyboards: a line under a two-part beginner rule</h2>
      <p className="g-note">Empty Tank is the plan's illustration (§3.4), not a dealt rule; its ✨ rarities and points are made up.</p>
      <h3>On the goal card</h3>
      <GoalCard rule={rule} example={line} rarities={TANK_RARITIES} />
      <h3>In the Objects list (a row)</h3>
      <div className="g-objrow">
        <CompactFace rule={rule} state={line} annotation={a} />
        <div className="g-objrow-text">
          <ObjectChip type={lineType} state={line} />
          <div>{levelText(a)} · ✨ rarity {a.rarity?.toFixed(1)}</div>
          <div className="g-note">width your ✨ rarity, height how much the others want it, area your points (12.1)</div>
        </div>
      </div>
      <div className="g-objrow">
        <CompactFace rule={rule} state={mc(2, -6)} />
        <div className="g-objrow-text">
          <ObjectChip type={lineType} state={mc(2, -6)} />
          <div>{annotate(rule, mc(2, -6)).worst} · ✨ 0 · not scoring</div>
        </div>
      </div>
      <h3>In the act log</h3>
      <div className="g-log">
        <MoveLine rule={rule} before={line} after={mc(-3, 9)} who="Your agent Tank-1" what="move the line down 1" rarities={TANK_RARITIES}
          points={{ before: 8.2, after: 16.3, want: 2.4 }} />
        <MoveLine rule={rule} before={mc(-3, 9)} after={mc(-2, 7)} who="Ada's agent" rarities={TANK_RARITIES}
          points={{ before: 16.3, after: 7.9, want: 2.4 }} />
        <MoveLine rule={rule} before={mc(-2, 7)} after={mc(-2, 6)} who="Your agent Tank-1" what="move the line down 1" rarities={TANK_RARITIES}
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
      <p className="g-note">{f.card(p)}</p>
      {lines.map(s => <LineRow key={lineType.encode(s)} rule={rule} state={s} />)}
    </section>
  );
}

function LineRow({ rule, state }: { rule: RuleRef<LineState, unknown>; state: LineState }) {
  const rarities = raritiesOf(rule.family);
  const a = annotate(rule, state, { rarities });
  return (
    <div className="g-row" data-line={lineType.encode(state)}>
      <div className="g-small">
        <Cell title="chip"><ObjectChip type={lineType} state={state} extra={levelText(a, true)} /></Cell>
        <Cell title="compact"><CompactFace rule={rule} state={state} annotation={a} /></Cell>
      </div>
      <Cell title="expanded" wide><ExpandedFace rule={rule} state={state} rarities={rarities} /></Cell>
    </div>
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
                  <CompactFace rule={ruleOf(f, p)} state={line} />
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
        <p className="g-note">The chip, the compact face and the expanded face for every rule of the line. Point at a number to light the same quantity in every view; point at a part to see only its marks.</p>
        <nav className="g-nav">
          <a href="#story">Storyboards</a><a href="#families">Families</a><a href="#dealt">Every dealable rule</a>
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
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Gallery /></StrictMode>);
