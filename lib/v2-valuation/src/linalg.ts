/**
 * The stationary vector of a row-stochastic matrix (spec §7.2 step 4): solve wT = w, Σw = 1. Null when it is not
 * unique (the sampled matrix has more than one closed class: too few samples to connect the levels).
 */
export function stationary(T: readonly (readonly number[])[]): number[] | null {
  const m = T.length;
  if (m === 1) return [1];
  // A = Tᵀ − I with the last row replaced by ones; b = e_last.
  const A = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => T[j]![i]! - (i === j ? 1 : 0)));
  const b = new Array<number>(m).fill(0);
  A[m - 1] = new Array<number>(m).fill(1);
  b[m - 1] = 1;
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r;
    if (Math.abs(A[piv]![col]!) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv]!, A[col]!];
    [b[col], b[piv]] = [b[piv]!, b[col]!];
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const f = A[r]![col]! / A[col]![col]!;
      if (f === 0) continue;
      for (let c = col; c < m; c++) A[r]![c]! -= f * A[col]![c]!;
      b[r]! -= f * b[col]!;
    }
  }
  return b.map((x, i) => Math.max(0, x / A[i]![i]!));
}
