/**
 * Deterministic JSON (calibration.ts table keys; the engine's layout operations compare panel parameters with it).
 * No imports, so a light module can use it without loading the utility families (package export "./canonical-json").
 * JSON with sorted object keys at every depth, no whitespace.
 */
export function canonicalJson(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(",")}]`;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  if (typeof x === "number" && !Number.isFinite(x)) throw new Error("canonicalJson: non-finite number");
  return JSON.stringify(x);
}
