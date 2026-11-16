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
import { q, Qn, rng, ruleLayers, type Q, type Score } from "@workspace/v2-core";
import { describeLine, encodeLine, fromMC, intercept, isVertical, lineQ, lineType, normalise, shift, slope, tilt, type Line, type LineState } from "@workspace/v2-linear";
import { areaSquare, dynamicEnergy, dynamicExamples, gradientPrime, height as trialHeight, interceptSmooth, isPrimeN, mcOf, rarityHeight, rarityOfLine, rarityRules, sidewaysSampled, targetRule, targetsPrimesEnding, targetsSmooth, targetsSquares, TRIAL, TRIAL_LOG, trialScore, type TrialRule } from "@workspace/v2-linear";
import { valueLookup, type Lookup, type ValueFunction } from "@workspace/v2-valuation";
import { annotate, ExpandedFace, ObjectChip, partName, type RuleRef, type ValuePart } from "@workspace/v2-views";
import { chanceText, exactOrDecimal, fmtBits, fmtQ, isApprox, rarerThanText } from "@workspace/v2-views/format";
import "@workspace/v2-views/styles.css";
import "./style.css";
import { autoLines, CURATED } from "../line-examples";
import { mirrorCatalogue, paramsLabel, type MirrorFamily, type MirrorParams, type MirrorVariant } from "./pool";
import { drawRules, togetherMap, type TogetherRule } from "./together";

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

/** A family whose parameter sets are too many to list: draw another from its space, or type one in. */
function SpaceControls({ f, onParams }: { f: MirrorFamily; onParams: (p: MirrorParams) => void }) {
  const space = f.space!;
  const draws = useRef(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const use = () => {
    const p = space.parse(text);
    if (p && typeof p === "object" && "invalid" in p) { setError(String((p as { invalid: string }).invalid)); return; }
    setError(null);
    onParams(f.paramsOf(p));
  };
  return (
    <div className="rm-field" data-testid="space">
      <span className="rm-hint">The sets above are a sample of about {space.size.toLocaleString("en")} that can be drawn. {space.hint}</span>
      <div className="rm-buttons">
        <button type="button" className="rm-btn" data-testid="draw-another" onClick={() => { setError(null); onParams(f.paramsOf(space.draw(rng(`mirror:${f.family.id}:${draws.current++}`)))); }}>Draw another</button>
        <input className="rm-num" data-wide="" style={{ width: "16em" }} aria-label="Type a parameter set" placeholder={f.params[0]?.label} spellCheck={false} autoComplete="off"
          data-testid="type-params" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") use(); }} />
        <button type="button" className="rm-btn" data-testid="use-params" onClick={use}>Use these</button>
      </div>
      {error && <span className="rm-error" data-testid="params-error">{error}</span>}
    </div>
  );
}

function Rule({ f, line, onLine }: { f: MirrorFamily; line: Line; onLine: (l: Line) => void }) {
  const [pi, setPi] = useState(() => firstDealt(f.params));
  // Parameter sets drawn or typed on this page, after the family's listed ones.
  const [extra, setExtra] = useState<readonly MirrorParams[]>([]);
  const listed = useMemo(() => [...f.params, ...extra], [f, extra]);
  const addParams = (x: MirrorParams) => {
    const at = listed.findIndex(y => y.label === x.label);
    if (at >= 0) { setPi(at); return; }
    setExtra([...extra, x]); setPi(listed.length);
  };
  const p: MirrorParams = listed[pi] ?? listed[0]!;
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

      <h3>Parameters <span className="rm-muted">({f.space ? `about ${f.space.size.toLocaleString("en")} drawable sets; ${listed.length} shown` : `${f.params.length} dealable ${f.params.length === 1 ? "set" : "sets"}`})</span></h3>
      <div className="rm-buttons" data-testid="params">
        {listed.map((x, i) => <Pill key={x.label} on={i === pi} testId="param" onClick={() => { setPi(i); setVi(Math.min(vi, x.variants.length - 1)); }}>{x.label}</Pill>)}
      </div>
      {f.space && <SpaceControls f={f} onParams={addParams} />}
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
      <TrialPanel line={line} />
      <div className="rm-face" data-testid="face">
        <ExpandedFace rule={rule} state={state} value={value} parts={parts} />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ the scoring trial (docs/engine-v2/scoring-trial.md)

/**
 * The same line under the scoring trial: its height and three trial rules' scores (worth of the best trophy less k ×
 * the price to reach it), computed from formulas, beside today's bits above. The trial's families are its own; the
 * family chosen above has no trial form yet.
 */
function TrialPanel({ line }: { line: Line }) {
  const [suffix, setSuffix] = useState("1"), [primes, setPrimes] = useState("3, 17"), [mode, setMode] = useState<"linear" | "log" | "rarity" | "sideways" | "dynamic">("log");
  const D = mode === "log" || mode === "sideways" || mode === "dynamic" ? TRIAL_LOG : TRIAL;
  const rules = useMemo<TrialRule[]>(() => {
    const out: TrialRule[] = [];
    try { out.push(gradientPrime(suffix.trim())); } catch { /* not a drawable suffix */ }
    const ps = primes.split(/[ ,]+/).filter(Boolean).map(Number);
    if (ps.length && ps.every(isPrimeN) && ps.length <= 4) out.push(interceptSmooth(ps, true));
    out.push(areaSquare(100));
    return out;
  }, [suffix, primes]);
  const H = trialHeight(line, D);
  const rows = useMemo(() => (mode === "rarity" || mode === "dynamic" ? [] : rules.map(r => ({ r, s: trialScore(r, line, D) }))), [rules, line, D, mode]);
  const rarity = useMemo(() => {
    if (mode !== "rarity") return null;
    const ps = primes.split(/[ ,]+/).filter(Boolean).map(Number);
    if (!/^[0-9]{0,3}[1379]$/.test(suffix.trim()) || !ps.length || !ps.every(isPrimeN)) return [];
    return rarityRules(suffix.trim(), ps).map(r => ({ r, b: rarityOfLine(r, line) }));
  }, [mode, suffix, primes, line]);
  const sideways = useMemo(() => {
    if (mode !== "sideways") return null;
    const ps = primes.split(/[ ,]+/).filter(Boolean).map(Number);
    if (!/^[0-9]{0,3}[1379]$/.test(suffix.trim()) || !ps.length || !ps.every(isPrimeN)) return [];
    return [targetRule(`A: |m| near a prime ending ${suffix.trim()}`, "m", targetsPrimesEnding(suffix.trim())), targetRule(`B: |c| near a number built from ${ps.join(", ")}`, "c", targetsSmooth(ps)), targetRule("C: area near a perfect square", "area", targetsSquares)]
      .map(r => ({ r, s: sidewaysSampled(r, line, 40) }));
  }, [mode, suffix, primes, line]);
  const dynamic = useMemo(() => (mode === "dynamic" ? dynamicExamples.map(u => ({ u, e: dynamicEnergy(line, u) })) : null), [mode, line]);
  const mc = mcOf(line);
  return (
    <div className="rm-verdict" data-testid="trial">
      <div className="rm-verdict-head"><span>Scoring trial</span> <span className="rm-muted">height {mode === "rarity" ? (mc ? `${rarityHeight(mc).toFixed(2)} bits (the law's −log2 chance)` : "off the trial board") : Number.isFinite(H) ? `${H.toFixed(2)}${D === TRIAL_LOG ? ` energy (${(H / D.g).toFixed(2)} doublings)` : " bits"}` : "off the trial board"}</span></div>
      <div className="rm-buttons" data-testid="trial-mode">
        <Pill on={mode === "log"} onClick={() => setMode("log")}>log height (g a doubling)</Pill>
        <Pill on={mode === "linear"} onClick={() => setMode("linear")}>linear height (g a unit)</Pill>
        <Pill on={mode === "rarity"} onClick={() => setMode("rarity")}>scale-free rarity (bits)</Pill>
        <Pill on={mode === "sideways"} onClick={() => setMode("sideways")}>lift + sideways (energy)</Pill>
        <Pill on={mode === "dynamic"} onClick={() => setMode("dynamic")}>dynamic (energy)</Pill>
      </div>
      <p className="rm-muted">{mode === "rarity" ? "Bits = level + closeness + third, each a rarity under the law with chance 2^−H (level: this basin or a higher one; closeness: at least this close, given the basin; third: the second reading, given both). " : ""}Worth of the best trophy less {D.k} × the cheapest price to reach it ({mode === "log"
        ? `g = ${D.g} energy a doubling; friction ${D.alphaS} along the size direction, ${D.alphaD} across it; prices are the game's fees`
        : `g = ${D.g} a unit, α = ${D.alpha.toFixed(4)}, ${D.w} energy a bit`}).
        Suffix <input className="rm-num" value={suffix} onChange={e => setSuffix(e.target.value)} size={4} aria-label="trial gradient suffix" />{" "}
        primes <input className="rm-num" value={primes} onChange={e => setPrimes(e.target.value)} size={8} aria-label="trial intercept primes" /></p>
      {mode === "sideways" && <p className="rm-muted">Energy = the line's height + sideways: the mean cheapest price, from 40 random lines at the same height, into the class of lines at least as good for the rule (fees plus lift; routes of up to two shortcuts and one finishing move).</p>}
      {mode === "dynamic" && <p className="rm-muted">Energy = the mean, over 30 random lines whose numbers the rule reads are this line's size (the others random), of the cheapest price found from each to any line at least as good for the rule: the direct route onto this line, every single move with a solved amount, and the rule's own search heuristics. Fresh randomness each time, so it jitters. No tables, no levels, no lift; continuous utilities (the owner's, 16 November).</p>}
      <table className="rm-trial"><tbody>
        {dynamic?.map(({ u, e }) => (
          <tr key={u.id} data-testid="trial-row" data-family={u.id} data-score={e.energy.toFixed(4)}>
            <td title={u.label}>{u.id}</td><td><b>{Number.isFinite(e.energy) ? e.energy.toFixed(0) : "—"}</b></td>
            <td className="rm-muted">{`utility ${e.u.toFixed(2)}: ${u.label}; ${e.samples.filter(x => x.cost < x.direct).length} of ${e.samples.length} starts beat the direct route`}</td>
          </tr>
        ))}
        {sideways?.map(({ r, s }) => (
          <tr key={r.label} data-testid="trial-row" data-family={r.label.slice(0, 1)} data-score={s.energy.toFixed(4)}>
            <td title={r.label}>{r.label.split(":")[0]}</td><td><b>{s.energy.toFixed(0)}</b></td>
            <td className="rm-muted">{`height ${s.height.toFixed(0)} + sideways ${s.sideways.toFixed(0)}; ${(100 * s.inClass).toFixed(0)}% of same-height lines already in the class`}</td>
          </tr>
        ))}
        {rarity?.map(({ r, b }) => (
          <tr key={r.label} data-testid="trial-row" data-family={r.label.slice(0, 1)} data-score={b.bits.toFixed(4)}>
            <td title={r.label}>{r.label.split(":")[0]}</td><td><b>{b.bits.toFixed(2)}</b></td>
            <td className="rm-muted">{b.T === null ? "no reading" : `target ${b.T}: level ${b.level.toFixed(2)}, closeness ${b.close.toFixed(2)}${r.third ? `, third ${b.third.toFixed(2)}` : ""}`}</td>
          </tr>
        ))}
        {rows.map(({ r, s }) => (
          <tr key={r.family} data-testid="trial-row" data-family={r.family} data-score={s.score.toFixed(4)}>
            <td title={r.card}>{r.family.replace("trial-", "")}</td><td><b>{s.score.toFixed(2)}</b></td>
            <td className="rm-muted">{s.trophy ? `${s.trophy.label}: worth ${s.worth.toFixed(2)}, price ${s.price.toFixed(2)}` : "no trophy within reach"}</td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}

// ------------------------------------------------------------------ rules together (the second view)

const ALL_FAMILIES = FAMILIES.map(x => x.family);
/** Two or three rules on one line: each rule's card and tuple side by side, and a map of where they agree near the line. */
function Together({ line, onLine }: { line: Line; onLine: (l: Line) => void }) {
  const [count, setCount] = useState(3), [draws, setDraws] = useState(0);
  const [rules, setRules] = useState<TogetherRule[]>(() => drawRules(ALL_FAMILIES, 3, "together:0"));
  const draw = (n = count) => { const k = draws + 1; setDraws(k); setRules(drawRules(ALL_FAMILIES, n, `together:${k}`)); };
  const setFamily = (i: number, id: string) => {
    const family = ALL_FAMILIES.find(f => f.id === id)!;
    const one = drawRules([family], 1, `together:${draws}:${i}:${id}`)[0]!;
    setRules(rules.map((r, j) => (j === i ? one : r)));
  };
  const state = useMemo<LineState>(() => ({ lines: [line] }), [line]);
  const vertical = isVertical(line);
  const map = useMemo(() => (vertical ? null : togetherMap(rules, slope(line), intercept(line))), [rules, line, vertical]);
  const refs = rules.map(r => ({ type: lineType, family: r.family, params: r.params, variant: lineQ, tieBreaker: r.tieBreaker }) as RuleRef<LineState, unknown>);
  const label = (r: TogetherRule) => (r.family.space ? r.family.space.label(r.params as never) : paramsLabel(r.params));
  const joint = (x: number) => `hsl(${Math.round(120 * x)} 60% ${Math.round(85 - 45 * x)}%)`;
  return (
    <section className="rm-rule" data-testid="together">
      <h2>Rules together</h2>
      <p className="rm-muted">Two or three rules, drawn from every line family (dealt or not) with parameters drawn from each family's whole space, on one line.
        The map below ranks the lines near this one for each rule (main part first, then its later layers); a square's colour is the weakest rule's rank, so green is where all of them do well together.
        It is not the game's worth: it shows where the rules agree and where they pull apart.</p>
      <div className="rm-buttons">
        <Pill on={count === 2} onClick={() => { setCount(2); draw(2); }}>two rules</Pill>
        <Pill on={count === 3} onClick={() => { setCount(3); draw(3); }}>three rules</Pill>
        <button type="button" className="rm-btn" data-testid="together-draw" onClick={() => draw()}>Draw other rules</button>
      </div>
      <h3>The line</h3>
      <Editor line={line} onLine={onLine} />
      <div className="rm-together" style={{ display: "grid", gridTemplateColumns: `repeat(${rules.length}, minmax(0, 1fr))`, gap: "12px" }}>
        {rules.map((r, i) => {
          const a = annotate(refs[i]!, state), layers = ruleLayers(r.family, r.tieBreaker);
          return (
            <div key={i} className="rm-verdict" data-testid="together-rule" data-family={r.family.id}>
              <select value={r.family.id} onChange={e => setFamily(i, e.target.value)} aria-label={`rule ${i + 1}`}>
                {ALL_FAMILIES.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
              <p className="rm-muted">{label(r)}{r.tieBreaker ? ` · ${r.tieBreaker}` : ""}</p>
              <blockquote className="rm-card">{r.family.card(r.params, r.tieBreaker)}</blockquote>
              {a.utility === null ? <p>Score: none. {a.worst ?? ""}</p> : (
                <table className="rm-score"><tbody>
                  {layers.map((l, k) => <tr key={l.id}><td>{partName(k)}</td><td>{l.title}</td><td className="rm-n">{a.utility![k] == null ? "none" : fmtQ(a.utility![k]!)}</td></tr>)}
                </tbody></table>
              )}
              <ul className="rm-muted">{a.sites[0]?.parts.map(pt => <li key={pt.depth}>{pt.title}: {pt.valueText}</li>)}</ul>
            </div>
          );
        })}
      </div>
      <h3>Where they agree, near this line</h3>
      {map === null ? <p className="rm-muted">A vertical line has no gradient: choose another line to see the map.</p> : (
        <>
          <p className="rm-muted">Across: the gradient, {Qn.toWire(map.ms[0]!)} to {Qn.toWire(map.ms.at(-1)!)} in halves. Down: the y-intercept, {Qn.toWire(map.cs.at(-1)!)} to {Qn.toWire(map.cs[0]!)}. The ringed square is this line; click a square to move there.</p>
          <div data-testid="together-map" style={{ display: "grid", gridTemplateColumns: `repeat(${map.ms.length}, 18px)`, gap: "1px", width: "max-content", maxWidth: "100%", overflowX: "auto" }}>
            {[...map.cs].reverse().flatMap(c => map.ms.map(m => {
              const cell = map.cells.find(x => Qn.cmp(x.m, m) === 0 && Qn.cmp(x.c, c) === 0)!, here = Qn.cmp(m, slope(line)) === 0 && Qn.cmp(c, intercept(line)) === 0;
              return <button key={`${Qn.toWire(m)},${Qn.toWire(c)}`} type="button" title={`${describeLine(fromMC(m, c))}: ${cell.standing.map(x => `${Math.round(100 * x)}%`).join(", ")}`}
                onClick={() => onLine(fromMC(m, c))} style={{ width: 18, height: 18, padding: 0, border: here ? "2px solid currentColor" : "none", background: joint(cell.joint) }} />;
            }))}
          </div>
          <p data-testid="together-best">{map.best.length
            ? <>Jointly good places in this window (every rule in its top {Math.round(100 * (1 - 0.85))}% here, no better neighbour): {map.best.slice(0, 6).map(b => (
              <button key={`${Qn.toWire(b.m)},${Qn.toWire(b.c)}`} type="button" className="rm-btn" onClick={() => onLine(fromMC(b.m, b.c))}>{describeLine(fromMC(b.m, b.c))}</button>))}</>
            : "No line in this window is in the top 15% for every rule: these rules pull apart here."}</p>
        </>
      )}
    </section>
  );
}

function Page(): ReactElement {
  const scheme = useScheme();
  const [familyId, setFamilyId] = useState(FAMILIES[0]!.family.id);
  const [line, setLine] = useState<Line>(() => fromMC(q(2), q(3)));
  const [view, setView] = useState<"one" | "together">("one");
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
          <div>
            <div className="rm-buttons" data-testid="view">
              <Pill on={view === "one"} onClick={() => setView("one")}>One rule</Pill>
              <Pill on={view === "together"} onClick={() => setView("together")} testId="view-together">Rules together</Pill>
            </div>
            {view === "one" ? <Rule key={f.family.id} f={f} line={line} onLine={setLine} /> : <Together line={line} onLine={setLine} />}
          </div>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
