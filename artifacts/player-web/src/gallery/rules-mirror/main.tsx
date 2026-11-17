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
import { argBits, universalBits, energyOf, physicsOf, Qn, q, rng, type Q, type RuleFamily } from "@workspace/v2-core";
import { variantOf } from "../../sdk/object-types.ts";
import { applySteps, candidateFamilies, CF_SLOTS, describeLine, expandAdd, dynamicFamilies, fromMC, lensById, lensSurprise, mutationBits, lineType, roundHalfAway, type Line, type LensId, type LineState } from "@workspace/v2-linear";
import "./style.css";
/** Lines · beginner's board with its configuration's physics (gravity, estimator starts). */
const lineQ = variantOf("line-q");

type Family = RuleFamily<LineState, unknown>;
const FAMILIES = dynamicFamilies as readonly Family[];
/** The shortlisted candidate rules (candidate-families.ts): shown to try and measure, never dealt in a game. */
const CANDIDATES = candidateFamilies as readonly Family[];
const ALL = [...FAMILIES, ...CANDIDATES];
/** Estimates shown per line, each the mean over the server's own number of random starts: their range is the jitter. */
const ESTIMATES = 3;

// ------------------------------------------------------------------ example turns (lens-routes.ts prices)

/** Short names of the lenses for the table. */
const LENS_SHORT: Readonly<Record<string, string>> = { mc: "gradient, y-intercept", xy: "x- and y-intercepts", abc: "a, b, c", mA: "gradient, area", cf: "continued fractions", pe: "prime exponents" };
interface Turn { readonly words: string; readonly to: string; readonly naming: number; readonly surprise: number }
/** A few one-mutation turns from the line, each in its lens, priced as the game prices a turn: naming bits plus surprise. */
function exampleTurns(l: Line): Turn[] {
  const out: Turn[] = [];
  // Each turn is one mutation: its naming bits are that mutation's; its surprise is over the lens's numbers before and
  // after (in lowest terms), with the bits that name the lens (arg −1: a swap or round, named by its pair).
  const one = (lensId: LensId, words: string, arg: number, edit: (ns: bigint[]) => bigint[] | null) => {
    const lens = lensById(lensId), xs = lens.numbers(l);
    if (!xs) return;
    const ts = edit(xs.slice());
    const t = ts && lens.line(ts, l), back = t && lens.numbers(t);
    if (!t || !back) return;
    out.push({ words: `${LENS_SHORT[lens.id] ?? lens.id}: ${words}`, to: describeLine(t), naming: mutationBits(lens, Math.max(0, arg), arg < 0), surprise: lensSurprise(physicsOf(lineQ).gravity, xs, back) });
  };
  one("mc", "add 1 to the y-intercept's top", argBits(1n, true), ns => { ns[2] = ns[2]! + 1n; return ns; });
  one("mc", "multiply the y-intercept's top by 10", universalBits(10n), ns => { ns[2] = ns[2]! * 10n; return ns; });
  one("mc", "add 1,000 to the y-intercept's top", argBits(1000n, true), ns => { ns[2] = ns[2]! + 1000n; return ns; });
  one("mc", "swap the gradient's top and bottom", -1, ns => (ns[0] === 0n ? null : [ns[0]! < 0n ? -ns[1]! : ns[1]!, ns[0]! < 0n ? -ns[0]! : ns[0]!, ns[2]!, ns[3]!]));
  one("mc", "round the y-intercept", -1, ns => (ns[3] === 1n ? null : [ns[0]!, ns[1]!, roundHalfAway(q(ns[2]!, ns[3]!)), 1n]));
  one("xy", "add 1 to the x-crossing's top", argBits(1n, true), ns => { ns[0] = ns[0]! + 1n; return ns; });
  one("abc", "add 1 to a", argBits(1n, true), ns => { ns[0] = ns[0]! + 1n; return ns; });
  one("mA", "multiply the area's top by 4", universalBits(4n), ns => { ns[2] = ns[2]! * 4n; return ns; });
  // The fine-structure lenses: a continued fraction grows by adding to its first empty slot; an exponent by 1.
  const slots = CF_SLOTS;
  one("cf", "append 2 to the gradient's continued fraction", argBits(2n, true), ns => { const i = ns.findIndex((v, j) => j > 0 && j < slots && v === 0n); if (i < 0) return null; ns[i] = 2n; return ns; });
  one("cf", "add 1 to the y-intercept's whole part", argBits(1n, true), ns => { ns[slots] = ns[slots]! + 1n; return ns; });
  one("pe", "one more 3 in the gradient's bottom", argBits(1n, true), ns => { ns[8] = ns[8]! + 1n; return ns; });
  one("pe", "one more 2 in the y-intercept's top", argBits(1n, true), ns => { ns[14] = ns[14]! + 1n; return ns; });
  // "Add 1/3 to the gradient": two whole-number mutations in one turn (multiply the bottom, then add to the top).
  {
    const mc = lensById("mc"), xs = mc.numbers(l);
    if (xs) {
      const steps = expandAdd(xs[0]!, xs[1]!, 1n, 3n), m = applySteps(xs[0]!, xs[1]!, steps), t = mc.line([m.n, m.d, xs[2]!, xs[3]!], l), back = t && mc.numbers(t);
      if (t && back) out.push({
        words: `${LENS_SHORT.mc}: add 1/3 to the gradient (${steps.map(s => (s.kind === "mul" ? `multiply its bottom by ${s.k}` : `add ${s.k} to its top`)).join(", then ")})`,
        to: describeLine(t), naming: steps.reduce((b, s) => b + mutationBits(mc, s.kind === "mul" ? universalBits(s.k) : argBits(s.k, true)), 0),
        surprise: lensSurprise(physicsOf(lineQ).gravity, xs, back),
      });
    }
  }
  return out;
}

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
  const family = ALL.find(f => f.id === familyId)!, isCandidate = CANDIDATES.includes(family);
  const [params, setParams] = useState<unknown>(() => family.dealable(lineQ)[0]);
  const [paramText, setParamText] = useState("");
  const [paramError, setParamError] = useState<string | null>(null);
  const [mText, setMText] = useState("2"), [cText, setCText] = useState("3");
  const [estimates, setEstimates] = useState<{ energy: number; spread: number }[]>([]);
  const [seed, setSeed] = useState(1);

  const chooseFamily = (id: string) => {
    const f = ALL.find(x => x.id === id)!;
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
    const out: { energy: number; spread: number }[] = [];
    for (let i = 0; i < ESTIMATES; i++) { const e = energyOf(lineType, family, params, state, lineQ); out.push({ energy: e.energy, spread: e.spread ?? NaN }); }
    setEstimates(out);
  }, [familyId, params, mText, cText, seed]);
  const es = estimates.map(e => e.energy), mean = es.length ? es.reduce((a, b) => a + b, 0) / es.length : NaN;
  const lo = es.length ? Math.min(...es) : NaN, hi = es.length ? Math.max(...es) : NaN;
  const spread = estimates.length ? estimates.reduce((a, b) => a + b.spread, 0) / estimates.length : NaN;
  const turns = useMemo(() => (state ? exampleTurns(state.lines[0]!) : []), [mText, cText]);

  const pick = (f: Family) => (
    <button key={f.id} type="button" className={f.id === familyId ? "rm-pick rm-on" : "rm-pick"} onClick={() => chooseFamily(f.id)}>
      <span>{f.title}</span>
      <span className="rm-muted rm-reads">reads {f.dynamic!.reads.map(r => ({ m: "the gradient", c: "the y-intercept", X: "the x-crossing", gen: "a, b, c", area: "the area" } as Record<string, string>)[r] ?? r).join(" and ")}</span>
    </button>
  );

  return (
    <div className="rm-root">
      <div className="rm-page">
        <header className="rm-header">
          <h1>Line rules</h1>
          <p className="rm-muted">
            The {FAMILIES.length} rules the line games deal. Each scores a line with one number, its <b>utility</b> (bigger is better).
            A line's <b>energy</b>, in bits, is the average over random lines of the same size of how surprising it is to reach a line at
            least this good in one turn: a turn's cost is the bits that name its mutations plus its surprise. It is estimated afresh
            from random starts each time, so it jitters; the ± is the standard error of one estimate.
          </p>
        </header>
        <div className="rm-grid">
          <nav className="rm-list" aria-label="Rules">
            {FAMILIES.map(f => pick(f))}
            <h3 className="rm-group">Candidate rules (not dealt)</h3>
            {CANDIDATES.map(f => pick(f))}
          </nav>
          <main className="rm-main">
            <h2>{family.title}{isCandidate && <span className="rm-muted"> · a candidate, not dealt in any game</span>}</h2>
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
                  {fmt(mean)} bits ± {fmt(spread)} <span className="rm-muted">(the mean of {ESTIMATES} estimates; they ranged {fmt(lo)} to {fmt(hi)})</span>{" "}
                  <button type="button" onClick={() => setSeed(seed + 1)}>Estimate again</button>
                </dd>
                <dt>Some turns from here</dt>
                <dd>
                  <table className="rm-turns">
                    <thead><tr><th>Turn</th><th>Gives</th><th>Naming</th><th>Surprise</th><th>Bits</th></tr></thead>
                    <tbody>
                      {turns.map(t => (
                        <tr key={t.words}><td>{t.words}</td><td>{t.to}</td><td>{fmt(t.naming)}</td><td>{fmt(t.surprise)}</td><td>{fmt(t.naming + t.surprise)}</td></tr>
                      ))}
                    </tbody>
                  </table>
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
