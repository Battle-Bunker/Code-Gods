import { defineTable } from "convex/server";
import { v } from "convex/values";

const permission = v.union(v.literal("read"), v.literal("act"), v.literal("owner"));

/** Identity, sessions, device approval and scoped player credentials (owned by convex/auth). */
export const authTables = {
  users: defineTable({
    subject: v.string(), name: v.string(), email: v.optional(v.string()), emailVerified: v.boolean(),
    issuer: v.string(), updatedAt: v.number(),
  }).index("by_subject", ["subject"]),
  sessions: defineTable({ tokenHash: v.string(), subject: v.string(), expiresAt: v.number() })
    .index("by_token", ["tokenHash"]).index("by_subject", ["subject"]),
  oidcFlows: defineTable({
    keyHash: v.string(), verifier: v.string(), state: v.string(), nonce: v.string(), returnTo: v.string(), expiresAt: v.number(),
  }).index("by_key", ["keyHash"]),
  devices: defineTable({
    deviceSecretHash: v.string(), userCodeHash: v.string(), challenge: v.string(), roomId: v.string(),
    permission, label: v.string(), status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.literal("claimed")),
    subject: v.optional(v.string()), credentialId: v.optional(v.id("credentials")), expiresAt: v.number(),
  }).index("by_user_code", ["userCodeHash"]),
  credentials: defineTable({
    tokenHash: v.string(), subject: v.string(), roomId: v.string(), permission, label: v.string(),
    createdAt: v.number(), expiresAt: v.number(), revokedAt: v.optional(v.number()), lastUsedAt: v.optional(v.number()),
  }).index("by_token", ["tokenHash"]).index("by_subject", ["subject"]),
};
