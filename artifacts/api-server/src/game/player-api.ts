import { VERSION, envelopeSchema, observationSchema, type Envelope, type CommandResult } from "@workspace/player-client";
import { personalScore } from "@workspace/game-core";
import { member, mutate, resolveRoom } from "./store";
import { standings, utilityCard } from "./projection";
import { playerCommand } from "./engine";
import { hash } from "../lib/identity";
import type { Actor, Room } from "./types";

export function observation(room: Room, actor: Actor) {
  member(room, actor);
  const game = room.game, deity = game?.deities.find(d => d.id === actor.id);
  const self = room.members.find(m => m.id === actor.id)!;
  return observationSchema.parse({
    version: VERSION, roomId: room.id, revision: room.seq,
    roomShortCode: room.shortCode, gameShortCode: game?.shortCode, seated: !!deity,
    gameId: game?.id, planningEndsAt: game?.planningEndsAt, pauseEndsAt: game?.pauseEndsAt,
    phase: game?.phase === "recovery" ? "paused" : game?.phase ?? "lobby",
    language: game?.settings.language ?? room.settings.language,
    self: { godId: actor.id, label: self.name, isAI: self.kind === "ai", ready: self.ready,
      utility: game && deity ? utilityCard(game, actor.id) ?? undefined : undefined, pauseUsed: deity?.pauseUsed ?? false,
      energy: !game || !deity ? 0 : game.settings.startingEnergy + Math.max(0, Date.now() - game.createdAt) / 1000 * game.settings.energyPerSecond - deity.spent },
    objects: !game || !deity ? [] : game.objects.map(o => {
      return { id: o.id, value: o.value, ...personalScore(new Map(Object.entries(o.utilities)), actor.id) };
    }),
    agents: game?.agents.filter(a => a.ownerId === actor.id).map(a => ({ ...a, language: game.settings.language })) ?? [],
    transformations: game?.events.filter(e => e.ownerId === actor.id && e.type === "object.transformed").slice(-500)
      .map(e => ({ id: e.id, agentId: e.agentId, before: e.before, after: e.object.value })) ?? [],
    leaderboard: game ? standings(game).map(s => ({ godId: s.deityId, label: s.name, isAI: s.kind === "ai", score: s.totalScore })) : [],
    chat: room.chat.slice(-100).map(m => ({ id: m.id, godId: m.authorId, label: m.authorName, isAI: m.kind === "ai", text: m.text.slice(0, 2000) })),
  });
}
export async function executePlayerEnvelope(roomId: string, actor: Actor, raw: unknown): Promise<CommandResult> {
  const envelope = envelopeSchema.parse(raw);
  return mutate(resolveRoom(roomId).id, async room => {
    member(room, actor);
    const key = `client:${actor.id}:${envelope.commandId}`, digest = hash(JSON.stringify(envelope));
    if (room.receipts[key]) {
      if (room.receipts[key].hash !== digest) throw new Error("Command ID was reused with different content");
      return room.receipts[key].result as CommandResult;
    }
    const command = envelope.command;
    let receipt: CommandResult;
    try {
      if (["validate", "summon", "pause"].includes(command.type) && !envelope.gameId) throw new Error("Game ID is required");
      if (envelope.gameId && envelope.gameId !== room.game?.id) throw new Error("Stale game");
      if ("language" in command && command.language !== room.game?.settings.language) throw new Error("Wrong game language");
      const names: Record<Envelope["command"]["type"], string> = {
        validate: "agent.validate", summon: "agent.summon", ready: "ready.set", chat: "chat.send", pause: "pause.use",
      };
      const result = await playerCommand(room, actor, {
        command: names[command.type], requestId: envelope.commandId, gameId: room.game?.id, payload: command,
      });
      receipt = { commandId: envelope.commandId, accepted: true, message: "Accepted",
        ...(command.type === "validate" ? { validation: result as NonNullable<CommandResult["validation"]> } : {}) };
    } catch (error) {
      receipt = { commandId: envelope.commandId, accepted: false, message: (error as Error).message.slice(0, 2000),
        ...(command.type === "validate" ? { validation: { valid: false, cost: 0, diagnostics: [(error as Error).message.slice(0, 1000)] } } : {}) };
    }
    room.receipts[key] = { hash: digest, result: receipt };
    return receipt;
  });
}
