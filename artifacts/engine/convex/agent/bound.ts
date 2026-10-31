/**
 * Result bounding for tool results (about 20k tokens ≈ 80 KB of JSON): every executor pages its data, and
 * this is the last guard. Arrays are trimmed from the end (the head is kept, so cursors stay meaningful)
 * until the JSON fits; `truncated` tells the caller to page with a smaller limit.
 */
export const MAX_RESULT_CHARS = 80_000;

const size = (value: unknown) => JSON.stringify(value)?.length ?? 0;

/** The largest array anywhere in the value (by serialised size), as [parent, key]. */
function largestArray(value: unknown): { holder: Record<string, unknown> | unknown[]; key: string | number; length: number; bytes: number } | null {
  let best: ReturnType<typeof largestArray> = null;
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (Array.isArray(child) && child.length > 1) {
        const bytes = size(child);
        if (!best || bytes > best.bytes) best = { holder: node as Record<string, unknown>, key, length: child.length, bytes };
      }
      visit(child);
    }
  };
  visit(value);
  return best;
}

export function bound<T>(value: T, max = MAX_RESULT_CHARS): { value: T; truncated: boolean } {
  if (size(value) <= max) return { value, truncated: false };
  const copy = JSON.parse(JSON.stringify(value)) as T;
  for (let guard = 0; guard < 200 && size(copy) > max; guard++) {
    const target = largestArray(copy);
    if (!target) break;
    const arr = (target.holder as Record<string | number, unknown[]>)[target.key];
    arr.length = Math.max(1, Math.floor(arr.length * Math.min(0.9, max / size(copy))));
  }
  if (size(copy) > max) throw new Error("Result too large; request a smaller page");
  return { value: copy, truncated: true };
}
