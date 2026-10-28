/**
 * The season salt: the server secret behind every measurement and play seed (lib/game-types pricing
 * deriveSeed). Without it the reference mixture and the act seeds cannot be predicted, so an agent cannot
 * tell measurement from play. It is never logged or sent; games and history record its sha256 commitment,
 * so the salt can be revealed after the season and every seed checked.
 *
 * Production (NODE_ENV=production) refuses to start without CODE_GODS_SEASON_SALT. Elsewhere a random
 * per-process salt is used, with a warning.
 */
import { createHash, randomBytes } from "node:crypto";

let salt: string | undefined;
let commitment: string | undefined;

function load(): string {
  if (salt !== undefined) return salt;
  const configured = process.env.CODE_GODS_SEASON_SALT;
  if (configured && configured.length >= 16) salt = configured;
  else if (process.env.NODE_ENV === "production") {
    throw new Error("CODE_GODS_SEASON_SALT must be set (at least 16 characters) in production");
  } else {
    salt = randomBytes(32).toString("hex");
    console.warn("CODE_GODS_SEASON_SALT is not set: using a random per-process season salt (development and tests only)");
  }
  commitment = createHash("sha256").update(salt, "utf8").digest("hex");
  return salt;
}

/** The secret salt. Server-internal only: never put it in a response, a log or an error. */
export function seasonSalt(): string {
  return load();
}
/** sha256(salt), hex: public, recorded on every game. */
export function seasonCommitment(): string {
  load();
  return commitment!;
}
/** Startup check: throws in production without a configured salt. */
export function assertSeasonSalt(): void {
  load();
}
