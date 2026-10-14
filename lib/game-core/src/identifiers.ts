const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Canonical 128-bit UUID interpreted as an integer, zero-padded to 26 base32 digits. */
export function encodeUuid(uuid: string): string {
  if (!UUID.test(uuid)) throw new Error("Invalid UUID");
  let remaining = BigInt(`0x${uuid.replaceAll("-", "")}`);
  let encoded = "";
  for (let i = 0; i < 26; i++) {
    encoded = CROCKFORD[Number(remaining & 31n)] + encoded;
    remaining >>= 5n;
  }
  return encoded;
}

export interface ShortId {
  id: string;
  prefixLength: number;
  shortCode: string;
}

/** Persist these updates in one namespace-wide DB transaction when adding a UUID. */
export function uniquePrefixes(ids: readonly string[]): ShortId[] {
  const normalized = ids.map(id => id.toLowerCase());
  if (new Set(normalized).size !== ids.length) throw new Error("Duplicate UUID");
  const encoded = normalized.map(encodeUuid);
  return normalized.map((id, index) => {
    let prefixLength = 4;
    while (
      encoded.some((other, otherIndex) =>
        otherIndex !== index && other.startsWith(encoded[index].slice(0, prefixLength)))
    ) prefixLength++;
    return { id, prefixLength, shortCode: encoded[index].slice(0, prefixLength) };
  });
}

export function resolveIdentifier(query: string, ids: readonly string[]): string {
  if (UUID.test(query)) {
    const match = ids.find(id => id.toLowerCase() === query.toLowerCase());
    if (!match) throw new Error("Identifier not found");
    return match;
  }
  const normalized = query.toUpperCase().replaceAll("O", "0").replace(/[IL]/g, "1");
  if (normalized.length < 4 || normalized.length > 26 || /[^0-9A-HJKMNP-TV-Z]/.test(normalized)) {
    throw new Error("Invalid short identifier");
  }
  const matches = ids.filter(id => encodeUuid(id).startsWith(normalized));
  if (matches.length > 1) throw new Error("Ambiguous identifier: use a longer prefix");
  if (matches.length === 0) throw new Error("Identifier not found");
  return matches[0];
}
