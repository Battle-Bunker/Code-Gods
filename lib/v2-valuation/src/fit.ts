/** Curves through a ladder's values, and snapping (spec §7.4). */

export interface Point { readonly t: number; readonly v: number; readonly err: number }

export type Curve =
  | { readonly model: "log-distance"; readonly alpha: number; readonly beta: number; readonly delta: number }
  | { readonly model: "quadratic-count"; readonly alpha: number; readonly beta: number; readonly gamma: number };

export function evalCurve(c: Curve, t: number): number {
  return c.model === "log-distance" ? c.alpha - c.beta * Math.log2(t + c.delta) : c.alpha + c.beta * t + c.gamma * t * t;
}

/** Weighted least squares for v ≈ Σ θ_k f_k(t). */
function wls(points: readonly Point[], basis: readonly ((t: number) => number)[]): number[] | null {
  const k = basis.length;
  const M = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const y = new Array<number>(k).fill(0);
  for (const p of points) {
    const w = 1 / (p.err * p.err);
    const f = basis.map(g => g(p.t));
    for (let i = 0; i < k; i++) {
      y[i]! += w * f[i]! * p.v;
      for (let j = 0; j < k; j++) M[i]![j]! += w * f[i]! * f[j]!;
    }
  }
  // Gaussian elimination.
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    [y[c], y[piv]] = [y[piv]!, y[c]!];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let j = c; j < k; j++) M[r]![j]! -= f * M[c]![j]!;
      y[r]! -= f * y[c]!;
    }
  }
  return y.map((v, i) => v / M[i]![i]!);
}

/** Every residual within twice its error, and the curve non-decreasing in value as the score improves. */
export function accepts(c: Curve, points: readonly Point[]): boolean {
  if (points.some(p => Math.abs(evalCurve(c, p.t) - p.v) > 2 * p.err)) return false;
  if (c.model === "log-distance") return c.beta >= 0;
  const ts = points.map(p => p.t);
  const lo = Math.min(...ts), hi = Math.max(...ts);
  return c.beta + 2 * c.gamma * lo >= 0 && c.beta + 2 * c.gamma * hi >= 0;
}

const DELTAS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2];
const chi2 = (c: Curve, ps: readonly Point[]) => ps.reduce((s, p) => s + ((evalCurve(c, p.t) - p.v) / p.err) ** 2, 0);
const snap = (x: number) => Math.round(x * 256) / 256;

export interface FitResult { readonly curve: Curve; readonly snapped: boolean; readonly accepted: boolean; readonly chi2: number }

/** Fit the model; return the snapped curve when it is still accepted, else the raw fit (accepted or not). */
export function fit(model: "distance" | "count", points: readonly Point[]): FitResult | null {
  if (points.length < 3) return null;
  let best: Curve | null = null;
  if (model === "distance") {
    for (const delta of DELTAS) {
      const th = wls(points, [() => 1, t => -Math.log2(t + delta)]);
      if (!th) continue;
      const c: Curve = { model: "log-distance", alpha: th[0]!, beta: th[1]!, delta };
      if (!best || chi2(c, points) < chi2(best, points)) best = c;
    }
  } else {
    const th = wls(points, [() => 1, t => t, t => t * t]);
    if (th) best = { model: "quadratic-count", alpha: th[0]!, beta: th[1]!, gamma: th[2]! };
  }
  if (!best) return null;
  const snapped: Curve = best.model === "log-distance"
    ? { ...best, alpha: snap(best.alpha), beta: snap(best.beta) }
    : { ...best, alpha: snap(best.alpha), beta: snap(best.beta), gamma: snap(best.gamma) };
  if (accepts(snapped, points)) return { curve: snapped, snapped: true, accepted: true, chi2: chi2(snapped, points) };
  return { curve: best, snapped: false, accepted: accepts(best, points), chi2: chi2(best, points) };
}
