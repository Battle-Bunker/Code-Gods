#!/usr/bin/env node
/**
 * Checks, before a push, that the deployment's auth key env vars agree with each other (the deploy workflow's
 * "Check the deployment's env vars" step). auth.config.ts inlines BETTER_AUTH_JWKS and PLAYER_JWT_JWKS to verify
 * every client JWT; a value that does not match its signing key means broken sign-in (browsers) or rejected room
 * credentials and MCP tokens (player JWTs) the moment the functions are pushed. Until 13 Nov no deployment verified
 * with these values (the key-list check never saw them), so a stale one would never have shown.
 *
 *   node scripts/check-auth-keys.mjs            the deployment CONVEX_DEPLOY_KEY names (CI), else the local one
 *
 * Reads the values with `npx convex env get` into memory only; prints the names of the variables at fault, never a
 * value. Exits 1 on any problem.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT, calculateJwkThumbprint, exportJWK, importJWK, importPKCS8, jwtVerify } from "jose";
import { symmetricDecrypt } from "better-auth/crypto";

const NAMES = ["BETTER_AUTH_SECRET", "BETTER_AUTH_JWKS", "PLAYER_JWT_PRIVATE_KEY", "PLAYER_JWT_JWKS"];

/** Signs with `privateKey` and verifies with `publicKey`: true when they are one key pair. */
async function pairs(privateKey, publicKey, alg) {
  const token = await new SignJWT({ check: 1 }).setProtectedHeader({ alg }).sign(privateKey);
  try { await jwtVerify(token, publicKey, { algorithms: [alg] }); return true; } catch { return false; }
}

async function playerProblems({ PLAYER_JWT_PRIVATE_KEY: pem, PLAYER_JWT_JWKS: jwks }) {
  if (!pem || !jwks) return ["PLAYER_JWT_PRIVATE_KEY and PLAYER_JWT_JWKS must both be set (scripts/gen-jwt-key.mjs)"];
  let key, keys;
  try { key = await importPKCS8(pem.replace(/\\n/g, "\n"), "RS256", { extractable: true }); } catch {
    return ["PLAYER_JWT_PRIVATE_KEY is not an RS256 PKCS#8 PEM (scripts/gen-jwt-key.mjs)"];
  }
  try { keys = JSON.parse(jwks).keys; if (!Array.isArray(keys)) throw 0; } catch { return ["PLAYER_JWT_JWKS is not a JWKS ({ keys: [...] })"]; }
  const { kty, n, e } = await exportJWK(key);
  const kid = await calculateJwkThumbprint({ kty, n, e });
  // convex/auth/jwt.ts signs with this kid; Convex picks the inlined key by it.
  const match = keys.find(k => k.kid === kid && k.n === n && k.e === e);
  return match ? [] : ["PLAYER_JWT_JWKS does not hold PLAYER_JWT_PRIVATE_KEY's public key: set both again with scripts/gen-jwt-key.mjs --set"];
}

async function betterAuthProblems({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_JWKS: jwks }) {
  if (!jwks) return [];   // first deploy: the workflow's JWKS step runs rotateKeys after the push
  if (!secret) return ["BETTER_AUTH_SECRET is not set"];
  const fix = "run auth/betterAuth:rotateKeys and set BETTER_AUTH_JWKS again (PILOT.md)";
  let rows;
  try { rows = JSON.parse(jwks); } catch { return [`BETTER_AUTH_JWKS is not JSON: ${fix}`]; }
  // The Convex plugin returns the parsed value as the key list and sorts it by Date methods: one row, an array.
  if (!Array.isArray(rows) || rows.length !== 1) return [`BETTER_AUTH_JWKS must be an array of exactly one key: ${fix}`];
  const [row] = rows;
  if (!row?.id || typeof row.publicKey !== "string" || typeof row.privateKey !== "string") return [`BETTER_AUTH_JWKS's key lacks id, publicKey or privateKey: ${fix}`];
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return [`BETTER_AUTH_JWKS's key has expired (a static key cannot be renewed): ${fix}`];
  const alg = row.alg ?? "RS256";
  let privateJwk;
  try { privateJwk = await symmetricDecrypt({ key: secret, data: JSON.parse(row.privateKey) }); } catch {
    return [`BETTER_AUTH_JWKS's private key does not decrypt with BETTER_AUTH_SECRET (the secret changed after rotateKeys): ${fix}`];
  }
  try {
    const ok = await pairs(await importJWK(JSON.parse(privateJwk), alg), await importJWK(JSON.parse(row.publicKey), alg), alg);
    return ok ? [] : [`BETTER_AUTH_JWKS's public key is not its private key's: ${fix}`];
  } catch { return [`BETTER_AUTH_JWKS's keys do not import as ${alg}: ${fix}`]; }
}

/** The problems with these values, as messages that name variables and never quote a value; [] when they agree. */
export async function authKeyProblems(env) {
  return [...await betterAuthProblems(env), ...await playerProblems(env)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const convex = (args) => spawnSync("npx", ["convex", "env", ...args], { cwd: root, env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const listed = convex(["list", "--names-only"]);
  if (listed.status !== 0) { console.error("::error::could not list the deployment's env vars"); process.exit(1); }
  const present = new Set(listed.stdout.split("\n").map(s => s.trim()));
  const env = {};
  for (const name of NAMES) {
    if (!present.has(name)) continue;
    const got = convex(["get", name]);
    if (got.status !== 0) { console.error(`::error::could not read ${name}`); process.exit(1); }
    env[name] = got.stdout.replace(/\n$/, "");
  }
  const problems = await authKeyProblems(env);
  for (const p of problems) console.error(`::error::${p}`);
  if (problems.length) process.exit(1);
  console.log(`auth keys agree (${NAMES.filter(n => env[n]).join(", ")})`);
}
