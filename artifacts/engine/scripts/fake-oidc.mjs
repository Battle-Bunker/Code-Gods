#!/usr/bin/env node
/**
 * Stand-in OIDC provider for LOCAL TESTS ONLY: Better Auth's generic OAuth provider "fake"
 * (convex/auth/betterAuth.ts), which exists only while the local deployment has test fixtures on and
 * FAKE_OIDC_URL pointing here (scripts/dev.mjs). Never bundled into the deployment (it lives
 * outside convex/). Production signs in with Google only.
 *
 *   node scripts/fake-oidc.mjs [--port 3399] [--client-id code-gods-local]
 *
 * Endpoints (issuer http://127.0.0.1:<port>):
 *   GET  /.well-known/openid-configuration   discovery
 *   GET  /jwks                               public keys (fresh RS256 key per process)
 *   GET  /authorize                          code + PKCE (S256 only). `login_hint=<id>` picks a test identity;
 *                                            without it, an HTML picker. `tamper=nonce|aud|iss|exp|sig`
 *                                            makes the eventual ID token invalid in that one way.
 *   POST /token                              authorization_code grant: single-use code, client_id,
 *                                            redirect_uri and PKCE verifier are all checked
 *
 * Test identities (fixed names and emails; `sub` is the provider's subject, not the god id):
 */
import { createServer } from "node:http";
import { createHash, randomBytes, generateKeyPairSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { SignJWT, exportJWK, importPKCS8 } from "jose";

export const IDENTITIES = {
  alice: { sub: "test-alice", given_name: "Alice", family_name: "Liddell", email: "alice@example.test", email_verified: true },
  bob: { sub: "test-bob", given_name: "Bob", family_name: "Okafor", email: "bob@example.test", email_verified: true },
  carol: { sub: "test-carol", given_name: "Carol", family_name: "Nguyen", email: "carol@example.test", email_verified: true },
  admin: { sub: "test-admin", given_name: "Ada", family_name: "Admin", email: "admin@example.test", email_verified: true },
  // Allowlisted as an admin by dev.mjs, but the provider does not vouch for the email: never an admin.
  unverified: { sub: "test-unverified", given_name: "Uma", family_name: "Unverified", email: "unverified@example.test", email_verified: false },
};

const b64url = buffer => buffer.toString("base64url");

export async function startFakeOidc({ port = 3399, host = "127.0.0.1", clientId = "code-gods-local" } = {}) {
  const issuer = `http://${host}:${port}`;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const signingKey = await importPKCS8(privateKey.export({ type: "pkcs8", format: "pem" }).toString(), "RS256", { extractable: true });
  const { kty, n, e } = await exportJWK(signingKey);
  const kid = b64url(randomBytes(8));
  const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey; // for tamper=sig
  const codes = new Map();

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "Cache-Control": "no-store", ...headers });
    res.end(body);
  };
  const json = (res, status, body) => send(res, status, JSON.stringify(body), { "Content-Type": "application/json" });

  async function idToken(entry) {
    const now = Math.floor(Date.now() / 1000);
    const claims = { ...entry.identity, nonce: entry.tamper === "nonce" ? "not-the-nonce" : entry.nonce };
    const jwt = new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
      .setIssuer(entry.tamper === "iss" ? "http://evil.example" : issuer)
      .setAudience(entry.tamper === "aud" ? "someone-else" : entry.clientId)
      .setSubject(entry.identity.sub).setIssuedAt(entry.tamper === "exp" ? now - 7200 : now)
      .setExpirationTime(entry.tamper === "exp" ? now - 3600 : now + 300);
    const key = entry.tamper === "sig"
      ? await importPKCS8(otherKey.export({ type: "pkcs8", format: "pem" }).toString(), "RS256")
      : signingKey;
    return await jwt.sign(key);
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, issuer);
      if (req.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
        return json(res, 200, {
          issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
          response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"],
          scopes_supported: ["openid", "profile", "email"],
        });
      }
      if (req.method === "GET" && url.pathname === "/jwks") {
        return json(res, 200, { keys: [{ kty, n, e, kid, alg: "RS256", use: "sig" }] });
      }
      if (req.method === "GET" && url.pathname === "/authorize") {
        const p = Object.fromEntries(url.searchParams);
        if (p.client_id !== clientId) return send(res, 400, "unknown client_id");
        if (p.response_type !== "code" || p.code_challenge_method !== "S256" || !p.code_challenge || !p.redirect_uri || !p.state) {
          return send(res, 400, "authorization request must carry response_type=code, S256 PKCE, redirect_uri and state");
        }
        const identity = IDENTITIES[p.login_hint];
        if (!identity) {
          const links = Object.entries(IDENTITIES).map(([id, who]) => {
            const next = new URL(url); next.searchParams.set("login_hint", id);
            return `<li><a href="${next.pathname}${next.search.replace(/&/g, "&amp;")}">${who.given_name} ${who.family_name} (${id})</a></li>`;
          }).join("");
          return send(res, 200, `<!doctype html><meta charset="utf-8"><title>Fake OIDC</title><h1>Test identity (local only)</h1><ul>${links}</ul>`, { "Content-Type": "text/html; charset=utf-8" });
        }
        const code = b64url(randomBytes(24));
        codes.set(code, { identity, clientId: p.client_id, redirectUri: p.redirect_uri, nonce: p.nonce, challenge: p.code_challenge, tamper: p.tamper, expiresAt: Date.now() + 60_000 });
        const target = new URL(p.redirect_uri);
        target.searchParams.set("code", code);
        target.searchParams.set("state", p.state);
        return send(res, 302, "", { Location: target.toString() });
      }
      if (req.method === "POST" && url.pathname === "/token") {
        let raw = "";
        for await (const chunk of req) { raw += chunk; if (raw.length > 16384) return json(res, 413, { error: "invalid_request" }); }
        const body = Object.fromEntries(new URLSearchParams(raw));
        const entry = codes.get(body.code);
        codes.delete(body.code); // single use, even when the rest fails
        if (body.grant_type !== "authorization_code" || !entry || entry.expiresAt < Date.now()) return json(res, 400, { error: "invalid_grant" });
        if (body.client_id !== entry.clientId || body.redirect_uri !== entry.redirectUri) return json(res, 400, { error: "invalid_grant" });
        const challenge = typeof body.code_verifier === "string" ? b64url(createHash("sha256").update(body.code_verifier).digest()) : "";
        if (challenge !== entry.challenge) return json(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
        return json(res, 200, { access_token: b64url(randomBytes(24)), token_type: "Bearer", expires_in: 300, id_token: await idToken(entry) });
      }
      send(res, 404, "not found");
    } catch (error) {
      send(res, 500, String(error?.message ?? error));
    }
  });
  await new Promise((resolveListen, reject) => { server.once("error", reject); server.listen(port, host, resolveListen); });
  return { issuer, clientId, close: () => new Promise(done => server.close(() => done())) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const { issuer, clientId } = await startFakeOidc({
    port: Number(arg("--port") ?? process.env.FAKE_OIDC_PORT ?? 3399), clientId: arg("--client-id") ?? "code-gods-local",
  });
  console.log(`fake OIDC (local tests only) at ${issuer}, client_id ${clientId}; identities: ${Object.keys(IDENTITIES).join(", ")}`);
}
