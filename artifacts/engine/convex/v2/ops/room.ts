/** `room.*`: the caller's rooms, creating and joining one, the room in view, leaving it, watching (plan §2.2, §4.3). */
import { touchActivity } from "../activity";
import { OpFailure } from "@workspace/v2-affordances";
import { quotasOf, setQuotas } from "../spend";
import { roomView } from "../rooms";
import { DEFAULT_PRESET, isPreset, presetOf } from "../presets";
import { playable } from "../deal";
import { callerOf, defineOp, inRoom } from "./define";
import { pageOf } from "./paging";
import { changeSettings, createRoom, joinRoom, leaveRoom, setSpectator as setSpectatorIn } from "../lobby";

export const { op: list, as: listAs } = defineOp("room.list", "query", async (env, a) => {
  const { ctx } = env, caller = callerOf(env);
  // A one-off read for models (R7): a page of memberships, each with its room and current game. Offered at home only,
  // so a credential bound to one room (always in its room) never lists the others.
  const page = await ctx.db.query("v2Members").withIndex("by_user", q => q.eq("userId", caller.userId!)).order("desc").paginate(pageOf(a));
  const rows = [];
  for (const m of page.page) {
    const room = await ctx.db.get(m.roomId);
    if (!room) continue;
    const game = room.gameId ? await ctx.db.get(room.gameId) : null;
    rows.push({ roomId: room._id, code: room.code, name: room.name, phase: game?.phase ?? "lobby" as const });
  }
  return { page: rows, nextCursor: page.isDone ? null : page.continueCursor };
});

/** A deployed preset (v2/setups:presets lists them). */
function checkPreset(preset: string | undefined) {
  if (preset !== undefined && !isPreset(preset)) throw new OpFailure(`No preset ${preset}.`, "Pick one of the deployed presets (v2/setups:presets).");
  if (preset !== undefined && !playable(presetOf(preset))) throw new OpFailure(`${presetOf(preset).title} is not playable yet: its rules have no value functions on this deployment.`, "Pick one of the deployed presets (v2/setups:presets).");
}

export const { op: create, as: createAs } = defineOp("room.create", "mutation", async (env, a) => {
  checkPreset(a.preset);
  await touchActivity(env.ctx);   // human activity (activity.ts)
  return await createRoom(env.ctx, env.caller.userId!, { name: a.name, preset: a.preset ?? DEFAULT_PRESET });
});

export const { op: join, as: joinAs } = defineOp("room.join", "mutation", async ({ ctx, caller }, a) => {
  await touchActivity(ctx);
  return { roomId: await joinRoom(ctx, caller.userId!, a.code) };
});

export const { op: get, as: getAs } = defineOp("room.get", "query", async env => {
  const { room, user } = inRoom(env);
  return await roomView(env.ctx, room, user.userId);
});

export const { op: history, as: historyAs } = defineOp("room.history", "query", async (env, a) => {
  const { room } = inRoom(env);
  const page = await env.ctx.db.query("v2Games").withIndex("by_room_phase", q => q.eq("roomId", room._id).eq("phase", "ended")).order("desc").paginate(pageOf(a));
  return {
    page: page.page.map(g => ({ gameId: g._id, endedAt: g.endedAt ?? 0, winner: g.summary?.winner ?? null })),
    nextCursor: page.isDone ? null : page.continueCursor,
  };
});

export const { op: leave, as: leaveAs } = defineOp("room.leave", "mutation", async env => {
  const { room, member } = inRoom(env);
  await leaveRoom(env.ctx, room, member);
  return { ok: true as const };
});

export const { op: setSpectator, as: setSpectatorAs } = defineOp("room.setSpectator", "mutation", async (env, a) => {
  const { room, member } = inRoom(env);
  await setSpectatorIn(env.ctx, room, member, a.spectator);
  return { ok: true as const };
});

export const { op: settings, as: settingsAs } = defineOp("room.settings", "mutation", async (env, a) => {
  const { room } = inRoom(env);
  checkPreset(a.preset);
  await changeSettings(env.ctx, room, a);
  return { ok: true as const };
});

/** The owner's per-game token quotas (v2/ai.ts): set at once, also during a game; with neither given, read them. */
export const { op: aiQuotas, as: aiQuotasAs } = defineOp("room.aiQuotas", "mutation", async (env, a) => {
  const { room } = inRoom(env);
  return a.ai === undefined && a.assistant === undefined ? await quotasOf(env.ctx, room._id) : await setQuotas(env.ctx, room._id, a);
});
