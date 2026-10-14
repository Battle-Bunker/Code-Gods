import { Router } from "express";
import { randomUUID } from "node:crypto";
import { CreateRoomBody, RoomActionBody } from "@workspace/api-zod";
import { DEFAULT_SETTINGS, SETTINGS_OPTIONS, validateSettings } from "@workspace/game-core";
import { requireIdentity } from "../lib/identity";
import { allRooms, createRoom, resolveRoom, mutate, member, owner } from "../game/store";
import { publicRoom } from "../game/projection";
import { playerCommand, startGame } from "../game/engine";
import { runtime } from "../game/adapters";
import { aiFundingStatus } from "../game/ai-provider";
import { getAgentDefinition } from "../game/agent-library";

const router = Router();
router.get("/manifest", (_req, res) => res.json({
  protocolVersion: 1, minimumPlayers: 3, defaults: DEFAULT_SETTINGS, runtimes: runtime?.languages ?? [], options: SETTINGS_OPTIONS, aiFunding: aiFundingStatus(),
}));
router.get("/rooms", (req, res) => {
  const actor = requireIdentity(req);
  res.json(allRooms().filter(r => r.members.some(m => m.id === actor.id)).map(r => ({
    id: r.id, shortCode: r.shortCode, ownerId: r.ownerId,
    ownerName: r.members.find(m => m.id === r.ownerId)?.name ?? r.ownerId,
    createdAt: r.createdAt,
    memberCount: r.members.length, phase: r.game?.phase ?? "lobby",
  })));
});
router.post("/rooms", async (req, res) => {
  CreateRoomBody.parse(req.body ?? {});
  res.status(201).json(publicRoom(await createRoom(requireIdentity(req))));
});
router.get("/rooms/:roomId", (req, res) => {
  const actor = requireIdentity(req);
  if (actor.scope !== "browser" && actor.roomId !== resolveRoom(String(req.params.roomId)).id) throw new Error("Wrong room scope");
  res.json(publicRoom(resolveRoom(String(req.params.roomId))));
});
router.post("/rooms/:roomId/actions", async (req, res) => {
  const actor = requireIdentity(req), input = RoomActionBody.parse(req.body);
  const id = resolveRoom(String(req.params.roomId)).id;
  await mutate(id, async room => {
    if (input.action === "join") {
      if (actor.scope !== "browser") throw new Error("Browser login required to join");
      if (!room.members.some(m => m.id === actor.id)) {
        if (room.members.length >= 8) throw new Error("This room has reached its eight-player limit");
        room.members.push({ id: actor.id, name: actor.name, kind: "human", ready: false });
      }
      return;
    }
    member(room, actor);
    if (input.action === "chat" || input.action === "ready") {
      await playerCommand(room, actor, {
        command: input.action === "chat" ? "chat.send" : "ready.set", requestId: input.requestId,
        payload: input.action === "chat" ? { text: input.text } : { ready: input.ready },
      });
      return;
    }
    owner(room, actor);
    if (input.action === "start") {
      const key = `start:${actor.id}:${input.requestId}`;
      if (room.receipts[key]) return;
      await startGame(room, actor);
      room.receipts[key] = { hash: "start", result: { gameId: room.game!.id } };
      return;
    }
    if (input.action === "resume") {
      if (room.game?.phase !== "recovery") throw new Error("Game is not in recovery");
      room.game.phase = room.game.worldSeconds === 0 && room.game.planningEndsAt > Date.now() ? "planning" : "running";
      room.game.lastTick = Date.now();
      return;
    }
    if (room.game && room.game.phase !== "ended") throw new Error("Settings and seats are frozen during games");
    if (input.action === "settings") {
      if (input.revision !== room.revision) throw Object.assign(new Error("Settings changed; refresh before saving"), { status: 409 });
      if (!input.settings) throw new Error("Settings are required");
      validateSettings(input.settings);
      if (input.settings.stringMaxLength > 1024 || input.settings.startingObjectCount > 1000 ||
          input.settings.interactionRateHz > 1000 || input.settings.spawnRateHz > 10 ||
          input.settings.planningSeconds > 3600 || input.settings.pauseSeconds > 3600) throw new Error("Settings exceed server resource limits");
      room.settings = input.settings;
      if (input.aiBudget !== undefined) room.aiBudget = input.aiBudget;
      room.revision++;
    } else if (input.action === "addAi") {
      if (room.members.length >= 8) throw new Error("Maximum eight gods");
      if (!input.aiAgentId) throw new Error("Choose an agent from the library");
      const definition = await getAgentDefinition(input.aiAgentId);
      if (!definition) throw Object.assign(new Error("AI agent not found"), { status: 404 });
      const { id, name, provider, model, prompt, revision } = definition;
      room.members.push({ id: `ai:${randomUUID()}`, name, kind: "ai", ready: true,
        aiAgent: { id, name, provider, model, prompt, revision }, status: "Ready; awaiting game start" });
    } else if (input.action === "removeAi") {
      const target = room.members.find(m => m.id === input.deityId);
      if (!target || target.kind !== "ai") throw new Error("AI seat not found");
      room.members = room.members.filter(m => m.id !== target.id);
    }
  });
  res.json(publicRoom(resolveRoom(id)));
});
router.get("/rooms/:roomId/chat", (req, res) => {
  const room = resolveRoom(String(req.params.roomId));
  member(room, requireIdentity(req));
  const before = Number(req.query.before ?? Infinity);
  res.json(room.chat.filter(m => m.timestamp < before).slice(-100));
});
export default router;
