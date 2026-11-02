/**
 * Keys of the per-user object store (docs/assistant/code-execution.md §5): the rules the guest checks and the engine
 * enforces. Pure (no Convex imports), so test/unit/code-keys.test.ts covers them.
 */
const KEY = /^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,127}$/;
/** The engine's own prefix: run results, readable by their owner's scripts, never written by one. */
export const RUNS_PREFIX = "runs/";

/** A key's problem, or null: 1–128 of letters, digits, _ - . / with no "..", "//" or trailing "/". */
export function keyProblem(key: unknown): string | null {
  if (typeof key !== "string" || !KEY.test(key) || key.includes("..") || key.includes("//") || key.endsWith("/"))
    return `invalid key ${JSON.stringify(key)?.slice(0, 140)}: 1-128 characters of letters, digits, _ - . / (no "..", "//" or trailing "/")`;
  return null;
}
/** A write's problem: an invalid key, or one under runs/. */
export function writeProblem(key: unknown): string | null {
  return keyProblem(key) ?? ((key as string).startsWith(RUNS_PREFIX) ? `${JSON.stringify(key)}: keys under runs/ are the engine's and read-only` : null);
}
/** A load scope: an exact key, or "prefix*" (the prefix may be empty: "*" loads everything, within the size limit). */
export function scopeProblem(scope: unknown): string | null {
  if (typeof scope !== "string") return "a scope is a key or a prefix ending in *";
  if (scope === "*") return null;
  if (scope.endsWith("*")) {
    const prefix = scope.slice(0, -1);
    return /^[A-Za-z0-9_./-]{1,128}$/.test(prefix) && !prefix.includes("..") ? null : `invalid prefix ${JSON.stringify(scope).slice(0, 140)}`;
  }
  return keyProblem(scope);
}
/** The [lower, upper) key range of a scope over the subject's keys. */
export function scopeRange(scope: string): [string, string] {
  if (!scope.endsWith("*")) return [scope, `${scope}\u0000`];
  const prefix = scope.slice(0, -1);
  return [prefix, `${prefix}￿`];
}
export const runResultKey = (runId: string) => `${RUNS_PREFIX}${runId}`;

/**
 * The store is partitioned per (human, game): what a game's runs write (notes, run results) is that game's, so the
 * assistant of the next game starts from an empty store. Saved scripts (`scripts/<name>`, run_code saveAs) are the
 * player's own tooling, like their panels, and stay in one player-wide partition across games and rooms.
 */
export const PLAYER_PREFIX = "scripts/";
/** The player-wide partition's epoch. */
export const PLAYER_PARTITION = "";
/** The partition a key lives in, for a run of this game epoch. */
export const partitionOf = (key: string, epoch: string) => key.startsWith(PLAYER_PREFIX) ? PLAYER_PARTITION : epoch;
/** The code epoch of a room now: its current game (active, or the latest until the next starts), else this room's lobby. */
export const codeEpoch = (room: { _id: string; currentGameId?: string }) => room.currentGameId ?? `lobby:${room._id}`;

/**
 * A run-result object's text, {"result":<the run's exact JSON>,"output":"..."}, split back into the two texts. An
 * unescaped `,"output":` cannot occur inside the output's JSON string, so its last occurrence is where they were joined.
 * A run from before the object store kept {"result": "<JSON text>", "output": "..."} instead (`legacy`).
 */
export function splitRunResult(text: string, legacy = false): { result: string; output: string } {
  if (legacy) return JSON.parse(text) as { result: string; output: string };
  const at = text.lastIndexOf(',"output":');
  return { result: text.slice('{"result":'.length, at), output: JSON.parse(text.slice(at + ',"output":'.length, -1)) as string };
}
