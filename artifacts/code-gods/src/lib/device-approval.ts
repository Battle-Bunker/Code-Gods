/** canApprove includes request lifecycle, not just the human's ownership. */
export function ownerApprovalBlocker(status: string, expires: number, now: number, canApprove?: boolean): string | null {
  if (!Number.isFinite(expires)) return "This request has an invalid expiry. Ask the client for a fresh approval link.";
  if (status === "expired" || expires <= now) return "This approval request expired. Ask the client for a fresh approval link; this does not mean you are not the room owner.";
  if (status !== "pending") return "This request is no longer awaiting approval. Ask the client for a fresh link if needed.";
  if (canApprove !== true) return "Only the room owner can approve this request. Sign in with the account that owns this room.";
  return null;
}

export type Permission = "read" | "act" | "owner";
const ORDER: Permission[] = ["read", "act", "owner"];

/** The permissions a human may grant for a connection request: the requested one or anything weaker. */
export function permissionChoices(requested: Permission): Permission[] {
  return ORDER.slice(0, ORDER.indexOf(requested) + 1);
}

/** Why an MCP connection (/connect) cannot be approved yet, or null. */
export function connectBlocker(r: { status: string; expiresAt: number; now: number; roomId: string; permission: Permission; isRoomOwner: boolean; ownerConsent: boolean }): string | null {
  if (!Number.isFinite(r.expiresAt) || r.status === "expired" || r.expiresAt <= r.now) return "This connection request expired. Start again from your client.";
  if (r.status !== "pending") return "This request is no longer awaiting approval.";
  if (!r.roomId) return "Choose a room for this connection.";
  if (r.permission === "owner" && !r.isRoomOwner) return "Only the room's owner can grant owner access. Choose act or read, or a room you own.";
  if (r.permission === "owner" && !r.ownerConsent) return "Owner access needs your explicit consent below.";
  return null;
}

/** How the credential list names who holds a credential. */
export function kindLabel(kind: string | undefined): string {
  return kind === "oauth" ? "MCP connection" : kind === "assistant" ? "in-client assistant" : "player app";
}
