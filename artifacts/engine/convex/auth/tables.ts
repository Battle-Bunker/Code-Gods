import { defineTable } from "convex/server";
import { v } from "convex/values";

const permission = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));

/**
 * Identity, sessions, device approval and scoped player credentials (owned by convex/auth).
 * Secrets are never stored: only sha256 hashes of session tokens, flow keys, device secrets, user
 * codes and credentials. `subject` is the Replit `sub` (= god id in game tables).
 */
export const authTables = {
  users: defineTable({
    subject: v.string(), name: v.string(), email: v.optional(v.string()), emailVerified: v.boolean(),
    issuer: v.string(), updatedAt: v.number(),
  }).index("by_subject", ["subject"]),
  /** Browser sessions (HttpOnly cookie on the site origin), exchanged for 10-minute browser JWTs. */
  sessions: defineTable({ tokenHash: v.string(), subject: v.string(), expiresAt: v.number() })
    .index("by_token", ["tokenHash"]).index("by_subject", ["subject"]).index("by_expires", ["expiresAt"]),
  /** 10-minute OIDC login transactions, keyed by the hash of the flow cookie. */
  oidcFlows: defineTable({
    keyHash: v.string(), verifier: v.string(), state: v.string(), nonce: v.string(), returnTo: v.string(), expiresAt: v.number(),
  }).index("by_key", ["keyHash"]).index("by_expires", ["expiresAt"]),
  /** Device approval requests (5 minutes). The doc id is the public deviceId. */
  devices: defineTable({
    deviceSecretHash: v.string(), userCodeHash: v.string(), challenge: v.string(), roomId: v.string(),
    permission, label: v.string(), status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.literal("claimed")),
    subject: v.optional(v.string()), credentialId: v.optional(v.id("credentials")), expiresAt: v.number(),
    /** Poll throttling and proof-failure counting. */
    lastPolledAt: v.optional(v.number()), failures: v.optional(v.number()),
  }).index("by_user_code", ["userCodeHash"]).index("by_room", ["roomId", "expiresAt"]).index("by_expires", ["expiresAt"]),
  /** Scoped player credentials (default 7 days), exchanged for 10-minute player JWTs. */
  credentials: defineTable({
    tokenHash: v.string(), subject: v.string(), roomId: v.string(), permission, label: v.string(),
    createdAt: v.number(), expiresAt: v.number(), revokedAt: v.optional(v.number()), lastUsedAt: v.optional(v.number()),
  }).index("by_token", ["tokenHash"]).index("by_subject", ["subject"]),
};
