/**
 * The disclosure assertions (plan §6, product rule: aggregate-only), shared by test/game-disclosure.test.ts and
 * test/mcp.test.ts: for one viewer, a player-facing result is searched for other gods' private data (their
 * per-object net bits, utility descriptors, agent sources, AI prompts, the event log's per-god vectors, the
 * season salt and the end deadline).
 */
import assert from "node:assert/strict";
import { raw } from "./game-helpers.ts";

export const FORBIDDEN_KEYS = ["scores", "endAtWorld", "net", "deities", "prompt", "penaltyOrdinal", "aiAgent", "descriptor", "seed"];

/** Every number (as JSON prints it) in a value. */
export function numbers(value: unknown, out = new Set<string>()) {
  if (typeof value === "number") out.add(JSON.stringify(value));
  else if (Array.isArray(value)) value.forEach(v => numbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => numbers(v, out));
  return out;
}

/**
 * A checker for one viewer of one game: `check(label, result)` fails if `result` discloses anything private
 * to another god. `secrets` are marker strings planted in other gods' agent sources.
 */
export function disclosureChecker(gameId: string, viewerSubject: string, secrets: string[]) {
  return async (label: string, result: unknown) => {
    const secret = await raw(gameId);
    const json = JSON.stringify(result);
    for (const key of FORBIDDEN_KEYS) assert.ok(!json.includes(`"${key}":`), `${label}: never discloses "${key}"`);
    for (const marker of secrets) assert.ok(!json.includes(marker), `${label}: never another god's agent source`);
    assert.ok(!json.includes("Play strategically"), `${label}: never an AI seat's prompt`);
    assert.ok(!json.includes("local-test-salt"), `${label}: never the season salt`);
    assert.ok(!numbers(result).has(JSON.stringify(secret.game.endAtWorld)), `${label}: never the end deadline`);
    // Other gods' individual per-object net bits (where distinctive) never appear.
    const seen = numbers(result);
    for (const o of secret.objects) for (const s of o.scores) {
      if (s.god === viewerSubject) continue;
      const distinctive = Math.abs(s.netBits) > 1e-6 && !o.scores.some((x: any) => x.god === viewerSubject && Math.abs(x.netBits - s.netBits) < 1e-12);
      if (distinctive) assert.ok(!seen.has(JSON.stringify(s.netBits)), `${label}: ${s.god}'s net bits ${s.netBits} on ${o._id}`);
    }
    // Other gods' descriptors never appear.
    const own = secret.deities.find((x: any) => x.godId === viewerSubject)?.utility;
    for (const d of secret.deities) {
      if (d.godId === viewerSubject) continue;
      if (JSON.stringify(d.utility.params) !== JSON.stringify(own?.params) && JSON.stringify(d.utility.params) !== "{}") {
        assert.ok(!json.includes(JSON.stringify(d.utility.params)), `${label}: ${d.godId}'s utility parameters`);
      }
    }
  };
}
