/**
 * Pure principal rules (docs/surface-architecture.md §3), shared by access.ts viewerForCredential and the
 * unit tests: no Convex imports.
 */
export type CredentialKind = "device" | "oauth" | "assistant";
/** Rows written before kinds existed are device credentials. */
export const credentialKind = (row: { kind?: CredentialKind }): CredentialKind => row.kind ?? "device";

type CredentialFacts = {
  subject: string; roomId: string; permission: "read" | "act" | "owner"; expiresAt: number;
  revokedAt?: number; kind?: CredentialKind; refreshExpiresAt?: number;
};
/**
 * Why a credential cannot be used now, or null when it can: revoked, expired (an OAuth grant also after 30
 * idle days), its room gone, or an owner grant whose human is no longer the room's current owner.
 */
export function credentialProblem(row: CredentialFacts, room: { ownerId: string } | null, now: number): "revoked" | "expired" | "room_gone" | "not_owner" | null {
  if (row.revokedAt !== undefined) return "revoked";
  if (row.expiresAt <= now || (row.refreshExpiresAt !== undefined && row.refreshExpiresAt <= now)) return "expired";
  if (!room) return "room_gone";
  if (row.permission === "owner" && room.ownerId !== row.subject) return "not_owner";
  return null;
}
