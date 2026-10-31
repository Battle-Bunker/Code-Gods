/**
 * The /connect page's one-time completion secret (engine: agent/connect.ts approve). Only the browser holding it
 * can collect the authorization code, so it is kept in sessionStorage per request: a reload or a failed redirect
 * after approving can still complete. Without usable storage, each page load gets a fresh one.
 */
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** 32 random bytes, base64url (what approve accepts: 43-128 base64url characters). */
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function completionSecret(storage: Storage | null, request: string): string {
  const key = `cg.connect.completion.${request}`;
  try {
    const kept = storage?.getItem(key);
    if (kept && /^[A-Za-z0-9_-]{43}$/.test(kept)) return kept;
  } catch { /* storage unavailable */ }
  const secret = randomSecret();
  try { storage?.setItem(key, secret); } catch { /* storage unavailable */ }
  return secret;
}
