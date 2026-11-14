/**
 * PROTOTYPE faces for the line annotations storyboards (docs/engine-v2/annotations-design.md §2–§8): the reading strip,
 * contributor cards whose gauge is the quantity on a ruler (owner decision 23: no steps, no thresholds), the moves that
 * make the line rarer with their prices and new bits, One line
 * at rest / selected / compared, Lines rows, the chip, the act log, a chat mention, the goal card linked to the line, and
 * what others' bits say (with a told rule).
 */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { fmtNum } from "@workspace/v2-views";
import { lineType, type LineState } from "@workspace/v2-linear";
import { bitsText, chance, GLYPH, read, ruleOf, VIEW_TITLE, type Contributor, type Move, type Reading, type Role, type ViewId } from "./model";
import { View } from "./views";

/** Illustrative: the others' bits on the storyboard lines (the real value is the tick's peer sum). */
export const OTHERS = 3.1;

/** Wording rule 1: no parameter letters in player text (the artefact labels still carry y(k) and T). */
export function words(s: string, params: unknown): string {
  const p = (params ?? {}) as Record<string, number>;
  let t = s;
  if (p.k !== undefined) t = t.replaceAll("y(k)", `y(${p.k})`);
  if (p.T !== undefined) t = t.replace(/\bto T\b/g, `to ${p.T}`);
  return t.replaceAll("|m − 1|", "the gradient's distance from 1").replaceAll("|m|", "the gradient's size").replace(/\bc to\b/g, "the y-intercept to").replace("m to a prime", "the gradient to a prime");
}

const pointsOf = (bits: number) => `your ${fmtNum(bits)} × others' ${fmtNum(OTHERS)} = ${fmtNum(bits * OTHERS)} points`;

export function Strip({ r, sel, onSel, oneLine }: { r: Reading; sel: Role | null; onSel?: (x: Role | null) => void; oneLine?: boolean }): ReactElement {
  return (
    <div className="la-strip" data-one={oneLine ? "" : undefined}>
      {r.contributors.map(c => (
        <button key={c.role} type="button" className="la-strip-row" data-role={c.role} data-sel={sel === c.role ? "" : undefined}
          style={{ opacity: sel && sel !== c.role ? 0.45 : 1 }} onClick={() => onSel?.(sel === c.role ? null : c.role)} aria-pressed={sel === c.role}>
          <span className="la-glyph">{GLYPH[c.role]}</span>
          {(oneLine ? c.chain.slice(0, 3) : c.chain).map((x, i) => <span key={i} className="la-link">{i > 0 && <span className="la-arrow">→</span>}{x}</span>)}
          {!oneLine && <span className="la-link la-next">{c.aim}</span>}
        </button>
      ))}
    </div>
  );
}

function ContributorCard({ c, r, sel, onSel }: { c: Contributor; r: Reading; sel: Role | null; onSel: (x: Role | null) => void }): ReactElement {
  return (
    <button type="button" className="la-card" data-role={c.role} data-sel={sel === c.role ? "" : undefined} aria-pressed={sel === c.role}
      onClick={() => onSel(sel === c.role ? null : c.role)}>
      <span className="la-card-head">
        <span className="la-card-name">{GLYPH[c.role]} {c.role === "main" ? "Main part" : c.role === "tb" ? "Tie-breaker" : `${c.owner}'s rule`}: {words(c.title, r.rule.params)}</span>
        <span className="la-card-state">{c.aim}</span>
      </span>
      <span className="la-card-sentence">{c.sentence}</span>
      {c.ruler && <RulerView c={c} />}
    </button>
  );
}

export function Moves({ r, onPick, picked }: { r: Reading; onPick?: (i: number) => void; picked: number }): ReactElement {
  if (!r.moves.length) return <p className="la-moves-top">No single move makes this line rarer for your rule.</p>;
  return (
    <div className="la-moves">
      <h4>What would make it rarer</h4>
      <ol>
        {r.moves.map((m, i) => (
          <li key={i} data-picked={i === picked ? "" : undefined} onMouseEnter={() => onPick?.(i)} onClick={() => onPick?.(i)}>
            <span className="la-move-words">{cap(m.words)}</span>
            <span className="la-move-price">{fmtNum(m.price)} ⚡</span>
            <span className="la-move-step">→ {bitsText(m.bits)} ({chance(m.bits)})</span>
            <span className="la-move-effect">{m.effect}</span>
          </li>
        ))}
      </ol>
      <p className="la-hint">The dashed line is the first move. Tell your assistant the words, or let your agent find it.</p>
    </div>
  );
}

/** The lens as a magnified number line (design §4.5, §6): the value ●, the references, the next target's band. */
export function RulerView({ c, width = 340 }: { c: Contributor; width?: number }): ReactElement {
  const r = c.ruler!;
  const xs = [r.value, ...r.refs.map(x => x.at), ...(r.band ?? [])];
  let lo = Math.min(...xs), hi = Math.max(...xs);
  const span = Math.max(hi - lo, 2);
  lo -= span * 0.15; hi += span * 0.15;
  const W = width, H = 58, pad = 14;
  const X = (v: number) => pad + ((v - lo) / (hi - lo)) * (W - 2 * pad);
  const Y = 30;
  const step = span <= 12 ? 1 : span <= 30 ? 2 : span <= 60 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return (
    <svg className="la-ruler" data-role={c.role} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${r.valueLabel}; ${r.refs.map(x => x.label).join(", ")}${r.bandLabel ? `; ${r.bandLabel}` : ""}`}>
      <line className="la-ruler-axis" x1={pad} x2={W - pad} y1={Y} y2={Y} />
      {ticks.map(t => <line key={t} className="la-ruler-tick" x1={X(t)} x2={X(t)} y1={Y - 3} y2={Y + 3} />)}
      {r.band && <rect className="la-band" data-role={c.role} x={X(r.band[0])} y={Y - 7} width={Math.max(2, X(r.band[1]) - X(r.band[0]))} height={14} />}
      {r.refs.map(x => (
        <g key={x.at} opacity={x.strong ? 1 : 0.55}>
          <line className="la-ruler-ref" x1={X(x.at)} x2={X(x.at)} y1={Y - 9} y2={Y + 9} strokeWidth={x.strong ? 3 : 1.5} />
          <text className="la-ruler-label" x={X(x.at)} y={Y + 22} textAnchor="middle" fontWeight={x.strong ? 700 : 400}>{x.label}</text>
        </g>
      ))}
      <circle className="la-ruler-value" cx={X(r.value)} cy={Y} r={5} />
      {(() => {
        // Centred over the value, kept inside the ruler (a long name never runs off its edge).
        const t = `${GLYPH[c.role]} ${r.valueLabel}`, tw = t.length * 6.2;
        return <text className="la-ruler-label la-ruler-vlabel" x={Math.min(W - tw / 2 - 2, Math.max(tw / 2 + 2, X(r.value)))} y={Y - 12} textAnchor="middle">{t}</text>;
      })()}
      {r.bandLabel && <text className="la-ruler-label la-ruler-target" x={W - 2} y={10} textAnchor="end">{r.bandLabel}</text>}
    </svg>
  );
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function HowThisScores({ r, open }: { r: Reading; open?: boolean }): ReactElement {
  const [m, t] = r.contributors;
  const next = r.rarities[r.level + 1];
  return (
    <details className="la-how" open={open}>
      <summary>How this scores</summary>
      <ol>
        <li><b>See.</b> {m!.sentence}</li>
        <li><b>Tie-breaker.</b> {t!.sentence} {r.combine}</li>
        <li><b>Rarity.</b> {bitsText(r.bits)}: only {chance(r.bits).replace(" by chance", "")} random lines are at least this good on both parts. Each bit is twice as rare.{r.moves[0] && ` After "${r.moves[0].words}": ${bitsText(r.moves[0].bits)} (${chance(r.moves[0].bits)}).`}</li>
        <li><b>Points.</b> {cap(pointsOf(r.bits))}. Others' bits are how rare this line is for the other players' rules, added together.</li>
      </ol>
    </details>
  );
}

function Switcher({ r, active, compare, onActive, onCompare }: { r: Reading; active: ViewId; compare: ViewId | null; onActive: (v: ViewId) => void; onCompare: (v: ViewId | null) => void }) {
  const reads = r.reads;
  const more = r.views.filter(v => !reads.includes(v));
  return (
    <div className="la-switch">
      <span className="la-switch-label">Your rule's views:</span>
      {reads.map(v => (
        <button key={v} type="button" className="la-chip" aria-pressed={active === v} onClick={() => onActive(v)}>{v === r.primary ? "★ " : ""}{VIEW_TITLE[v]}</button>
      ))}
      <label className="la-more">More views
        <select value={more.includes(active) ? active : ""} onChange={e => e.target.value && onActive(e.target.value as ViewId)}>
          <option value="">▾</option>
          {more.map(v => <option key={v} value={v}>{VIEW_TITLE[v]}</option>)}
        </select>
      </label>
      <label className="la-more">Compare with
        <select value={compare ?? ""} onChange={e => onCompare((e.target.value || null) as ViewId | null)}>
          <option value="">nothing</option>
          {r.views.filter(v => v !== active).map(v => <option key={v} value={v}>{VIEW_TITLE[v]}</option>)}
        </select>
      </label>
    </div>
  );
}

export interface OneLineProps {
  r: Reading;
  number: number;
  wide: boolean;
  width: number;
  initialSel?: Role | null;
  initialCompare?: ViewId | null;
  howOpen?: boolean;
  /** Extra contributors drawn on the views (a told rule). */
  told?: Contributor[];
  children?: ReactElement | null;
}

export function OneLine(p: OneLineProps): ReactElement {
  const { r } = p;
  const [sel, setSel] = useState<Role | null>(p.initialSel ?? null);
  const [active, setActive] = useState<ViewId>(r.primary);
  // A wide card shows the rule's views side by side: the primary and the next view the rule reads.
  const second = r.reads.find(v => v !== r.primary) ?? null;
  const [compare, setCompare] = useState<ViewId | null>(p.initialCompare !== undefined ? p.initialCompare : p.wide ? second : null);
  const [picked, setPicked] = useState(0);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  const move = r.moves[picked];
  const contributors = [...r.contributors, ...(p.told ?? [])];
  const ghost = move ? { state: move.after, label: `next: ${move.words}` } : null;
  const views = [active, ...(compare && compare !== active ? [compare] : [])];
  const colW = p.wide ? (compare ? Math.floor((p.width * 0.58 - 24) / 2) : Math.floor(p.width * 0.58)) : p.width - 24;
  const selC = contributors.find(c => c.role === sel);
  return (
    <article className="la-oneline" data-wide={p.wide ? "" : undefined}>
      <header className="la-head">
        <span className="la-head-name">Line {p.number}</span>
        <span className="la-head-eq">{r.equation}</span>
        <span className="la-head-bits">{bitsText(r.bits)} <span className="la-muted">({chance(r.bits)})</span></span>
        <span className="la-head-points">{cap(pointsOf(r.bits))}</span>
      </header>
      {selC && (
        <p className="la-selchip" data-role={selC.role}>
          {GLYPH[selC.role]} {selC.name} selected: lit in every view <button type="button" aria-label="Clear the selection" onClick={() => setSel(null)}>✕</button>
        </p>
      )}
      <Strip r={r} sel={sel} onSel={setSel} />
      <div className="la-body">
        <div className="la-views">
          <Switcher r={r} active={active} compare={compare} onActive={setActive} onCompare={setCompare} />
          <div className="la-view-row" data-stacked={!p.wide ? "" : undefined}>
            {views.map(v => (
              <section key={v} className="la-panel" aria-label={VIEW_TITLE[v]}>
                <h4>{VIEW_TITLE[v]}{v === r.primary && <span className="la-tag">your rule's main view</span>}{!r.contributors.some(c => c.anchors[v]) && <span className="la-tag" data-other="">not read by your rule</span>}</h4>
                <View view={v} state={r.state} contributors={contributors} sel={sel} onSel={setSel} ghost={v === r.primary || v === "cart" || v === "si" ? ghost : null} size="card" width={colW} evaluation={r.annotation.sites[0]!.evaluation} />
              </section>
            ))}
          </div>
        </div>
        <div className="la-side">
          {r.contributors.map(c => <ContributorCard key={c.role} c={c} r={r} sel={sel} onSel={setSel} />)}
          <p className="la-combine">{r.combine}</p>
          <Moves r={r} picked={picked} onPick={setPicked} />
          {p.children}
          <HowThisScores r={r} open={p.howOpen} />
        </div>
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ compact contexts

export function Chip({ r }: { r: Reading }): ReactElement {
  const main = r.contributors[0]!;
  const eq = r.equation;
  const at = main.name === "c" ? eq.lastIndexOf(main.value.replace("−", "")) : -1;
  return (
    <span className="la-linechip">
      {at > 0 ? <>{eq.slice(0, at)}<b data-role="main">{GLYPH.main}{eq.slice(at)}</b></> : eq}
      <span className="la-muted"> · {bitsText(r.bits)}</span>
    </span>
  );
}

export function Row({ r, number, width }: { r: Reading; number: number; width: number }): ReactElement {
  return (
    <div className="la-row">
      <View view={r.primary} state={r.state} contributors={r.contributors} sel={null} size="row" width={Math.min(200, width * 0.42)} evaluation={r.annotation.sites[0]!.evaluation} />
      <div className="la-row-text">
        <p><b>Line {number}</b> {r.primary !== "si" && <span className="la-muted">{r.equation}</span>}</p>
        <Strip r={r} sel={null} oneLine />
        <p>{bitsText(r.bits)} ({chance(r.bits)}) · <b>{fmtNum(r.bits * OTHERS)} points</b></p>
      </div>
    </div>
  );
}

export function ActLine({ before, after, who }: { before: Reading; after: Reading; who: string }): ReactElement {
  const changed = before.contributors.map((c, i) => ({ c, d: after.contributors[i]! })).filter(x => x.c.value !== x.d.value);
  return (
    <p className="la-act">
      <b>{who}</b> changed line 7: {before.equation} → {after.equation}.{" "}
      {changed.map(({ c, d }) => (
        <span key={c.role} data-role={c.role} className="la-act-c">{GLYPH[c.role]} {c.name} {c.value} → {d.value}. </span>
      ))}
      Rarity {fmtNum(before.bits)} → {bitsText(after.bits)} ({chance(after.bits)}). Points {fmtNum(before.bits * OTHERS)} → {fmtNum(after.bits * OTHERS)}.
    </p>
  );
}

// ------------------------------------------------------------------ goal card, linked to the line

export function GoalLinked({ r, number }: { r: Reading; number: number }): ReactElement {
  const f = r.rule.family;
  const best = r.rarities[r.rarities.length - 1] ?? 0;
  return (
    <article className="la-goal">
      <h3>{f.title}</h3>
      <p className="la-goal-card">{f.card(r.rule.params as never, r.rule.tieBreaker as string)}</p>
      <p className="la-goal-link">Your line {number}, <b>{r.equation}</b>: <b>{bitsText(r.bits)}</b> ({chance(r.bits)}).</p>
      <Strip r={r} sel={null} />
      {r.contributors.map(c => c.ruler && <div key={c.role} className="la-goal-ruler"><RulerView c={c} /></div>)}
      <Moves r={r} picked={0} />
      <p className="la-muted">The rarest lines for this rule (main part on target, tie-breaker as big as it counts) are {bitsText(best)}, {chance(best)}.</p>
      <details className="la-how"><summary>A worked example</summary><p className="la-muted">(The rule's worked example, as today, below your own line.)</p></details>
    </article>
  );
}

// ------------------------------------------------------------------ others and a told rule

export function Others({ r, told, shared }: { r: Reading; told: Reading; shared: Move | null }): ReactElement {
  const t = told.contributors[0]!;
  return (
    <section className="la-others">
      <h4>Why others want this line</h4>
      <p>Others' bits on this line: <b>{fmtNum(OTHERS)}</b>: for somebody's rule it is about {chance(OTHERS).replace(" by chance", "")} rare. You cannot see their rules; ask them.</p>
      <div className="la-told" data-role="told">
        <p><b>{GLYPH.told} Ada showed you her card</b> ({told.rule.family.title}): “{told.rule.family.card(told.rule.params as never, told.rule.tieBreaker as string)}”</p>
        <p>{t.sentence.replace("Your rule", "Her rule")} For her this line is {bitsText(told.bits)}.</p>
        {shared && <p className="la-shared">Together: <b>{shared.words}</b> ({fmtNum(shared.price)} ⚡) makes it rarer for both: yours → {bitsText(shared.bits)}; hers → {bitsText(read(told.rule, shared.after, false).bits)}.</p>}
      </div>
    </section>
  );
}

export function toldContributor(rr: Reading, owner: string): Contributor {
  const c = rr.contributors[0]!;
  return { ...c, role: "told", owner, name: `${owner}: ${c.name}` };
}

export { read, ruleOf };
export type { LineState };
