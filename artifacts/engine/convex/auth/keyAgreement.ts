/**
 * After a push: do the JWKS the deployed auth config inlined verify tokens signed with the deployment's current keys?
 * auth.config.ts is evaluated at push time, so an env var changed without a push (or a stale value) shows here.
 * Pure (no Convex imports) so the unit tests can run it; keysCheck.ts runs it on the deployment.
 */
import { SignJWT, createLocalJWKSet, importJWK, jwtVerify, type JWK, type JSONWebKeySet } from "jose";
import { symmetricDecrypt } from "better-auth/crypto";

type Provider = { applicationID?: string; issuer?: string; jwks?: string; algorithm?: string };

/** The JWKS inlined as a `data:` URI, or null when the provider fetches it by URL. */
export function inlinedJwks(provider: Provider | undefined): JSONWebKeySet | null {
  const uri = provider?.jwks;
  if (!uri?.startsWith("data:")) return null;
  const [, body] = uri.split(",", 2);
  return JSON.parse(atob(body)) as JSONWebKeySet;
}

async function verifies(token: string, jwks: JSONWebKeySet, provider: Provider) {
  try {
    await jwtVerify(token, createLocalJWKSet(jwks), { issuer: provider.issuer, audience: provider.applicationID, algorithms: [provider.algorithm ?? "RS256"] });
    return true;
  } catch { return false; }
}

/**
 * Problems (names, never values) with the deployed config: `playerToken` is a player JWT the deployment just minted;
 * the Better Auth key is the static one in BETTER_AUTH_JWKS, signed here the way the plugin signs.
 */
export async function deployedKeyProblems(
  providers: Provider[], playerToken: string, env: { BETTER_AUTH_JWKS?: string; BETTER_AUTH_SECRET?: string },
): Promise<string[]> {
  const problems: string[] = [];
  const browser = providers.find(p => p.applicationID === "convex"), player = providers.find(p => p.applicationID === "code-gods");
  const playerSet = inlinedJwks(player);
  if (!player || !playerSet) problems.push("the deployed auth config does not inline PLAYER_JWT_JWKS (push again after setting it)");
  else if (!await verifies(playerToken, playerSet, player)) problems.push("a fresh player JWT does not verify against the deployed PLAYER_JWT_JWKS: set both keys again with scripts/gen-jwt-key.mjs --set, then push");
  if (env.BETTER_AUTH_JWKS) {
    const browserSet = inlinedJwks(browser);
    if (!browser || !browserSet) problems.push("the deployed auth config does not inline BETTER_AUTH_JWKS (push again after setting it)");
    else {
      try {
        const [row] = JSON.parse(env.BETTER_AUTH_JWKS) as { id: string; alg?: string; privateKey: string }[];
        const alg = row.alg ?? "RS256";
        const jwk = JSON.parse(await symmetricDecrypt({ key: env.BETTER_AUTH_SECRET ?? "", data: JSON.parse(row.privateKey) })) as JWK;
        const token = await new SignJWT({ check: 1 }).setProtectedHeader({ alg, kid: row.id }).setIssuer(browser.issuer ?? "")
          .setAudience("convex").setExpirationTime("1m").sign(await importJWK(jwk, alg));
        if (!await verifies(token, browserSet, browser)) problems.push("a token signed with BETTER_AUTH_JWKS does not verify against the deployed auth config: push again, or rotateKeys (PILOT.md)");
      } catch { problems.push("BETTER_AUTH_JWKS's private key cannot sign (malformed, or BETTER_AUTH_SECRET changed after rotateKeys): rotateKeys (PILOT.md)"); }
    }
  }
  return problems;
}
