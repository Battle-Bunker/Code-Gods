/**
 * Internal reads and writes of the agent interface: principal resolution for POST /mcp and the registry,
 * and the job rows of background summon/validate calls.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { viewerForCredential, type Viewer } from "../auth/access";

const LAST_USED_RESOLUTION_MS = 60_000;

/** What the registry needs to know about its principal (never a secret). */
export type Who = {
  credentialId: string; subject: string; name: string; roomId: string; roomCode: string | null; permission: "read" | "act" | "owner";
  kind: "device" | "oauth" | "assistant"; label: string; expiresAt: number;
};

async function whoOf(ctx: QueryCtx, viewer: Viewer): Promise<Who> {
  const credential = (await ctx.db.get(ctx.db.normalizeId("credentials", viewer.credentialId!)!))!;
  const roomId = ctx.db.normalizeId("rooms", credential.roomId);
  const room = roomId ? await ctx.db.get(roomId) : null;
  return {
    credentialId: credential._id, subject: viewer.subject, name: viewer.name, roomId: credential.roomId, roomCode: room?.shortCode ?? null,
    permission: credential.permission, kind: viewer.credentialKind ?? "device", label: credential.label,
    expiresAt: Math.min(credential.expiresAt, credential.refreshExpiresAt ?? Infinity),
  };
}

/** A principal → Who, or null when the credential is unknown, revoked, expired or its owner grant is stale. */
export const principalInfo = internalQuery({
  args: { credentialId: v.string() },
  handler: async (ctx, { credentialId }): Promise<Who | null> => {
    const viewer = await viewerForCredential(ctx, credentialId);
    return viewer ? whoOf(ctx, viewer) : null;
  },
});

/**
 * POST /mcp's authentication: a `cgc_` credential (by hash) or a verified player JWT (credential id and
 * subject) → Who, recording last use (at most once a minute). Null when unusable.
 */
export const authenticate = internalMutation({
  args: { tokenHash: v.optional(v.string()), credentialId: v.optional(v.string()), subject: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Who | null> => {
    let id = args.credentialId ? ctx.db.normalizeId("credentials", args.credentialId) : null;
    if (args.tokenHash) id = (await ctx.db.query("credentials").withIndex("by_token", q => q.eq("tokenHash", args.tokenHash!)).unique())?._id ?? null;
    if (!id) return null;
    const viewer = await viewerForCredential(ctx, id);
    if (!viewer || (args.subject !== undefined && viewer.subject !== args.subject)) return null;
    const row = (await ctx.db.get(id))!;
    // An OAuth credential is used only through its access tokens, never as a `cgc_` bearer.
    if (args.tokenHash && (row.kind ?? "device") !== "device") return null;
    const now = Date.now();
    if (row.lastUsedAt === undefined || now - row.lastUsedAt > LAST_USED_RESOLUTION_MS) await ctx.db.patch(id, { lastUsedAt: now });
    return whoOf(ctx, viewer);
  },
});

// ---------------------------------------------------------------------------------------------
// Background command jobs
// ---------------------------------------------------------------------------------------------

const key = (args: { roomId: string; subject: string; commandId: string }) =>
  (q: any) => q.eq("roomId", args.roomId).eq("subject", args.subject).eq("commandId", args.commandId);

/** A job still "running" after this long died without reporting (Convex stops actions after 10 minutes): treat it as failed. */
const STALE_MS = 11 * 60_000;
const stale = (job: { status: string; createdAt: number }) => job.status === "running" && job.createdAt < Date.now() - STALE_MS;

export const jobFor = internalQuery({
  args: { roomId: v.string(), subject: v.string(), commandId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.query("agentJobs").withIndex("by_command", key(args)).unique();
    if (!job) return null;
    if (stale(job)) return { status: "failed" as const, error: { code: "UNAVAILABLE", message: "The command did not finish; resend the identical call" } };
    return { status: job.status, error: job.error ?? null };
  },
});

/** Mark a background command as running (replacing an earlier failed run of the same commandId). */
export const startJob = internalMutation({
  args: { credentialId: v.string(), roomId: v.string(), subject: v.string(), commandId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.query("agentJobs").withIndex("by_command", key(args)).unique();
    if (job?.status === "running" && !stale(job)) return { started: false };
    if (job) await ctx.db.delete(job._id);
    await ctx.db.insert("agentJobs", { ...args, status: "running", createdAt: Date.now() });
    // Old job rows carry nothing a receipt does not: keep the table small.
    for (const old of await ctx.db.query("agentJobs").withIndex("by_created", q => q.lt("createdAt", Date.now() - 24 * 3600_000)).take(20)) {
      await ctx.db.delete(old._id);
    }
    return { started: true };
  },
});

/** A background command ended: delete its job row, or record the failure when no receipt was written. */
export const finishJob = internalMutation({
  args: { roomId: v.string(), subject: v.string(), commandId: v.string(), error: v.optional(v.object({ code: v.string(), message: v.string() })) },
  handler: async (ctx, { error, ...args }) => {
    const job = await ctx.db.query("agentJobs").withIndex("by_command", key(args)).unique();
    if (!job) return;
    if (error) await ctx.db.patch(job._id, { status: "failed", error });
    else await ctx.db.delete(job._id);
  },
});
