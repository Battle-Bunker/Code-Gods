import { defineTable } from "convex/server";
import { v } from "convex/values";

const permission = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));

/**
 * Identity, device approval and scoped player credentials (owned by convex/auth). Better Auth keeps its own
 * users, sessions and accounts in its component (betterAuth.ts); `users` mirrors what the game needs.
 * Secrets are never stored: only sha256 hashes of device secrets, user codes and credentials.
 */
export const authTables = {
  /**
   * One row per Better Auth user, written by its triggers. `subject` is the Better Auth user id (= god id in
   * game tables); `provider` the provider that vouched for the email ("google", or "fake" in local tests);
   * `googleSub` Google's stable `sub`, for audit.
   */
  users: defineTable({
    subject: v.string(), name: v.string(), email: v.optional(v.string()), emailVerified: v.boolean(),
    provider: v.optional(v.string()), googleSub: v.optional(v.string()), updatedAt: v.number(),
  }).index("by_subject", ["subject"]),
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
