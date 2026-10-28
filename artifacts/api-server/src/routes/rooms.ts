import { Router } from "express";
import { randomUUID } from "node:crypto";
import { CreateRoomBody, RoomActionBody } from "@workspace/api-zod";
import { DEFAULT_SETTINGS, SETTINGS_OPTIONS, validateSettings, type GameSettings } from "@workspace/game-core";
import { gridManifest } from "@workspace/game-utilities";
import { requireIdentity, requireAct } from "../lib/identity";
import { allRooms, createRoom, resolveRoom, mutate, member, owner, roomHistory } from "../game/store";
import { publicRoom } from "../game/projection";
import { endGame, playerCommand, resumeGame, startGame } from "../game/engine";
import { runtime } from "../game/adapters";
import { aiFundingStatus } from "../game/ai-provider";
import { getAgentDefinition } from "../game/agent-library";

const router = Router();
router.get("/manifest", (_req, res) => res.json({
  protocolVersion: 1, minimumPlayers: 3, defaults: DEFAULT_SETTINGS, runtimes: runtime?.languages ?? [], options: SETTINGS_OPTIONS, aiFunding: aiFundingStatus(),
  grid: gridManifest(),
}));
router.get("/rooms", (req, res) => {
  const actor = requireIdentity(req);
  res.json(allRooms().filter(r => (actor.scope === "browser" || actor.roomId === r.id) && r.members.some(m => m.id === actor.id)).map(r => ({
    id: r.id, shortCode: r.shortCode, ownerId: r.ownerId,
    ownerName: r.members.find(m => m.id === r.ownerId)?.name ?? r.ownerId,
    createdAt: r.createdAt,
    memberCount: r.members.length,
    // A room is a lobby between games; "phase" is its active game's phase while one runs.
    phase: r.game && r.game.phase !== "ended" ? r.game.phase : "lobby",
    activeGameShortCode: r.game && r.game.phase !== "ended" ? r.game.shortCode : null,
  })));
});
router.post("/rooms", async (req, res) => {
  CreateRoomBody.parse(req.body ?? {});
  res.status(201).json(publicRoom(await createRoom(requireIdentity(req))));
});
router.get("/rooms/:roomId", (req, res) => {
  const actor = requireIdentity(req);
  if (actor.scope !== "browser" && actor.roomId !== resolveRoom(String(req.params.roomId)).id)
    throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  res.json(publicRoom(resolveRoom(String(req.params.roomId))));
});
router.post("/rooms/:roomId/actions", async (req, res) => {
  const actor = requireIdentity(req), input = RoomActionBody.parse(req.body);
  const id = resolveRoom(String(req.params.roomId)).id;
  await mutate(id, async room => {
    requireAct(actor);
    if (input.action === "join") {
      if (actor.scope !== "browser") throw new Error("Browser login required to join");
      if (!room.members.some(m => m.id === actor.id)) {
        if (room.members.length >= 8) throw new Error("This room has reached its eight-player limit");
        room.members.push({ id: actor.id, name: actor.name, kind: "human", ready: false });
      }
      return;
    }
    member(room, actor);
    if (input.action === "leave") {
      if (room.ownerId === actor.id) throw new Error("The owner cannot leave their room");
      if (room.game && room.game.phase !== "ended" && room.game.roster.some(m => m.id === actor.id))
        throw new Error("You are seated in the active game; leave after it ends");
      room.members = room.members.filter(m => m.id !== actor.id);
      return;
    }
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
      resumeGame(room.game);
      return;
    }
    if (input.action === "endGame") {
      endGame(room, actor);
      return;
    }
    if (room.game && room.game.phase !== "ended") throw new Error("Settings and seats are frozen during games");
    if (input.action === "settings") {
      if (input.revision !== room.revision) throw Object.assign(new Error("Settings changed; refresh before saving"), { status: 409 });
      if (!input.settings) throw new Error("Settings are required");
      // Clients that predate a setting omit it: keep its default rather than reject the whole form.
      const settings: GameSettings = { ...DEFAULT_SETTINGS, ...input.settings };
      validateSettings(settings);
      if (settings.stringMaxLength > 1024 || settings.startingObjectCount > 1000 ||
          settings.interactionRateHz > 1000 || settings.spawnRateHz > 10 ||
          settings.planningSeconds > 3600 || settings.pauseSeconds > 3600) throw new Error("Settings exceed server resource limits");
      room.settings = settings;
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
/** Finished games played in this room, newest first: public results only. */
router.get("/rooms/:roomId/games", async (req, res) => {
  const actor = requireIdentity(req), room = resolveRoom(String(req.params.roomId));
  if (actor.scope !== "browser" && actor.roomId !== room.id) throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  res.set("Cache-Control", "no-store").json(await roomHistory(room.id));
});
router.get("/rooms/:roomId/chat", (req, res) => {
  const room = resolveRoom(String(req.params.roomId));
  member(room, requireIdentity(req));
  const before = Number(req.query.before ?? Infinity);
  res.json(room.chat.filter(m => m.timestamp < before).slice(-100));
});
export default router;
