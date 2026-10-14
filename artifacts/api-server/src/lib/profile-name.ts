/** Accept only verified OIDC claims, never browser-supplied display names. */
export function profileName(claims: Record<string, unknown>): string {
  const text = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const first = text(claims.first_name) || text(claims.given_name);
  const last = text(claims.last_name) || text(claims.family_name);
  const full = first && last ? `${first} ${last}` : text(claims.name);
  return (full || first || last || text(claims.preferred_username) || `Deity ${text(claims.sub)}`).slice(0, 160);
}
