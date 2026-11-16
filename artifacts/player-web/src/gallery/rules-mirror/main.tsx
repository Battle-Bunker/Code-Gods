/**
 * Line Rules Mirror: one static page of the line rules as dealt (the dynamic families, lib/v2-linear
 * dynamic-families.ts; docs/engine-v2/energy.md), built to be published on its own
 * (`pnpm --filter @workspace/player-web build:rules-mirror`; vite.rules-mirror.config.ts, scripts/rules-mirror-html.mjs).
 * For the chosen rule: its card (the formula in words), its parameters (drawn at random or typed in), a line the reader
 * sets, the line's utility, and its energy: the estimate the game pays out, from fresh random starts each time, so it
 * jitters. Everything is computed in the page; it makes no requests.
 */
import { StrictMode, useEffect, useMemo, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { energyOf, Qn, q, rng, type Q, type RuleFamily } from "@workspace/v2-core";
import { describeLine, dynamicFamilies, fromMC, lineQ, lineType, type LineState } from "@workspace/v2-linear";
import "./style.css";

type Family = RuleFamily<LineState, unknown>;
const FAMILIES = dynamicFamilies as readonly Family[];
/** Estimates shown per line, each the mean over the server's own number of random starts (LINE_K): their spread is the jitter. */
const ESTIMATES = 5;

// ------------------------------------------------------------------ numbers

/** "3", "-7/2", "−5/3" or "0.25" as a fraction; null when it is not one. */
function parseQ(text: string): Q | null {
  const t = text.trim().replace(/−/g, "-");
  if (/^-?\d{1,30}\s*\/\s*\d{1,30}$/.test(t)) { const [a, b] = t.split("/"); return BigInt(b!.trim()) === 0n ? null : q(BigInt(a!.trim()), BigInt(b!.trim())); }
  if (/^-?\d{1,30}$/.test(t)) return q(BigInt(t));
  if (/^-?\d{0,15}\.\d{1,15}$/.test(t)) { const [w, f] = t.split("."); const d = 10n ** BigInt(f!.length); const n = BigInt((w === "-" || w === "" ? "0" : w) ?? "0") * d + (t.startsWith("-") ? -1n : 1n) * BigInt(f!); return q(n, d); }
  return null;
}
const fmt = (x: number): string => (!Number.isFinite(x) ? "no score" : Math.abs(x) >= 1e6 || (x !== 0 && Math.abs(x) < 1e-3) ? x.toExponential(3) : x.toFixed(Math.abs(x) >= 100 ? 1 : 3));

// ------------------------------------------------------------------ the page

interface Example { readonly label: string; readonly m: string; readonly c: string }
/** A few lines to try: a plain one, and one on each rule's ladder (the worked examples of test/dynamic-families.test.ts). */
const EXAMPLES: readonly Example[] = [
  { label: "y = 2x + 3", m: "2", c: "3" },
  { label: "y = 7x − 1 (crosses at 1/7)", m: "7", c: "-1" },
  { label: "y = −7/10x − 13/10 (7, 10, 13)", m: "-7/10", c: "-13/10" },
  { label: "y = 3/4x + 25/4 (touches radius 5)", m: "3/4", c: "25/4" },
  { label: "y = −1/8x + 21 (area 42²)", m: "-1/8", c: "21" },
  { label: "y = 1031x + 729 (3⁶)", m: "1031", c: "729" },
];

function App(): ReactElement {
  const [familyId, setFamilyId] = useState(FAMILIES[0]!.id);
  const family = FAMILIES.find(f => f.id === familyId)!;
  const [params, setParams] = useState<unknown>(() => family.dealable(lineQ)[0]);
  const [paramText, setParamText] = useState("");
  const [paramError, setParamError] = useState<string | null>(null);
  const [mText, setMText] = useState("2"), [cText, setCText] = useState("3");
  const [estimates, setEstimates] = useState<number[]>([]);
  const [seed, setSeed] = useState(1);

  const chooseFamily = (id: string) => {
    const f = FAMILIES.find(x => x.id === id)!;
    setFamilyId(id); setParams(f.dealable(lineQ)[0]); setParamText(""); setParamError(null);
  };
  const space = family.space;
  const label = (p: unknown) => space?.label(p as never) ?? JSON.stringify(p);

  const m = parseQ(mText), c = parseQ(cText);
  const state: LineState | null = m && c ? { lines: [fromMC(m, c)] } : null;
  const u = useMemo(() => (state ? family.dynamic!.u(state, params as never) : NaN), [familyId, params, mText, cText]);

  // Fresh randomness on every estimate (the server re-estimates on each change and each look).
  useEffect(() => {
    if (!state) { setEstimates([]); return; }
    const out: number[] = [];
    for (let i = 0; i < ESTIMATES; i++) out.push(energyOf(lineType, family, params, state, lineQ).energy);
    setEstimates(out);
  }, [familyId, params, mText, cText, seed]);
  const mean = estimates.length ? estimates.reduce((a, b) => a + b, 0) / estimates.length : NaN;
  const lo = estimates.length ? Math.min(...estimates) : NaN, hi = estimates.length ? Math.max(...estimates) : NaN;

  return (
    <div className="rm-root">
      <div className="rm-page">
        <header className="rm-header">
          <h1>Line rules</h1>
          <p className="rm-muted">
            The {FAMILIES.length} rules the line games deal. Each scores a line with one number, its <b>utility</b> (bigger is better).
            A line's <b>energy</b>, what the game pays out, is the expected cost of reaching a line at least this good from a random line
            of the same size, using the game's own moves and prices. It is estimated afresh from random starts each time, so it jitters.
          </p>
        </header>
        <div className="rm-grid">
          <nav className="rm-list" aria-label="Rules">
            {FAMILIES.map(f => (
              <button key={f.id} type="button" className={f.id === familyId ? "rm-pick rm-on" : "rm-pick"} onClick={() => chooseFamily(f.id)}>
                <span>{f.title}</span>
                <span className="rm-muted rm-reads">reads {f.dynamic!.reads.map(r => ({ m: "the gradient", c: "the y-intercept", X: "the x-crossing", gen: "a, b, c" } as Record<string, string>)[r] ?? r).join(" and ")}</span>
              </button>
            ))}
          </nav>
          <main className="rm-main">
            <h2>{family.title}</h2>
            <p className="rm-card">{family.card(params as never, null)}</p>

            <h3>Parameters</h3>
            <div className="rm-row">
              <span className="rm-chip">{label(params)}</span>
              {space && <button type="button" onClick={() => { const p = space.draw(rng("mirror", String(Date.now()), String(Math.random()))); setParams(p); setParamText(""); setParamError(null); }}>Draw at random</button>}
              {family.dealable(lineQ).map((p, i) => <button key={i} type="button" onClick={() => setParams(p)}>{label(p)}</button>)}
            </div>
            {space && (
              <form className="rm-row" onSubmit={e => { e.preventDefault(); const r = space.parse(paramText); if ("invalid" in (r as object)) setParamError((r as { invalid: string }).invalid); else { setParams(r); setParamError(null); } }}>
                <label>Type one in <input value={paramText} onChange={e => setParamText(e.target.value)} placeholder={space.hint} /></label>
                <button type="submit">Use</button>
                <span className="rm-muted">{space.size.toLocaleString()} in all</span>
                {paramError && <span className="rm-warn">{paramError}</span>}
              </form>
            )}

            <h3>A line</h3>
            <div className="rm-row">
              <label>y = <input className="rm-num" value={mText} onChange={e => setMText(e.target.value)} aria-label="gradient" /></label>
              <label>x + <input className="rm-num" value={cText} onChange={e => setCText(e.target.value)} aria-label="y-intercept" /></label>
              {!state && <span className="rm-warn">type whole numbers, fractions such as −7/2, or decimals</span>}
            </div>
            <div className="rm-row">
              {EXAMPLES.map(x => <button key={x.label} type="button" onClick={() => { setMText(x.m); setCText(x.c); }}>{x.label}</button>)}
            </div>

            {state && (
              <dl className="rm-facts">
                <dt>The line</dt><dd>{describeLine(state.lines[0]!)} (crosses the x-axis at {Qn.isZero(m!) ? "nowhere" : Qn.toWire(Qn.div(Qn.neg(c!), m!))})</dd>
                <dt>Utility</dt><dd>{fmt(u)}</dd>
                <dt>Energy</dt>
                <dd>
                  {fmt(mean)} <span className="rm-muted">(the mean of {ESTIMATES} estimates; they ranged {fmt(lo)} to {fmt(hi)})</span>{" "}
                  <button type="button" onClick={() => setSeed(seed + 1)}>Estimate again</button>
                </dd>
              </dl>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
