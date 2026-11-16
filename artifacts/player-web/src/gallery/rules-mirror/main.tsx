/**
 * Line Rules Mirror: one static page of every line rule family, built to be published on its own
 * (`pnpm --filter @workspace/player-web build:rules-mirror`; vite.rules-mirror.config.ts, scripts/rules-mirror-html.mjs).
 * The families the beginner line preset deals and those it does not (pool.ts, held to the dealer by
 * test/rules-mirror-pool.test.ts); for the chosen family, parameter set and secondary: the card as a player reads it and
 * the game's own annotation view (v2-views' ExpandedFace) of a line the reader sets. Everything is computed in the page
 * from the rule libraries and the value files under lib/v2-valuation/values/line-q; it makes no requests.
 */
import { StrictMode, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { q, ruleLayers, type Q, type Score } from "@workspace/v2-core";
import { describeLine, encodeLine, fromMC, intercept, isVertical, lineQ, lineType, normalise, shift, slope, tilt, type Line, type LineState } from "@workspace/v2-linear";
import { valueLookup, type Lookup, type ValueFunction } from "@workspace/v2-valuation";
import { annotate, ExpandedFace, ObjectChip, partName, type RuleRef, type ValuePart } from "@workspace/v2-views";
import { chanceText, exactOrDecimal, fmtBits, fmtQ, isApprox, rarerThanText } from "@workspace/v2-views/format";
import "@workspace/v2-views/styles.css";
import "./style.css";
import { autoLines, CURATED } from "../line-examples";
import { mirrorCatalogue, type MirrorFamily, type MirrorParams, type MirrorVariant } from "./pool";

const RECORDS = import.meta.glob("../../../../../lib/v2-valuation/values/line-q/*/*.json", { eager: true, import: "default" }) as Record<string, ValueFunction>;
const BY_KEY = new Map(Object.values(RECORDS).map(r => [r.ruleKey, r]));
const CATALOGUE = mirrorCatalogue(k => BY_KEY.has(k));
const FAMILIES = [...CATALOGUE.dealt, ...CATALOGUE.undealt];
const UNDEALT_FLAT = CATALOGUE.undealt.filter(f => !f.tree), UNDEALT_TREE = CATALOGUE.undealt.filter(f => f.tree);

const LOOKUPS = new Map<string, ((u: Score) => Lookup) | null>();
function lookupOf(ruleKey: string): ((u: Score) => Lookup) | null {
  if (!LOOKUPS.has(ruleKey)) { const r = BY_KEY.get(ruleKey); LOOKUPS.set(ruleKey, r ? valueLookup(r) : null); }
  return LOOKUPS.get(ruleKey)!;
}

// ------------------------------------------------------------------ the scheme (the host's data-theme, else the system's)

function useScheme(): "light" | "dark" {
  const read = (): "light" | "dark" => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") return t;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  const [scheme, setScheme] = useState(read);
  useEffect(() => {
    const update = () => setScheme(read());
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq?.removeEventListener("change", update); mo.disconnect(); };
  }, []);
  return scheme;
}

// ------------------------------------------------------------------ the line editor

const WHOLE = /^[-−]?\d{1,40}$/;
const whole = (s: string): bigint | null => (WHOLE.test(s.trim()) ? BigInt(s.trim().replace("−", "-")) : null);

interface Drafts { mt: string; mb: string; ct: string; cb: string; a: string; b: string; c: string; xt: string; xb: string }
function draftsOf(l: Line): Drafts {
  const abc = { a: String(l.a), b: String(l.b), c: String(l.c) };
  if (isVertical(l)) { const x = q(-l.c, l.a); return { mt: "", mb: "1", ct: "", cb: "1", ...abc, xt: String(x.n), xb: String(x.d) }; }
  const m = slope(l), c = intercept(l);
  return { mt: String(m.n), mb: String(m.d), ct: String(c.n), cb: String(c.d), ...abc, xt: "", xb: "1" };
}
type Group = "mc" | "abc" | "x";
/** The line a group of fields says, or why it says none. An empty top in y = mx + c reads as 0; an empty bottom as 1. */
function lineOf(d: Drafts, g: Group): Line | { invalid: string } {
  const top = (s: string) => (s.trim() === "" ? 0n : whole(s)), bottom = (s: string) => (s.trim() === "" ? 1n : whole(s));
  if (g === "mc") {
    const [mt, mb, ct, cb] = [top(d.mt), bottom(d.mb), top(d.ct), bottom(d.cb)];
    if (mt === null || mb === null || ct === null || cb === null) return { invalid: "whole numbers only, top and bottom" };
    if (mb === 0n || cb === 0n) return { invalid: "a bottom cannot be 0" };
    return fromMC(q(mt, mb), q(ct, cb));
  }
  if (g === "abc") {
    const [a, b, c] = [whole(d.a), whole(d.b), whole(d.c)];
    if (a === null || b === null || c === null) return { invalid: "three whole numbers" };
    return normalise(a, b, c);
  }
  const xt = whole(d.xt), xb = bottom(d.xb);
  if (xt === null || xb === null) return { invalid: "whole numbers only, top and bottom" };
  if (xb === 0n) return { invalid: "a bottom cannot be 0" };
  return normalise(xb, 0n, -xt);
}

function Num({ label, value, onChange, wide }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  return <input className="rm-num" data-wide={wide || undefined} inputMode="text" autoComplete="off" spellCheck={false} aria-label={label} title={label}
    data-field={label} value={value} onChange={e => onChange(e.target.value)} />;
}
function Frac({ label, top, bottom, onTop, onBottom }: { label: string; top: string; bottom: string; onTop: (v: string) => void; onBottom: (v: string) => void }) {
  return (
    <span className="rm-frac">
      <Num label={`${label}: top`} value={top} onChange={onTop} />
      <span className="rm-frac-bar" aria-hidden="true" />
      <Num label={`${label}: bottom`} value={bottom} onChange={onBottom} />
    </span>
  );
}

function Editor({ line, onLine }: { line: Line; onLine: (l: Line) => void }) {
  const enc = encodeLine(line);
  const [drafts, setDrafts] = useState(() => draftsOf(line));
  const [errors, setErrors] = useState<Partial<Record<Group, string>>>({});
  const typed = useRef(enc);
  // A line set from outside the fields (an example, a stepper) rewrites every field; one being typed keeps its text.
  useEffect(() => { if (typed.current !== enc) { typed.current = enc; setDrafts(draftsOf(line)); setErrors({}); } }, [enc]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (g: Group, patch: Partial<Drafts>) => {
    const next = { ...drafts, ...patch };
    const l = lineOf(next, g);
    if ("invalid" in l) { setDrafts(next); setErrors({ [g]: l.invalid }); return; }
    const fresh = draftsOf(l);
    const keep: (keyof Drafts)[] = g === "mc" ? ["mt", "mb", "ct", "cb"] : g === "abc" ? ["a", "b", "c"] : ["xt", "xb"];
    setDrafts({ ...fresh, ...Object.fromEntries(keep.map(k => [k, next[k]])) });
    setErrors({});
    typed.current = encodeLine(l);
    onLine(l);
  };
  const vertical = isVertical(line);
  const step = (m: typeof shift, k: Q) => { const r = m.apply({ lines: [line] }, 0, { k }, lineQ); return "invalid" in r ? null : r.lines[0]!; };
  const steps: { m: typeof shift; k: Q }[] = [
    { m: shift, k: q(1) }, { m: shift, k: q(-1) }, { m: tilt, k: q(1) }, { m: tilt, k: q(-1) },
    { m: shift, k: q(1, 2) }, { m: shift, k: q(-1, 2) }, { m: tilt, k: q(1, 2) }, { m: tilt, k: q(-1, 2) },
  ];
  return (
    <div className="rm-editor" data-testid="editor">
      <div className="rm-field" data-group="mc">
        <span className="rm-field-name">Gradient and y-intercept</span>
        <span className="rm-eq">
          y = <Frac label="gradient" top={drafts.mt} bottom={drafts.mb} onTop={v => edit("mc", { mt: v })} onBottom={v => edit("mc", { mb: v })} /> x +{" "}
          <Frac label="y-intercept" top={drafts.ct} bottom={drafts.cb} onTop={v => edit("mc", { ct: v })} onBottom={v => edit("mc", { cb: v })} />
        </span>
        {errors.mc ? <span className="rm-error">{errors.mc}</span> : vertical && <span className="rm-hint">a vertical line has neither: type here to leave it</span>}
      </div>
      <div className="rm-field" data-group="abc">
        <span className="rm-field-name">As stored: ax + by + c = 0</span>
        <span className="rm-eq">
          <Num label="a" value={drafts.a} onChange={v => edit("abc", { a: v })} wide /> x +{" "}
          <Num label="b" value={drafts.b} onChange={v => edit("abc", { b: v })} wide /> y +{" "}
          <Num label="c" value={drafts.c} onChange={v => edit("abc", { c: v })} wide /> = 0
        </span>
        {errors.abc ? <span className="rm-error">{errors.abc}</span>
          : <span className="rm-hint">kept in lowest terms with b &gt; 0: now {String(line.a)}, {String(line.b)}, {String(line.c)}. b = 0 is a vertical line.</span>}
      </div>
      <div className="rm-field" data-group="x">
        <span className="rm-field-name">Vertical line</span>
        <span className="rm-eq">
          x = <Frac label="x" top={drafts.xt} bottom={drafts.xb} onTop={v => edit("x", { xt: v })} onBottom={v => edit("x", { xb: v })} />
        </span>
        {errors.x ? <span className="rm-error">{errors.x}</span> : !vertical && <span className="rm-hint">type a number to make the line vertical</span>}
      </div>
      <div className="rm-field rm-span">
        <span className="rm-field-name">Cheap moves (the game's own shift and tilt)</span>
        <div className="rm-buttons">
          {steps.map(({ m, k }) => {
            const after = step(m, k);
            return <button key={`${m.id}${k.n}/${k.d}`} type="button" className="rm-btn" disabled={!after} data-step={`${m.id}:${k.n}/${k.d}`}
              onClick={() => after && onLine(after)}>{m.describe({ k }).replace(/-/g, "−")}</button>;
          })}
        </div>
        {vertical && <span className="rm-hint">a vertical line cannot be shifted up or tilted</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the score of the line for the chosen rule

function Verdict({ rule, layers, look, state }: { rule: RuleRef<LineState, unknown>; layers: readonly { id: string; title: string; sense: string }[]; look: ((u: Score) => Lookup) | null; state: LineState }) {
  const a = annotate(rule, state);
  const found = look ? look(a.utility) : null;
  return (
    <div className="rm-verdict" data-testid="verdict" data-bits={found ? found.bits.toFixed(4) : ""} data-score={JSON.stringify(a.utility?.map(x => (x === null ? null : `${x.n}/${x.d}`)) ?? null)}>
      <p className="rm-verdict-head">
        <ObjectChip type={lineType} state={state} />
        {found ? <b data-testid="bits">{fmtBits(found.bits)}</b> : <b data-testid="bits">no bits</b>}
      </p>
      {found
        ? <p>For this rule the line is {rarerThanText(found.bits, "lines")} ({chanceText(found.bits)} by chance).
          {found.at === "beyond" ? " It is better than every measured score: the bits are the value curve's tail." : found.hi - found.lo > 0.005 && Number.isFinite(found.hi) ? ` Measured between ${fmtBits(found.lo)} and ${fmtBits(found.hi)}.` : ""}</p>
        : <p className="rm-muted">This rule has no value file, so its bits cannot be shown; the score and the annotations below are the rule's own.</p>}
      {a.utility === null
        ? <p data-testid="score">Score: none. {a.worst ?? "This rule does not score this line"}.</p>
        : (
          <table className="rm-score" data-testid="score">
            <thead><tr><th>Part</th><th>What it reads</th><th>Score (bigger is better)</th>{found?.parts && <th>Bits</th>}</tr></thead>
            <tbody>
              {layers.map((l, i) => (
                <tr key={l.id}>
                  <td>{partName(i)}</td>
                  <td>{l.title} <span className="rm-muted">({l.sense === "min" ? "smaller is better, so it counts as a minus" : "bigger is better"})</span></td>
                  <td className="rm-n" title={a.utility![i] == null ? undefined : `${a.utility![i]!.n}/${a.utility![i]!.d}`}>{a.utility![i] == null ? "none" : isApprox(a.utility![i]!) ? `≈ ${exactOrDecimal(a.utility![i]!)}` : fmtQ(a.utility![i]!)}</td>
                  {found?.parts && <td className="rm-n">{found.parts[i] === undefined ? "" : fmtBits(found.parts[i]!)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </div>
  );
}

// ------------------------------------------------------------------ the page

function Pill({ on, onClick, children, tag, testId }: { on: boolean; onClick: () => void; children: ReactNode; tag?: string; testId?: string }) {
  return <button type="button" className="rm-pill" aria-pressed={on} onClick={onClick} data-testid={testId}>{children}{tag && <span className="rm-tag">{tag}</span>}</button>;
}

function FamilyList({ title, families, current, onPick }: { title: string; families: readonly MirrorFamily[]; current: string; onPick: (id: string) => void }) {
  return (
    <div className="rm-group">
      <h3>{title}</h3>
      <ul>
        {families.map(f => (
          <li key={f.family.id}>
            <button type="button" aria-current={f.family.id === current || undefined} onClick={() => onPick(f.family.id)} data-family={f.family.id}>{f.family.title}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const firstDealt = (vs: readonly { dealt?: boolean; variants?: readonly MirrorVariant[] }[]) =>
  Math.max(0, vs.findIndex(v => v.dealt ?? v.variants!.some(x => x.dealt)));

function Rule({ f, line, onLine }: { f: MirrorFamily; line: Line; onLine: (l: Line) => void }) {
  const [pi, setPi] = useState(() => firstDealt(f.params));
  const p: MirrorParams = f.params[pi] ?? f.params[0]!;
  const [vi, setVi] = useState(() => firstDealt(p.variants));
  const v: MirrorVariant = p.variants[vi] ?? p.variants[0]!;
  const rule = useMemo<RuleRef<LineState, unknown>>(() => ({ type: lineType, family: f.family, params: p.params, variant: lineQ, tieBreaker: v.tieBreaker }), [f, p, v]);
  const look = lookupOf(v.ruleKey);
  const value = useMemo(() => (look ? (u: Score) => look(u).bits : undefined), [look]);
  const state = useMemo<LineState>(() => ({ lines: [line] }), [line]);
  const layers = ruleLayers(f.family, v.tieBreaker);
  const examples = useMemo(() => {
    const seen = new Set<string>();
    return [...(CURATED[f.family.id]?.lines ?? []), ...autoLines(f.family, p.params, value, v.tieBreaker), { lines: [normalise(1n, 0n, -3n) as Line] }]
      .filter(s => { const k = lineType.encode(s); return seen.has(k) ? false : (seen.add(k), true); });
  }, [f, p, v, value]);
  const parts = useMemo<ValuePart[] | null>(() => {
    const found = look?.(annotate(rule, state).utility);
    return found?.parts ? found.parts.map((bits, i) => ({ layer: layers[i]?.id ?? String(i), bits })) : null;
  }, [look, rule, state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="rm-rule" data-testid="rule" data-family={f.family.id} data-rule-key={v.ruleKey}>
      <h2>{f.family.title} <span className="rm-status" data-dealt={v.dealt || undefined}>{v.dealt ? "dealt in the beginner line preset" : f.dealt ? "this variant is not dealt" : "not dealt"}</span></h2>
      <p className="rm-id">{f.family.id}{f.tree ? " · tree-shaped tuple family" : ""}</p>

      <h3>Parameters <span className="rm-muted">({f.params.length} dealable {f.params.length === 1 ? "set" : "sets"})</span></h3>
      <div className="rm-buttons" data-testid="params">
        {f.params.map((x, i) => <Pill key={x.label} on={i === pi} testId="param" onClick={() => { setPi(i); setVi(Math.min(vi, x.variants.length - 1)); }}>{x.label}</Pill>)}
      </div>
      <h3>{f.tree ? "Layers after the main part" : "Secondary preference"} <span className="rm-muted">({p.variants.length} {p.variants.length === 1 ? "variant" : "variants"})</span></h3>
      <div className="rm-buttons" data-testid="variants">
        {p.variants.map((x, i) => (
          <Pill key={x.tieBreaker ?? "none"} on={i === vi} testId="variant" onClick={() => setVi(i)} tag={f.dealt && !x.dealt ? "not dealt" : undefined}>
            {x.tieBreaker ?? "none"}
          </Pill>
        ))}
      </div>
      {v.layers.length > 0 && <p className="rm-muted rm-layers">{v.layers.map((t, i) => `${partName(i + 1)}: ${t}`).join(" · ")}</p>}

      <h3>The card, as a player reads it</h3>
      <blockquote className="rm-card" data-testid="card">{f.family.card(p.params, v.tieBreaker)}</blockquote>

      <h3>The line</h3>
      <Editor line={line} onLine={onLine} />
      <div className="rm-field">
        <span className="rm-field-name">Example lines for this rule</span>
        <div className="rm-buttons" data-testid="examples">
          {examples.map(s => <button key={lineType.encode(s)} type="button" className="rm-btn" aria-pressed={lineType.encode(s) === encodeLine(line)}
            title={describeLine(s.lines[0]!)} onClick={() => onLine(s.lines[0]!)}><ObjectChip type={lineType} state={s} /></button>)}
        </div>
      </div>

      <h3>What the rule makes of it</h3>
      <Verdict rule={rule} layers={layers} look={look} state={state} />
      <div className="rm-face" data-testid="face">
        <ExpandedFace rule={rule} state={state} value={value} parts={parts} />
      </div>
    </section>
  );
}

function Page(): ReactElement {
  const scheme = useScheme();
  const [familyId, setFamilyId] = useState(FAMILIES[0]!.family.id);
  const [line, setLine] = useState<Line>(() => fromMC(q(2), q(3)));
  const f = FAMILIES.find(x => x.family.id === familyId)!;
  const n = CATALOGUE.dealt.length;
  return (
    <div data-v2v-scheme={scheme} className="rm-root">
      <main className="v2v rm-page">
        <header className="rm-header">
          <h1>Line Rules Mirror</h1>
          <p data-testid="count">
            The beginner line preset (<i>{CATALOGUE.preset.title}</i>, <code>{CATALOGUE.preset.id}</code>, lines on the rationals) deals{" "}
            <b>{n} rule {n === 1 ? "family" : "families"}</b>, as <b>{CATALOGUE.dealtRules} rules</b> (a family, one parameter set and one secondary preference).
            The code holds {CATALOGUE.undealt.length} more line families that this preset does not deal: {UNDEALT_FLAT.length} ordinary and {UNDEALT_TREE.length} tree-shaped tuple families, listed apart below.
          </p>
          <p className="rm-muted">
            Every card, score and drawing here is computed in this page by the game's own rule code and value files. Bits are a line's rarity for the rule
            before the game's correction for other lines holding the same state, so a line in a game can read a little lower.
          </p>
        </header>
        <div className="rm-layout">
          <nav className="rm-nav" aria-label="Rule families">
            <label className="rm-select">
              <span>Rule family</span>
              <select value={familyId} onChange={e => setFamilyId(e.target.value)} data-testid="family-select">
                <optgroup label={`Dealt (${n})`}>{CATALOGUE.dealt.map(x => <option key={x.family.id} value={x.family.id}>{x.family.title}</option>)}</optgroup>
                <optgroup label={`Not dealt (${UNDEALT_FLAT.length})`}>{UNDEALT_FLAT.map(x => <option key={x.family.id} value={x.family.id}>{x.family.title}</option>)}</optgroup>
                <optgroup label={`Not dealt: tree-shaped tuple families (${UNDEALT_TREE.length})`}>{UNDEALT_TREE.map(x => <option key={x.family.id} value={x.family.id}>{x.family.title}</option>)}</optgroup>
              </select>
            </label>
            <div className="rm-lists">
              <FamilyList title={`Dealt (${n})`} families={CATALOGUE.dealt} current={familyId} onPick={setFamilyId} />
              <FamilyList title={`Not dealt (${UNDEALT_FLAT.length})`} families={UNDEALT_FLAT} current={familyId} onPick={setFamilyId} />
              <FamilyList title={`Not dealt: tree-shaped tuple families (${UNDEALT_TREE.length})`} families={UNDEALT_TREE} current={familyId} onPick={setFamilyId} />
            </div>
          </nav>
          <Rule key={f.family.id} f={f} line={line} onLine={setLine} />
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
