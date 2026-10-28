import { Router } from "express";
import { randomUUID } from "node:crypto";
import { CreateRoomBody, RoomActionBody } from "@workspace/api-zod";
import { DEFAULT_SETTINGS, SETTINGS_OPTIONS, SETTINGS_PRESETS, instantiationOf, presetSettings, typeDefaults, validateSettings, type GameSettings } from "@workspace/game-core";
import { familiesFor } from "@workspace/game-utilities";
import { OBJECT_TYPES, instanceInfo } from "@workspace/game-types";
import { VERSION as PLAYER_PROTOCOL } from "@workspace/player-client";
import { offeredInstantiations, priorOf, PRIORS } from "../game/calibration";
import { requireIdentity, requireAct } from "../lib/identity";
import { allRooms, createRoom, resolveRoom, mutate, member, owner, roomHistory } from "../game/store";
import { publicRoom } from "../game/projection";
import { endGame, playerCommand, resumeGame, startGame } from "../game/engine";
import { runtime } from "../game/adapters";
import { aiFundingStatus } from "../game/ai-provider";
import { getAgentDefinition } from "../game/agent-library";

const router = Router();
/**
 * Object types for the settings pickers: parameters (with presets), capability classes and their badges,
 * and the instantiations the server offers (those whose every dealable utility function is calibrated).
 */
let objectTypes: unknown[] | undefined;
export function objectTypesManifest() {
  return objectTypes ??= OBJECT_TYPES.map(T => ({
    id: T.id, label: T.label, emoji: T.emoji, kid: T.kid, params: T.params, defaults: T.defaults,
    // Tuned settings for games of this type (e.g. Grid: more objects, faster spawns).
    settingsDefaults: typeDefaults(T.id),
    classes: T.classes.map(c => ({ id: c.id, slot: c.slot, superclasses: c.superclasses, badge: c.badge })),
    // Offered with each instantiation's default exclusions (rules not dealt by default need no tables).
    offered: offeredInstantiations(T.id, { excludedFamilies: inst => typeDefaults(T.id, inst.args).excludedFamilies ?? [] }).map(inst => {
      const info = instanceInfo(inst);
      return { key: inst.key, args: inst.args, label: info.label, badges: info.badges, classes: inst.classes,
        settingsDefaults: typeDefaults(T.id, inst.args) };
    }),
  }));
}
/**
 * When the owner switches instantiation, the tuned per-type defaults follow it: every tuned field the request
 * left untouched (absent, or still the room's current value) and that was still at the old instantiation's
 * default takes the new instantiation's default; customised values are kept.
 */
export function retuneSettings(previous: GameSettings, next: GameSettings, sent: Record<string, unknown>): GameSettings {
  const before = instantiationOf(previous).key, after = instantiationOf(next).key;
  if (before === after) return next;
  const oldDefaults = typeDefaults(previous.objectType, previous.typeArgs);
  const newDefaults = typeDefaults(next.objectType, next.typeArgs);
  const tuned = new Set([...Object.keys(oldDefaults), ...Object.keys(newDefaults)]) as Set<keyof GameSettings>;
  const out = { ...next } as Record<string, unknown>;
  for (const key of tuned) {
    // Only fields still at the old instantiation's default follow; values the owner customised are kept.
    const untouched = !(key in sent) || JSON.stringify(sent[key]) === JSON.stringify(previous[key]);
    const wasDefault = JSON.stringify(previous[key]) === JSON.stringify(oldDefaults[key] ?? DEFAULT_SETTINGS[key]);
    if (untouched && wasDefault) out[key] = newDefaults[key] ?? DEFAULT_SETTINGS[key];
  }
  return out as unknown as GameSettings;
}
const isOffered = (settings: GameSettings) => {
  const inst = instantiationOf(settings);
  // With this game's excluded families and prior: every family it can deal must be calibrated.
  return offeredInstantiations(settings.objectType, { excludedFamilies: settings.excludedFamilies, prior: priorOf(settings.priorId) })
    .some(offered => offered.key === inst.key);
};
/** Settings name an instantiation the server offers (otherwise no calibrated utility functions exist) and known families. */
export function assertOffered(settings: GameSettings) {
  priorOf(settings.priorId);
  if (!isOffered(settings))
    throw new Error(`${instantiationOf(settings).key} is not offered: choose one of the listed ${settings.objectType} settings`);
  const known = new Set(familiesFor(settings.objectType).map(f => f.id));
  const unknown = settings.excludedFamilies.filter(id => !known.has(id));
  if (unknown.length) throw new Error(`Unknown ${settings.objectType} utility families: ${unknown.join(", ")}`);
}
/** The named starting points, in order, with the full settings each applies. */
export function presetsManifest() {
  return SETTINGS_PRESETS.map(p => {
    const settings = presetSettings(p.id);
    return { id: p.id, label: p.label, kid: p.kid, objectType: p.objectType, typeArgs: p.typeArgs, settings, offered: isOffered(settings) };
  });
}
router.get("/manifest", (_req, res) => res.json({
  protocolVersion: 1, playerProtocol: PLAYER_PROTOCOL, minimumPlayers: 3, defaults: DEFAULT_SETTINGS,
  runtimes: runtime?.languages ?? [], options: SETTINGS_OPTIONS, aiFunding: aiFundingStatus(),
  objectTypes: objectTypesManifest(), presets: presetsManifest(), priors: Object.keys(PRIORS),
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
      if (!input.settings && !input.preset) throw new Error("Settings or a preset are required");
      // A preset replaces the whole draft (keeping the room's language); explicit settings are retuned to their instantiation.
      const settings = input.preset ? presetSettings(input.preset, input.settings?.language ?? room.settings.language)
        : retuneSettings(room.settings, input.settings as GameSettings, (req.body?.settings ?? {}) as Record<string, unknown>);
      validateSettings(settings);
      assertOffered(settings);
      if (settings.startingObjectCount > 1000 ||
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
