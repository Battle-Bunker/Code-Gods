import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { DEFAULT_SETTINGS, normalizeLegacySettings, uniquePrefixes, resolveIdentifier, encodeUuid, validateSettings, type GameSettings } from "@workspace/game-core";
import type { Room, Actor, WorldEvent, Game } from "./types";
import { gameRecord, type GameRecord } from "./projection";
import { assertSessionActive } from "../lib/identity";

const rooms = new Map<string, Room>();
const tails = new Map<string, Promise<unknown>>();
let closing = false;
type InteractionBuffer = { latest: Room; events: WorldEvent[] };
const interactionBuffers = new Map<string, InteractionBuffer>();
let bufferedInteractions = 0;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushFailure: unknown;
const MAX_BUFFERED_INTERACTIONS = 256;
const MAX_ROOM_INTERACTIONS = 64;

/** Bounded speculative window. Commands always drain this window before acknowledging. */
export function interactionCapacity(roomId: string) {
  return !closing && !flushFailure && bufferedInteractions < MAX_BUFFERED_INTERACTIONS &&
    (interactionBuffers.get(roomId)?.events.length ?? 0) < MAX_ROOM_INTERACTIONS;
}

function scheduleInteractionFlush(delay = 100) {
  if (delay === 0 && flushTimer) { clearTimeout(flushTimer); flushTimer = undefined; }
  if (flushTimer || closing) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void serialized("interaction-flush", flushInteractions).catch(error => {
      flushFailure = error;
      console.error("Interaction persistence failed; admission suspended until retry succeeds", error);
      scheduleInteractionFlush();
    });
  }, delay).unref();
}

/** Called only while holding the authority lock. Failed transactions retain the bounded buffer. */
async function flushInteractions() {
  for (const [id, buffer] of interactionBuffers) {
    // One small implicit transaction; neither world snapshot is rewritten here.
    // Retrying an uncertain acknowledgement is safe: a room sequence is unique.
    try {
      await pool.query(`INSERT INTO cg_interaction_batches(room_id,game_id,end_seq,events) VALUES($1,$2,$3,$4)
        ON CONFLICT(room_id,end_seq) DO NOTHING`,
      [id, buffer.latest.game!.id, buffer.latest.seq, JSON.stringify(buffer.events)]);
    } catch (error) {
      // Freeze this exact batch even if COMMIT succeeded but its acknowledgement
      // was lost; retry the same idempotency key before admitting more changes.
      flushFailure = error;
      throw error;
    }
    interactionBuffers.delete(id);
    bufferedInteractions -= buffer.events.length;
    for (const listener of listeners) {
      try { listener(buffer.latest, "room.snapshot"); }
      catch (error) { console.error("Committed interaction notification failed", error); }
    }
  }
  flushFailure = undefined;
}

/**
 * Work must only transform objects, settle the acting agent's account and append ONE event; no
 * receipts, god energy or commands. The target object and agent are copied; work replaces, never
 * mutates, entries of `agents`.
 */
export function mutateInteraction(id: string, objectId: string, work: (room: Room) => boolean, agentId?: string): Promise<void> {
  return serialized(id, async () => {
    if (!interactionCapacity(id)) return;
    const original = resolveRoom(id);
    if (!original.game) return;
    const targetIndex = original.game.objects.findIndex(object => object.id === objectId);
    if (targetIndex < 0) return;
    const objects = original.game.objects.slice();
    objects[targetIndex] = { ...objects[targetIndex] };
    // Historical events and descriptors are immutable here: avoid cloning the entire world.
    const draft: Room = { ...original, game: { ...original.game,
      objects, agents: original.game.agents.slice(),
      events: original.game.events.slice(),
    } };
    if (!work(draft)) return;
    const added = draft.game!.events.at(-1)!;
    if (!added || added.id === original.game.events.at(-1)?.id || added.type === "object.spawned" ||
        (added.type === "object.transformed" && !draft.game!.objects.some(object => object.id === added.object.id)) ||
        (agentId !== undefined && added.agent?.id !== agentId)) throw new Error("Invalid interaction mutation");
    draft.seq++;
    const buffer: InteractionBuffer = interactionBuffers.get(id) ?? { latest: draft, events: [] };
    buffer.latest = draft;
    buffer.events.push(added);
    interactionBuffers.set(id, buffer);
    bufferedInteractions++;
    rooms.set(id, draft);
    scheduleInteractionFlush(buffer.events.length >= 32 || bufferedInteractions >= 128 ? 0 : 100);
  });
}
export async function refreshStore() { /* Single-instance cache is authoritative. */ }

export type InteractionBatch = { room_id: string; game_id: string; end_seq: number | string; events: WorldEvent[] };

/**
 * Reconstruct committed state without mutating a stored checkpoint. Fail closed on gaps/corruption.
 * Each batch event is one act: a transformation (new object version) and/or the acting agent's
 * resulting account (absolute values), so replay restores agent balances, acts and spending too.
 */
export function rehydrateInteractions(checkpoint: Room, batches: InteractionBatch[]): Room {
  const room = structuredClone(checkpoint);
  const game = room.game;
  if (!game) return room;
  game.events ??= [];
  game.agents ??= [];
  const byId = new Map(game.objects.map((object, index) => [object.id, index]));
  for (const batch of [...batches].sort((a, b) => Number(a.end_seq) - Number(b.end_seq))) {
    if (batch.room_id !== room.id || batch.game_id !== game.id) continue;
    const end = Number(batch.end_seq);
    if (!Number.isSafeInteger(end) || !Array.isArray(batch.events) || !batch.events.length)
      throw new Error("Invalid durable interaction batch");
    if (end <= room.seq) continue;
    const start = end - batch.events.length;
    if (start > room.seq) throw new Error("Durable interaction sequence gap");
    for (const event of batch.events.slice(room.seq - start)) {
      if (event.gameId !== game.id || (event.type !== "object.transformed" && event.type !== "agent.failed"))
        throw new Error("Invalid durable interaction event");
      if (event.type === "object.transformed") {
        const index = byId.get(event.object.id);
        if (index === undefined || event.object.version !== game.objects[index].version + 1 || event.before !== game.objects[index].value)
          throw new Error("Invalid durable interaction object transition");
        game.objects[index] = structuredClone(event.object);
      }
      if (event.agent) {
        const agent = game.agents.findIndex(a => a.id === event.agent!.id);
        if (agent < 0) throw new Error("Invalid durable interaction agent");
        const { account, acts, spent } = structuredClone(event.agent);
        game.agents[agent] = { ...game.agents[agent], account, acts, spent };
      }
      game.events.push(structuredClone(event));
      room.seq++;
    }
    if (room.seq !== end) throw new Error("Invalid durable interaction end sequence");
  }
  if (game.events.length > 5000) game.events = game.events.slice(-5000);
  return room;
}
export async function closeStore() {
  closing = true;
  if (flushTimer) clearTimeout(flushTimer);
  await Promise.allSettled([...tails.values()]);
  await flushInteractions();
}
export const listeners = new Set<(room: Room, event: string, payload?: unknown) => void>();
export const allRooms = () => [...rooms.values()];
export function resolveRoom(id: string): Room {
  try { return rooms.get(resolveIdentifier(id, [...rooms.keys()]))!; }
  catch (error) { throw Object.assign(error as Error, { status: 404 }); }
}
export function member(room: Room, actor: Actor) {
  assertSessionActive(actor);
  if (actor.scope === "player" && actor.roomId !== room.id) throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  if (!room.members.some(m => m.id === actor.id)) throw Object.assign(new Error("Join this room first"), { status: 403 });
}
export function owner(room: Room, actor: Actor) {
  member(room, actor);
  if (room.ownerId !== actor.id || (actor.scope !== "browser" && actor.permission !== "owner"))
    throw Object.assign(new Error("Room owner access required"), { status: 403 });
}
export async function persist(room: Room) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const changedAliases: { id: string; shortCode: string }[] = [];
    if (room.game) {
      const existing = await client.query("SELECT id,prefix_length FROM cg_games");
      const ids: string[] = existing.rows.map(row => row.id);
      if (!ids.includes(room.game.id)) ids.push(room.game.id);
      for (const alias of uniquePrefixes(ids)) {
        if (alias.id === room.game.id) room.game.shortCode = alias.shortCode;
        const prior = existing.rows.find(row => row.id === alias.id);
        if (prior && prior.prefix_length !== alias.prefixLength) {
          changedAliases.push(alias);
          await client.query(`UPDATE cg_games SET prefix_length=$2,state=jsonb_set(state,'{shortCode}',to_jsonb($3::text)) WHERE id=$1`,
            [alias.id, alias.prefixLength, alias.shortCode]);
          await client.query(`UPDATE cg_rooms SET state=jsonb_set(state,'{game,shortCode}',to_jsonb($2::text)) WHERE state->'game'->>'id'=$1`,
            [alias.id, alias.shortCode]);
        }
      }
      // The public summary is written in the same transaction that ends the game.
      const ended = room.game.phase === "ended";
      await client.query(`INSERT INTO cg_games(id,room_id,prefix_length,state,started_at,ended_at,summary)
        VALUES($1,$2,$3,$4,to_timestamp($5::double precision/1000),to_timestamp($6::double precision/1000),$7)
        ON CONFLICT(id) DO UPDATE SET state=$4,prefix_length=$3,started_at=EXCLUDED.started_at,ended_at=EXCLUDED.ended_at,
          summary=CASE WHEN $8::boolean THEN COALESCE(cg_games.summary,EXCLUDED.summary) ELSE EXCLUDED.summary END`,
      // A legacy game's stored summary (old scoring) is kept exactly as it was written.
      [room.game.id, room.id, room.game.shortCode.length, JSON.stringify(room.game), room.game.createdAt,
        room.game.endedAt ?? null, ended ? summarize(room.id, room.game) : null, isLegacyGame(room.game)]);
    }
    // Resolve the game alias first, then write the room exactly once.
    await client.query(`INSERT INTO cg_rooms(id,owner_id,prefix_length,state) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET state=$4,prefix_length=$3,updated_at=now()`,
    [room.id, room.ownerId, room.shortCode.length, JSON.stringify(room)]);
    // Snapshot and log compaction are one transaction: crash sees either old
    // snapshot + replayable log, or new snapshot with covered batches removed.
    await client.query("DELETE FROM cg_interaction_batches WHERE room_id=$1 AND end_seq <= $2", [room.id, room.seq]);
    await client.query("COMMIT");
    for (const alias of changedAliases) {
      for (const live of rooms.values()) if (live.game?.id === alias.id) live.game.shortCode = alias.shortCode;
    }
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export function serialized<T>(id: string, work: () => Promise<T>): Promise<T> {
  if (closing) return Promise.reject(Object.assign(new Error("Server shutting down"), { status: 503 }));
  // One authoritative commit order also covers cross-room alias changes.
  id = "authority";
  const prior = tails.get(id) ?? Promise.resolve();
  const next = prior.catch(() => {}).then(work);
  tails.set(id, next);
  void next.finally(() => { if (tails.get(id) === next) tails.delete(id); }).catch(() => {});
  return next;
}
export async function mutate<T>(id: string, work: (room: Room) => Promise<T>, event = "room.snapshot"): Promise<T> {
  return serialized(id, async () => {
    await flushInteractions();
    const original = resolveRoom(id);
    const draft = structuredClone(original);
    const result = await work(draft);
    settleGameEnd(draft);
    draft.seq++;
    await persist(draft);
    rooms.set(draft.id, draft);
    for (const listener of listeners) listener(draft, event);
    return result;
  });
}
/** A malformed legacy game must not block its room's writes; it just stays out of the history. */
function summarize(roomId: string, game: Game) {
  try { return JSON.stringify(gameRecord(roomId, game)); }
  catch (error) { console.error("Could not summarize an ended game", error); return null; }
}

/** Stamp the moment a game ends (by lifetime, owner or upgrade) in the commit that ends it. */
export function settleGameEnd(room: Room) {
  const game = room.game;
  if (game?.phase !== "ended" || game.endedAt !== undefined) return;
  game.endedAt = Date.now();
  game.endReason ??= "lifetime";
}

/** A room's finished games, newest first. Short codes are re-derived: aliases can lengthen. */
export async function roomHistory(roomId: string, limit = 100): Promise<GameRecord[]> {
  const rows = await pool.query(`SELECT id,prefix_length,summary FROM cg_games WHERE room_id=$1 AND summary IS NOT NULL
    ORDER BY started_at DESC NULLS LAST LIMIT $2`, [roomId, limit]);
  return rows.rows.map(row => ({ ...(row.summary as GameRecord), shortCode: encodeUuid(row.id).slice(0, row.prefix_length) }));
}

/**
 * Resolve a game code to its room's live game, or else to its stored final state.
 * The fast path avoids a database read for the 1 s poll of an active game page.
 */
export async function findGame(code: string): Promise<{ game: Game; roomId: string; live: boolean; summary?: GameRecord | null }> {
  const normalized = code.trim().toUpperCase();
  for (const room of rooms.values()) {
    const game = room.game;
    if (game && (game.shortCode.toUpperCase() === normalized || game.id.toUpperCase() === normalized)) return { game, roomId: room.id, live: true };
  }
  const all = await pool.query("SELECT id,room_id,prefix_length FROM cg_games");
  let id: string;
  try { id = resolveIdentifier(code, all.rows.map(row => row.id as string)); }
  catch (error) { throw Object.assign(error as Error, { status: 404 }); }
  const roomId = all.rows.find(row => row.id === id)!.room_id as string;
  const live = rooms.get(roomId)?.game;
  if (live?.id === id) return { game: live, roomId, live: true };
  const row = await pool.query("SELECT state,prefix_length,summary FROM cg_games WHERE id=$1", [id]);
  if (!row.rows.length) throw Object.assign(new Error("Game not found"), { status: 404 });
  const game = row.rows[0].state as Game;
  normalizeGame(game);
  game.shortCode = encodeUuid(id).slice(0, row.rows[0].prefix_length);
  return { game, roomId, live: false, summary: (row.rows[0].summary ?? null) as GameRecord | null };
}

/** Hydrate fields that older stored games lack. Ended games keep an unknown end time as null. */
function normalizeGame(game: Game) {
  game.settings = normalizedSettings(game.settings);
  game.events ??= [];
  game.agents ??= [];
  legacyObjects(game);
  if (game.phase === "ended" && game.endedAt === undefined) game.endedAt = null;
}

/** Games created before information scoring ([0, 1] utilities, free-form agents, objects with `utilities`). */
export const isLegacyGame = (game: Game) => game.scoring !== "information-v1";

/** COMPATIBILITY SHIM (plan §6.1): stored settings take the current shape; unusable lobby settings reset. */
function normalizedSettings(raw: unknown, requireValid = false): GameSettings {
  let settings: GameSettings;
  try { settings = normalizeLegacySettings(raw); }
  catch { return structuredClone(DEFAULT_SETTINGS) as GameSettings; }
  delete (settings as { valueGeneratorId?: string }).valueGeneratorId;
  if (requireValid) {
    try { validateSettings(settings); }
    catch { return structuredClone(DEFAULT_SETTINGS) as GameSettings; }
  }
  return settings;
}
function legacyObjects(game: Game) {
  type Legacy = { values?: Record<string, number>; utilities?: Record<string, number> };
  for (const object of [...game.objects, ...game.events.flatMap(e => "object" in e ? [e.object] : [])] as Legacy[]) {
    if (object.values) { object.utilities ??= object.values; delete object.values; }
  }
}

/** Games that ended before results were recorded get their public summary once. */
async function backfillHistory() {
  const legacy = await pool.query(`SELECT id,room_id,state FROM cg_games WHERE summary IS NULL AND state->>'phase'='ended'`);
  for (const row of legacy.rows) {
    const game = row.state as Game;
    normalizeGame(game);
    if (!game.roster?.length || !game.objects) continue;
    try {
      await pool.query(`UPDATE cg_games SET summary=$2,started_at=to_timestamp($3::double precision/1000) WHERE id=$1 AND summary IS NULL`,
        [row.id, JSON.stringify(gameRecord(row.room_id, game)), game.createdAt ?? null]);
    } catch (error) { console.error("Could not backfill a legacy game summary", error); }
  }
}

export async function createRoom(actor: Actor): Promise<Room> {
  if (actor.scope !== "browser") throw Object.assign(new Error("Browser login required"), { status: 403 });
  return serialized("room-creation", async () => {
    await flushInteractions();
    const id = randomUUID();
    const room: Room = {
      id, shortCode: "", ownerId: actor.id, createdAt: Date.now(), revision: 0, settings: { ...DEFAULT_SETTINGS },
      members: [{ id: actor.id, name: actor.name, kind: "human", ready: false }],
      chat: [], game: null, aiBudget: 0, aiUsed: 0, aiReservedUsd: 0,
      aiDaily: { day: "", usd: 0, calls: [] }, receipts: {}, seq: 0,
    };
    // All affected aliases update together, never silently resolve an ambiguous old prefix.
    const nextRooms = [...rooms.values()].map(r => structuredClone(r)).concat(room);
    const aliases = uniquePrefixes(nextRooms.map(r => r.id));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const next of nextRooms) {
        next.shortCode = aliases.find(a => a.id === next.id)!.shortCode;
        await client.query(`INSERT INTO cg_rooms(id,owner_id,prefix_length,state) VALUES($1,$2,$3,$4)
          ON CONFLICT(id) DO UPDATE SET prefix_length=$3,state=$4`,
        [next.id, next.ownerId, next.shortCode.length, JSON.stringify(next)]);
        await client.query("DELETE FROM cg_interaction_batches WHERE room_id=$1 AND end_seq <= $2", [next.id, next.seq]);
      }
      await client.query("COMMIT");
      for (const next of nextRooms) rooms.set(next.id, next);
      return room;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
}
export async function initializeStore() {
  // Deployment is constrained to one instance; no session-long DB connection.
  const data = await pool.query("SELECT state FROM cg_rooms");
  for (const row of data.rows) {
    const checkpoint = row.state as Room;
    const batches = await pool.query("SELECT room_id,game_id,end_seq,events FROM cg_interaction_batches WHERE room_id=$1 AND end_seq > $2 ORDER BY end_seq",
      [checkpoint.id, checkpoint.seq]);
    const room = rehydrateInteractions(checkpoint, batches.rows);
    // JSON settings predate typeArgs and the energy/scoring knobs; no database migration needed.
    room.settings = normalizedSettings(room.settings, true);
    if (room.game) room.game.settings = normalizedSettings(room.game.settings);
    // Legacy rooms did not record creation time; do not mislabel last-update time as creation.
    room.createdAt ??= null;
    room.aiReservedUsd ??= 0;
    room.aiDaily ??= { day: "", usd: 0, calls: [] };
    if (room.game) room.game.events ??= [];
    // Before migration: a game it ends now gets a real end time, not "unknown".
    if (room.game?.phase === "ended" && room.game.endedAt === undefined) room.game.endedAt = null;
    if (migrateLegacyUtilities(room)) await persist(room);
    if (room.game && room.game.phase !== "ended") {
      room.game.phase = "recovery";
      room.game.recoveryReason = "Server restarted. The game resumes when a player returns.";
      room.game.autoResume = true;
      room.seq++;
      await persist(room);
    }
    rooms.set(room.id, room);
  }
  await backfillHistory();
}

/**
 * COMPATIBILITY SHIM (plan §6.1): a game still running from before information scoring (its objects
 * carry [0, 1] `utilities`, its agents are free-form T → T functions) cannot continue under the
 * current rules: it is closed with endReason "retired". Ended games are left as they are, and their
 * stored summaries are never rewritten (persist keeps a legacy game's summary).
 */
function migrateLegacyUtilities(room: Room): boolean {
  const game = room.game;
  if (!game) return false;
  game.agents ??= [];
  legacyObjects(game);
  if (game.phase !== "ended" && (isLegacyGame(game) || game.deities.some(d => !d.utility))) {
    game.phase = "ended";
    game.endReason = "retired";
    game.endedAt = Date.now();
    game.executionEpoch = (game.executionEpoch ?? 0) + 1;
    delete game.autoResume;
    game.recoveryReason = "This game used retired scoring rules and was closed by a server upgrade.";
    room.seq++;
    return true;
  }
  return false;
}

/** Refresh existing room labels after a verified login, preserving stable subject IDs. */
export async function synchronizePlayerName(id: string, name: string) {
  for (const room of allRooms()) {
    if (!room.members.some(m => m.id === id) && !room.chat.some(m => m.authorId === id) &&
        !room.game?.roster.some(m => m.id === id)) continue;
    await mutate(room.id, async draft => {
      for (const member of draft.members) if (member.id === id) member.name = name;
      for (const member of draft.game?.roster ?? []) if (member.id === id) member.name = name;
      for (const message of draft.chat) if (message.authorId === id) message.authorName = name;
    });
  }
}
