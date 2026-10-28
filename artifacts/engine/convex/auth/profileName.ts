/**
 * Full display name from VERIFIED OIDC claims only (never browser-supplied). Ported unchanged from
 * artifacts/api-server/src/lib/profile-name.ts: given + family name, else `name`, else whatever exists.
 */
export function profileName(claims: Record<string, unknown>): string {
  const text = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const first = text(claims.first_name) || text(claims.given_name);
  const last = text(claims.last_name) || text(claims.family_name);
  const full = first && last ? `${first} ${last}` : text(claims.name);
  return (full || first || last || text(claims.preferred_username) || `Deity ${text(claims.sub)}`).slice(0, 160);
}
