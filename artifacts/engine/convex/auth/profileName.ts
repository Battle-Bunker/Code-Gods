/**
 * Full display name from the provider's VERIFIED profile only (never browser-supplied): Google's
 * given + family name, else `name`, else whatever exists.
 */
export function profileName(claims: Record<string, unknown>): string {
  const text = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const first = text(claims.given_name) || text(claims.first_name);
  const last = text(claims.family_name) || text(claims.last_name);
  const full = first && last ? `${first} ${last}` : text(claims.name);
  return (full || first || last || text(claims.preferred_username) || `Deity ${text(claims.sub)}`).slice(0, 160);
}
