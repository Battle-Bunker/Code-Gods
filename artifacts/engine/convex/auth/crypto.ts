/**
 * Small Web Crypto helpers usable in every Convex runtime (HTTP actions, queries, mutations).
 * Secrets are generated only in HTTP actions (real randomness); queries and mutations only hash.
 */
const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Random bytes (default 32), base64url, with an optional readable prefix (e.g. "cgc_"). */
export function randomToken(prefix = "", bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return prefix + base64url(buffer);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** RFC 7636 S256: base64url(sha256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}

/** Constant-time comparison. Lengths are not secret here: every compared value has a fixed format. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a), right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

/** Human comparison codes: 8 characters from a 32-letter unambiguous alphabet (40 bits), shown XXXX-XXXX. */
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomUserCode(): string {
  const buffer = new Uint8Array(8);
  crypto.getRandomValues(buffer);
  return [...buffer].map(byte => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]).join("");
}
/** Canonical form for lookup: upper case, separators removed. Null for anything malformed. */
export function normalizeUserCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 32) return null;
  const code = value.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{8}$/.test(code) ? code : null;
}
export const formatUserCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
