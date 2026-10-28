/** Shared helpers for the seeds, strategy and penalty ports (private to those modules). */

/** Python-style floor modulo. */
export function fmod(a: number, m: number): number {
  return ((a % m) + m) % m;
}

/**
 * 4-connected components of the cells where `mask` is set (every cell when null), linking
 * neighbours with equal `key`, like Grid Lab's `comps2d(key, mask)`. Returns per-cell component
 * ids (-1 off-mask) and each component's size, components numbered in row-major first-cell order.
 */
export function components4(N: number, key: ArrayLike<number>, mask: Uint8Array | null): { id: Int32Array; size: number[] } {
  const NN = N * N;
  const id = new Int32Array(NN).fill(-1);
  const stack = new Int32Array(NN);
  const size: number[] = [];
  for (let s = 0; s < NN; s++) {
    if (id[s] >= 0 || (mask !== null && !mask[s])) continue;
    const k = size.length, kv = key[s];
    let top = 0, n = 0;
    id[s] = k;
    stack[top++] = s;
    while (top > 0) {
      const i = stack[--top];
      n++;
      const r = (i / N) | 0, c = i - r * N;
      for (let d = 0; d < 4; d++) {
        let j: number;
        if (d === 0) { if (r === 0) continue; j = i - N; }
        else if (d === 1) { if (r === N - 1) continue; j = i + N; }
        else if (d === 2) { if (c === 0) continue; j = i - 1; }
        else { if (c === N - 1) continue; j = i + 1; }
        if (id[j] < 0 && (mask === null || mask[j]) && key[j] === kv) {
          id[j] = k;
          stack[top++] = j;
        }
      }
    }
    size.push(n);
  }
  return { id, size };
}

/** Largest 4-connected component size (0 when no cell is masked, like `max(..., default=0)`). */
export function largestComponent4(N: number, key: ArrayLike<number>, mask: Uint8Array | null): number {
  let best = 0;
  for (const s of components4(N, key, mask).size) if (s > best) best = s;
  return best;
}
