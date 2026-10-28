/** canApprove includes request lifecycle, not just the human's ownership. */
export function ownerApprovalBlocker(status: string, expires: number, now: number, canApprove?: boolean): string | null {
  if (!Number.isFinite(expires)) return "This request has an invalid expiry. Ask the client for a fresh approval link.";
  if (status === "expired" || expires <= now) return "This approval request expired. Ask the client for a fresh approval link; this does not mean you are not the room owner.";
  if (status !== "pending") return "This request is no longer awaiting approval. Ask the client for a fresh link if needed.";
  if (canApprove !== true) return "Only the room owner can approve this request. Sign in with the account that owns this room.";
  return null;
}
