import { defineTable } from "convex/server";
import { v } from "convex/values";

const permission = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));

/**
 * The agent interface (owned by convex/agent; docs/surface-architecture.md §4): MCP OAuth clients and
 * authorization requests, retired refresh tokens (reuse detection), and background command jobs. As in
 * convex/auth, secrets are never stored: only sha256 hashes of request keys, codes and refresh tokens.
 */
export const agentTables = {
  /**
   * OAuth clients: dynamically registered public clients (`cgo_…` ids), and cached client ID metadata
   * documents (CIMD: the client_id is an https URL, re-fetched after an hour).
   */
  oauthClients: defineTable({
    clientId: v.string(), kind: v.union(v.literal("dcr"), v.literal("cimd")),
    /** Self-reported by the client; shown as such on /connect. */
    clientName: v.string(), redirectUris: v.array(v.string()), createdAt: v.number(), fetchedAt: v.optional(v.number()),
    /** When the client last redeemed a code. A DCR client that never does is swept (oauthStore.sweep). */
    usedAt: v.optional(v.number()),
    /**
     * DCR: sha256 of the client's name and redirect URIs. A registration with the same metadata gets the same
     * client_id back (a public client's id is no secret), so every browser of one player app shares one client
     * and the deployment-wide registration limit counts apps, not page loads.
     */
    metadataHash: v.optional(v.string()),
  }).index("by_client", ["clientId"]).index("by_metadata", ["metadataHash"]).index("by_kind_created", ["kind", "createdAt"])
    .index("by_kind_used_created", ["kind", "usedAt", "createdAt"]).index("by_kind_fetched", ["kind", "fetchedAt"]),

  /**
   * One authorization request (10 minutes): created by GET /oauth/authorize, decided by the human on the
   * engine UI's /connect page, completed by GET /oauth/authorize/complete (which mints the one-time code),
   * then redeemed once at the token endpoint for a `kind: "oauth"` credential.
   */
  oauthRequests: defineTable({
    keyHash: v.string(), clientId: v.string(), clientName: v.string(), redirectUri: v.string(), state: v.optional(v.string()),
    codeChallenge: v.string(), permission, resource: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.literal("issued"), v.literal("redeemed")),
    subject: v.optional(v.string()), roomId: v.optional(v.string()), grantedPermission: v.optional(permission),
    codeHash: v.optional(v.string()), credentialId: v.optional(v.id("credentials")), expiresAt: v.number(),
    /** sha256 of the completion secret the approving browser generated: /complete releases the code only with it. */
    completionHash: v.optional(v.string()),
    /** The `room` the client asked for (a Code Gods extension): /connect preselects it and offers to join it. */
    roomHint: v.optional(v.string()),
  }).index("by_key", ["keyHash"]).index("by_code", ["codeHash"]).index("by_expires", ["expiresAt"]),

  /** Refresh tokens already rotated out: presenting one again revokes its credential (OAuth 2.1 reuse detection). */
  oauthRetiredRefresh: defineTable({ hash: v.string(), credentialId: v.id("credentials"), retiredAt: v.number() })
    .index("by_hash", ["hash"]).index("by_credential", ["credentialId"]).index("by_retired", ["retiredAt"]),

  /**
   * Summon/validate tool calls run as scheduled actions so they finish even when the caller stops waiting
   * (`waitMs`). A job row records a run that ended without a receipt (a host failure: retry the identical call).
   */
  agentJobs: defineTable({
    credentialId: v.string(), roomId: v.string(), subject: v.string(), commandId: v.string(),
    status: v.union(v.literal("running"), v.literal("failed")), error: v.optional(v.object({ code: v.string(), message: v.string() })),
    createdAt: v.number(),
  }).index("by_command", ["roomId", "subject", "commandId"]).index("by_created", ["createdAt"]),
};
