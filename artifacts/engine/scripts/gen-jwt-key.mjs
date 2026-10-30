#!/usr/bin/env node
/**
 * Generate the engine's RS256 JWT signing key.
 *
 *   pnpm --filter @workspace/engine gen-jwt-key            print both values (do not paste them into chat or git)
 *   pnpm --filter @workspace/engine gen-jwt-key --set      set them on the current `npx convex dev` deployment
 *   pnpm --filter @workspace/engine gen-jwt-key --set --prod   … on the production deployment
 *
 * Sets two Convex env vars that must always change together:
 *   CODE_GODS_JWT_PRIVATE_KEY  PKCS#8 PEM (secret; convex/auth/jwt.ts signs with it)
 *   CODE_GODS_JWT_JWKS         its public JWKS (convex/auth.config.ts inlines it as a data: URI)
 * After --set, push the functions again (`npx convex deploy` / `npx convex dev`) so the auth config is
 * re-evaluated. Rotating the key invalidates outstanding 10-minute JWTs; clients simply fetch new ones.
 */
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { calculateJwkThumbprint } from "jose";

export async function generateJwtKey() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const { kty, n, e } = publicKey.export({ format: "jwk" });
  const kid = await calculateJwkThumbprint({ kty, n, e });
  const jwks = JSON.stringify({ keys: [{ kty, n, e, kid, alg: "RS256", use: "sig" }] });
  return { privateKey: pem, jwks };
}

export function setConvexEnv(vars, { prod = false, cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..") } = {}) {
  for (const [name, value] of Object.entries(vars)) {
    // The value goes in on stdin: it never appears in a process list, and PEM text starting with "-"
    // is never parsed as a flag.
    const result = spawnSync("npx", ["convex", "env", "set", ...(prod ? ["--prod"] : []), name], {
      cwd, input: value, stdio: ["pipe", "ignore", "inherit"], env: process.env,
    });
    if (result.status !== 0) throw new Error(`convex env set ${name} failed`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const key = await generateJwtKey();
  if (process.argv.includes("--set")) {
    setConvexEnv({ CODE_GODS_JWT_PRIVATE_KEY: key.privateKey, CODE_GODS_JWT_JWKS: key.jwks }, { prod: process.argv.includes("--prod") });
    console.log("Set CODE_GODS_JWT_PRIVATE_KEY and CODE_GODS_JWT_JWKS. Push the functions again so auth.config.ts picks up the JWKS.");
  } else {
    console.log("CODE_GODS_JWT_PRIVATE_KEY=");
    console.log(key.privateKey);
    console.log(`CODE_GODS_JWT_JWKS=${key.jwks}`);
  }
}
