/**
 * The cycle diagnostic (analytic calibration study, docs/engine-v2/analytic-calibration.md §2): how far a variant's
 * price list is from an exact potential. The walk (v2-core walkStep) proposes a mutator uniformly, its arguments from
 * their code (2^−bits) and accepts growth of the read length φ with probability 2^−Δφ: Metropolis on φ. The effective
 * price of s → t is −log2 q(s → t) + max(0, Δφ), q the proposal weight summed over every (mutator, arguments) that
 * maps s to t. Around any loop the Δφ terms telescope, so the price list is cycle-consistent with E = φ (up to a
 * gradient) exactly when the argument asymmetries r(s → t) = log2 q(s → t) / q(t → s) sum to zero around every loop.
 */
import { isInvalid } from "./contracts.ts";
import type { ObjectType, Variant } from "./contracts.ts";
import { variantMutators } from "./walk.ts";

export interface Edge { readonly to: string; q: number; readonly byMutator: Map<string, number> }
export interface ProposalTable<S> { readonly out: (s: S) => Map<string, Edge>; readonly decode: (w: string) => S }

/** Exact proposal weights from a state, every argument up to maxArgBits (the remainder bounds the truncation). */
export function proposals<S>(type: ObjectType<S>, variant: Variant, maxArgBits: number): ProposalTable<S> {
  const ms = variantMutators(type, variant);
  const cache = new Map<string, Map<string, Edge>>();
  const out = (s: S): Map<string, Edge> => {
    const key = type.encode(s);
    let edges = cache.get(key);
    if (edges) return edges;
    edges = new Map();
    for (const m of ms) {
      const code = m.args(variant);
      if (!code.enumerate) throw new Error(`${m.id} cannot enumerate its arguments`);
      const sites = m.perSite ? type.sites(s, variant) : 1;
      for (let site = 0; site < sites; site++) for (const a of code.enumerate(maxArgBits)) {
        const r = m.apply(s, site, a, variant);
        if (isInvalid(r)) continue;
        const to = type.encode(r);
        if (to === key) continue;
        const w = 2 ** -code.bits(a) / ms.length / sites;
        let e = edges.get(to);
        if (!e) edges.set(to, e = { to, q: 0, byMutator: new Map() });
        e.q += w;
        e.byMutator.set(m.id, (e.byMutator.get(m.id) ?? 0) + w);
      }
    }
    cache.set(key, edges);
    return edges;
  };
  return { out, decode: w => type.decode(w) };
}

export interface CycleReport {
  readonly edges: number;
  /** Edges whose reverse has no proposal at all within the argument bound (one-way), per mutator. */
  readonly oneWay: Record<string, number>;
  /** Per mutator: edges it proposes, and the largest |log2 q_m(s→t)/q_m(t→s)| among two-way ones. */
  readonly perMutator: Record<string, { edges: number; asymmetric: number; worst: number }>;
  /** |r| over two-way edges: the largest and the median. */
  readonly worstEdge: number;
  readonly medianEdge: number;
  /** |Σ r| over the triangles and squares found among the states: the largest and the median. */
  readonly worstCycle: number;
  readonly medianCycle: number;
  readonly cycles: number;
}

const maxOf = (xs: readonly number[]) => xs.reduce((a, b) => Math.max(a, b), 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };

/**
 * Runs the diagnostic over `states` (and the states they reach in one proposal). Edges whose weight either way is
 * below 2^−(maxArgBits − margin) are left out: their reverse may lie beyond the argument bound.
 */
export function cycleDiagnostic<S>(type: ObjectType<S>, variant: Variant, states: readonly S[], maxArgBits: number, margin = 6): CycleReport {
  const t = proposals(type, variant, maxArgBits);
  const floor = 2 ** -(maxArgBits - margin);
  const keys = new Set(states.map(s => type.encode(s)));
  const r = new Map<string, number>();   // "a|b" → log2 q(a→b)/q(b→a)
  const oneWay: Record<string, number> = {};
  const perMutator: Record<string, { edges: number; asymmetric: number; worst: number }> = {};
  let edges = 0;
  for (const s of states) {
    const a = type.encode(s);
    for (const e of t.out(s).values()) {
      if (e.q < floor) continue;
      const back = t.out(t.decode(e.to)).get(a);
      edges++;
      for (const [m, w] of e.byMutator) {
        const pm = perMutator[m] ??= { edges: 0, asymmetric: 0, worst: 0 };
        pm.edges++;
        const wb = back?.byMutator.get(m) ?? 0;
        if (wb === 0) { oneWay[m] = (oneWay[m] ?? 0) + 1; continue; }
        const x = Math.abs(Math.log2(w / wb));
        if (x > 1e-9) { pm.asymmetric++; pm.worst = Math.max(pm.worst, x); }
      }
      if (back && back.q >= floor) r.set(`${a}|${e.to}`, Math.log2(e.q / back.q));
    }
  }
  // Short loops among the given states: triangles a→b→c→a and squares a→b→c→d→a over two-way edges.
  const nbr = new Map<string, string[]>();
  for (const k of r.keys()) { const [x, y] = k.split("|") as [string, string]; if (keys.has(x) && keys.has(y)) (nbr.get(x) ?? nbr.set(x, []).get(x)!).push(y); }
  const sums: number[] = [];
  loops: for (const [a, bs] of nbr) for (const b of bs) for (const c of nbr.get(b) ?? []) {
    if (c === a) continue;
    if (r.has(`${c}|${a}`)) sums.push(Math.abs(r.get(`${a}|${b}`)! + r.get(`${b}|${c}`)! + r.get(`${c}|${a}`)!));
    for (const d of nbr.get(c) ?? []) if (d !== a && d !== b && r.has(`${d}|${a}`)) sums.push(Math.abs(r.get(`${a}|${b}`)! + r.get(`${b}|${c}`)! + r.get(`${c}|${d}`)! + r.get(`${d}|${a}`)!));
    if (sums.length > 200_000) break loops;
  }
  const abs = [...r.values()].map(Math.abs);
  return { edges, oneWay, perMutator, worstEdge: maxOf(abs), medianEdge: median(abs), worstCycle: maxOf(sums), medianCycle: median(sums), cycles: sums.length };
}
