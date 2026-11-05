/**
 * Each god's agents' energy over the game (docs/convex-read-architecture.md §4.3: the agents panel's series, which the
 * client used to sample itself while the panel was open, so it was lost on reload and differed per viewer). The tick
 * writes one agentSamples row per roster god that has agents each time the scoreboard is published (every
 * scoreIntervalSeconds of world time), from the agents as that commit leaves them. player.agentSeries pages a god's
 * own rows by world time. PRIVATE: an agent's energy is its owner's (the agents themselves are).
 */
import type { GameSettings } from "@workspace/game-core";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { agentStatus } from "../lib/world";

/** Write every roster god's agents' energy at world time `world` (one row per god with agents). */
export async function writeAgentSamples(ctx: MutationCtx, game: { _id: Id<"games">; settings: unknown; roster: readonly { id: string }[] }, world: number) {
  // bounded: a game's agents (the summon limit keeps them to maxAgentsPerGod per god, at most 8 gods).
  const agents = await ctx.db.query("agents").withIndex("by_game", q => q.eq("gameId", game._id)).take(200);
  for (const { id: godId } of game.roster) {
    const own = agents.filter(a => a.ownerId === godId);
    if (!own.length) continue;
    const energies = own.map(a => ({ id: a._id as string, energy: agentStatus(game.settings as GameSettings, a, world).energy }));
    await ctx.db.insert("agentSamples", { gameId: game._id, godId, world, agents: energies });
  }
}
