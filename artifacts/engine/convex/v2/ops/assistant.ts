/**
 * `assistant.*`: the human's conversation with their in-client assistant (v2/assistant.ts). Any surface may do these
 * for the human but the in-client assistant itself: a conversation does not drive itself.
 */
import { OpFailure } from "@workspace/v2-affordances";
import type { MutationCtx } from "../../_generated/server";
import { providerFor } from "../ai";
import { prefsOf, type Grant } from "../assistant";
import { busyTurn, cancelTurn, drainQueue, enqueue, RANK, scheduleAutopilot, threadFor } from "../assistantCore";
import { callerOf, defineOp, inRoom } from "./define";

type Env = Parameters<typeof inRoom<"mutation">>[0];

/** The human in their room, never the assistant acting on its own conversation. */
function human(env: Env) {
  if (callerOf(env).via === "assistant") throw new OpFailure("The assistant cannot run its own conversation.");
  const r = inRoom(env);
  if (r.member.kind !== "human" || !r.member.userId) throw new OpFailure("Only a human has an assistant.");
  return { ...r, userId: r.member.userId };
}

/**
 * A grant the human chooses for their assistant, kept for the room: never above their own (owner only for the room's
 * owner, with consent) nor above the connection's choosing it. Without one, the stored grant stands; a delegate passing
 * a message on lowers that message's turn to its own rights instead (enqueue's cap).
 */
function chosenGrant(env: Env, owner: boolean, want: Grant | undefined, consent: boolean | undefined, current: Grant | undefined): Grant | undefined {
  if (!want) return undefined;
  if (want === "owner" && !owner) throw new OpFailure("Only the room's owner can give the assistant owner rights.");
  if (want === "owner" && !consent && current !== "owner") throw new OpFailure("Owner rights for the assistant need your explicit consent.", "Pass ownerConsent: true.");
  const own = callerOf(env).ctx.grant;
  if (own && RANK[want] > RANK[own]) throw new OpFailure("The assistant cannot have more rights than this connection.");
  return want;
}

async function setPrefs(ctx: MutationCtx, roomId: Parameters<typeof prefsOf>[1], userId: string, patch: { mode?: "autopilot" | "onRequest" | "readOnly"; grant?: Grant; chain?: number }) {
  const row = await prefsOf(ctx, roomId, userId);
  if (row) { await ctx.db.patch(row._id, patch); return { ...row, ...patch }; }
  const doc = { roomId, userId, mode: patch.mode ?? "onRequest" as const, grant: patch.grant ?? "act" as const, chain: 0 };
  await ctx.db.insert("v2AssistantPrefs", doc);
  return doc;
}

export const { op: send, as: sendAs } = defineOp("assistant.send", "mutation", async (env, a) => {
  const { room, userId } = human(env);
  providerFor();
  const prefs = await prefsOf(env.ctx, room._id, userId);
  const grant = chosenGrant(env, room.ownerId === userId, a.grant, a.ownerConsent, prefs?.grant);
  if (grant && grant !== (prefs?.grant ?? "act")) await setPrefs(env.ctx, room._id, userId, { grant });
  const cap = callerOf(env).ctx.grant;
  const threadId = await threadFor(env.ctx, room, userId, { title: a.text, ...(a.threadId ? { threadId: a.threadId } : {}), ...(a.newThread ? { newThread: true } : {}) });
  if (await busyTurn(env.ctx, room._id, userId)) {
    const queueId = await enqueue(env.ctx, room, userId, threadId, a.text, cap, true);
    return { threadId, turnId: null, queueId, queued: true };
  }
  // What a Stop held goes first, then this message.
  await enqueue(env.ctx, room, userId, threadId, a.text, cap, false);
  const turnId = await drainQueue(env.ctx, room, userId, true);
  return { threadId, turnId, queueId: null, queued: false };
});

export const { op: cancel, as: cancelAs } = defineOp("assistant.cancel", "mutation", async env => {
  const { room, userId } = human(env);
  return { status: await cancelTurn(env.ctx, room._id, userId) };
});

export const { op: setMode, as: setModeAs } = defineOp("assistant.setMode", "mutation", async (env, a) => {
  const { room, userId } = human(env);
  if (a.mode === "autopilot") providerFor();
  const prefs = await prefsOf(env.ctx, room._id, userId);
  const grant = chosenGrant(env, room.ownerId === userId, a.grant, a.ownerConsent, prefs?.grant) ?? prefs?.grant ?? "act";
  if (a.mode === "autopilot" && grant === "read") throw new OpFailure("Autopilot needs the assistant to act: give it act rights.");
  // Choosing autopilot starts a new chain of ticks; any other mode ends the chain at its next tick.
  const row = await setPrefs(env.ctx, room._id, userId, { mode: a.mode, grant });
  if (a.mode === "autopilot") {
    const chain = row.chain + 1;
    await setPrefs(env.ctx, room._id, userId, { chain });
    await scheduleAutopilot(env.ctx, room._id, userId, chain, 0);
  }
  return { mode: a.mode, grant };
});

async function ownQueued(env: Env, queueId: string) {
  const { userId } = human(env);
  const id = env.ctx.db.normalizeId("v2AssistantQueue", queueId), row = id ? await env.ctx.db.get(id) : null;
  if (!row || row.userId !== userId || row.status !== "queued") throw new OpFailure("That message is no longer waiting.");
  return row;
}

export const { op: editQueued, as: editQueuedAs } = defineOp("assistant.editQueued", "mutation", async (env, a) => {
  await env.ctx.db.patch((await ownQueued(env, a.queueId))._id, { text: a.text });
  return { ok: true as const };
});

export const { op: removeQueued, as: removeQueuedAs } = defineOp("assistant.removeQueued", "mutation", async (env, a) => {
  await env.ctx.db.patch((await ownQueued(env, a.queueId))._id, { status: "removed" });
  return { ok: true as const };
});

export const { op: sendQueued, as: sendQueuedAs } = defineOp("assistant.sendQueued", "mutation", async env => {
  const { room, userId } = human(env);
  if (await busyTurn(env.ctx, room._id, userId)) throw new OpFailure("The assistant is still working; your messages go next.");
  providerFor();
  return { turnId: await drainQueue(env.ctx, room, userId, true) };
});
