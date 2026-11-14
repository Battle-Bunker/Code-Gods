/**
 * The viewer's affordance context (lib/v2-affordances AffordanceContext) from what the page already subscribes to: the
 * page (home, room, a game's phase, a replay), who the viewer is in that room and game, and the room's and game's cold
 * facts. Pure: the server derives the same from its own records and has the last word (never the client's say-so).
 */
import type { AffordanceContext, Context } from "@workspace/v2-affordances";
import { presetOf } from "@workspace/engine/convex/v2/presets.ts";
import type { Header, Me, Room } from "@/sdk/types";

export interface ContextInput {
  signedIn: boolean;
  admin: boolean;
  room?: Room | null;
  header?: Header | null;
  me?: Me | null;
  replay?: boolean;
}

export function affordanceContext(i: ContextInput): AffordanceContext {
  const room = i.room ?? null, header = i.header ?? null;
  const self = room?.members.find(m => m.me) ?? null;
  const context: Context = !i.signedIn ? "signedOut" : !room ? "home" : i.replay ? "replay" : header ? header.phase : "room";
  const ctx: AffordanceContext = {
    context,
    principal: {
      signedIn: i.signedIn,
      member: !!self,
      seated: header ? header.me !== null : !!self && !self.spectator,
      owner: !!self?.owner,
      admin: i.admin,
    },
  };
  if (room) ctx.room = { players: room.members.filter(m => !m.spectator).length, minPlayers: presetOf(room.preset).minPlayers, bidOpen: !!room.bidding };
  if (header) ctx.game = { phase: header.phase, ...(i.me ? { energy: i.me.energy, pauseUsed: i.me.pauseUsed, agents: i.me.agents } : {}) };
  return ctx;
}
