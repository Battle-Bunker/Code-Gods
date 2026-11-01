/**
 * The disclosure assertions (plan §6, product rule: aggregate-only), shared by test/game-disclosure.test.ts and
 * test/mcp.test.ts: for one viewer, a player-facing result is searched for other gods' private data (their
 * per-object net bits, utility descriptors, agent sources, AI prompts, the event log's per-god vectors, the
 * season salt and the end deadline).
 */
import assert from "node:assert/strict";
import { raw } from "./game-helpers.ts";

export const FORBIDDEN_KEYS = ["scores", "endAtWorld", "net", "deities", "prompt", "penaltyOrdinal", "aiAgent", "descriptor", "seed", "noise", "noiseKey"];

/** Every number (as JSON prints it) in a value. */
export function numbers(value: unknown, out = new Set<string>()) {
  if (typeof value === "number") out.add(JSON.stringify(value));
  else if (Array.isArray(value)) value.forEach(v => numbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => numbers(v, out));
  return out;
}

/** Integers below this magnitude collide with ordinary public numbers and are not checked as secrets. */
export const SMALL_INTEGER = 1000;
export const isSmallInteger = (n: number) => Number.isInteger(n) && Math.abs(n) < SMALL_INTEGER;

/**
 * A checker for one viewer of one game: `check(label, result)` fails if `result` discloses anything private
 * to another god. `secrets` are marker strings planted in other gods' agent sources.
 */
export function disclosureChecker(gameId: string, viewerSubject: string, secrets: string[], scope: { live?: boolean } = {}) {
  /**
   * `publicParams`: the result enumerates the public candidates (every parameter set any god might hold), so other gods'
   * parameters appear in it by design; callers then prove the result is the same for every viewer instead.
   */
  return async (label: string, result: unknown, options: { publicParams?: boolean } = {}) => {
    const secret = await raw(gameId);
    const json = JSON.stringify(result);
    for (const key of FORBIDDEN_KEYS) assert.ok(!json.includes(`"${key}":`), `${label}: never discloses "${key}"`);
    for (const marker of secrets) assert.ok(!json.includes(marker), `${label}: never another god's agent source`);
    assert.ok(!json.includes("Play strategically"), `${label}: never an AI seat's prompt`);
    assert.ok(!json.includes("local-test-salt"), `${label}: never the season salt`);
    assert.ok(!numbers(result).has(JSON.stringify(secret.game.endAtWorld)), `${label}: never the end deadline`);
    // Other gods' individual per-object net bits (where distinctive) never appear. Numbers are compared as whole JSON
    // values, never substrings. A small integer is not distinctive: ordinary public data (counts, ids, values, a
    // seat's energy) holds the same numbers, so "7 net bits" matched "objectCount: 7" about one run in two.
    const seen = numbers(result);
    // Numbers the viewer may legitimately see, on any object: its own bits and the peers' sum. Calibration tables are
    // discrete, so another god's bits on one object often equal such an aggregate on another (or the same) object
    // whenever the remaining peers score exactly 0; those coincidences are not disclosures.
    const allowed = new Set<string>();
    for (const o of secret.objects) {
      const own = o.scores.find((x: any) => x.god === viewerSubject);
      if (own) allowed.add(JSON.stringify(own.netBits));
      allowed.add(JSON.stringify(o.scores.filter((x: any) => x.god !== viewerSubject).reduce((n: number, x: any) => n + x.netBits, 0)));
    }
    for (const o of secret.objects) for (const s of o.scores) {
      if (s.god === viewerSubject) continue;
      const distinctive = Math.abs(s.netBits) > 1e-6 && !isSmallInteger(s.netBits) && !allowed.has(JSON.stringify(s.netBits));
      if (distinctive) assert.ok(!seen.has(JSON.stringify(s.netBits)), `${label}: ${s.god}'s net bits ${s.netBits} on ${o._id}`);
    }
    // Live with disclosure noise (settings.peerNoiseBits, docs/public-log-design.md §5): the viewer's EXACT others' sum of
    // any object version, and the exact payoff built on it, never appear; only the noisy ones do.
    if (scope.live && (secret.game.settings.peerNoiseBits ?? 0) > 0) {
      const index = secret.game.roster.findIndex((m: any) => m.id === viewerSubject);
      for (const r of secret.objectEvents) {
        if (index < 0 || !r.noise) continue;
        const own = r.net[index], others = r.net.reduce((n: number, x: number, i: number) => (i === index ? n : n + x), 0);
        for (const [what, x] of [["others' sum", others], ["payoff", own * Math.max(0, others)]] as const) {
          if (Math.abs(x) > 1e-6 && !isSmallInteger(x)) assert.ok(!seen.has(JSON.stringify(x)), `${label}: the exact ${what} ${x} of ${r.objectId} v${r.version}`);
        }
      }
    }
    // Other gods' descriptors never appear.
    const own = secret.deities.find((x: any) => x.godId === viewerSubject)?.utility;
    for (const d of secret.deities) {
      if (d.godId === viewerSubject) continue;
      if (!options.publicParams && JSON.stringify(d.utility.params) !== JSON.stringify(own?.params) && JSON.stringify(d.utility.params) !== "{}") {
        assert.ok(!json.includes(JSON.stringify(d.utility.params)), `${label}: ${d.godId}'s utility parameters`);
      }
    }
  };
}
