import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { DEFAULT_SETTINGS, uniquePrefixes, resolveIdentifier } from "@workspace/game-core";
import type { Room, Actor } from "./types";
import { logger } from "../lib/logger";

const rooms = new Map<string, Room>();
const tails = new Map<string, Promise<unknown>>();
export const listeners = new Set<(room: Room, event: string, payload?: unknown) => void>();
export const allRooms = () => [...rooms.values()];
export function resolveRoom(id: string): Room {
  try { return rooms.get(resolveIdentifier(id, [...rooms.keys()]))!; }
  catch (error) { throw Object.assign(error as Error, { status: 404 }); }
}
export function member(room: Room, actor: Actor) {
  if (actor.scope === "player" && actor.roomId !== room.id) throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  if (!room.members.some(m => m.id === actor.id)) throw Object.assign(new Error("Join this room first"), { status: 403 });
}
export function owner(room: Room, actor: Actor) {
  member(room, actor);
  if (room.ownerId !== actor.id || actor.scope !== "browser") throw Object.assign(new Error("Room owner access required"), { status: 403 });
}
export async function persist(room: Room) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO cg_rooms(id,owner_id,prefix_length,state) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET state=$4,prefix_length=$3,updated_at=now()`,
    [room.id, room.ownerId, room.shortCode.length, JSON.stringify(room)]);
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
      await client.query(`INSERT INTO cg_games(id,room_id,prefix_length,state) VALUES($1,$2,$3,$4)
        ON CONFLICT(id) DO UPDATE SET state=$4,prefix_length=$3`,
      [room.game.id, room.id, room.game.shortCode.length, JSON.stringify(room.game)]);
      await client.query("UPDATE cg_rooms SET state=$2 WHERE id=$1", [room.id, JSON.stringify(room)]);
    }
    await client.query("COMMIT");
    for (const alias of changedAliases) {
      for (const live of rooms.values()) if (live.game?.id === alias.id) live.game.shortCode = alias.shortCode;
    }
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
export function serialized<T>(id: string, work: () => Promise<T>): Promise<T> {
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
    const original = resolveRoom(id);
    const draft = structuredClone(original);
    const result = await work(draft);
    draft.seq++;
    await persist(draft);
    rooms.set(draft.id, draft);
    for (const listener of listeners) listener(draft, event);
    return result;
  });
}
export async function createRoom(actor: Actor): Promise<Room> {
  if (actor.scope !== "browser") throw Object.assign(new Error("Browser login required"), { status: 403 });
  return serialized("room-creation", async () => {
    const id = randomUUID();
    const room: Room = {
      id, shortCode: "", ownerId: actor.id, createdAt: Date.now(), revision: 0, settings: { ...DEFAULT_SETTINGS },
      members: [{ id: actor.id, name: actor.name, kind: "human", ready: false }],
      chat: [], game: null, aiBudget: 0, aiUsed: 0, receipts: {}, seq: 0,
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
      }
      await client.query("COMMIT");
      for (const next of nextRooms) rooms.set(next.id, next);
      return room;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  });
}
export async function initializeStore() {
  const lock = await pool.connect();
  const result = await lock.query("SELECT pg_try_advisory_lock(773219150) AS locked");
  if (!result.rows[0].locked) { lock.release(); throw new Error("Another authoritative game server is already running"); }
  lock.on("error", () => { logger.fatal("Authority lock connection lost"); process.exit(1); });
  const data = await pool.query("SELECT state FROM cg_rooms");
  for (const row of data.rows) {
    const room = row.state as Room;
    // Legacy rooms did not record creation time; do not mislabel last-update time as creation.
    room.createdAt ??= null;
    if (room.game && room.game.phase !== "ended") {
      room.game.phase = "recovery";
      await persist(room);
    }
    rooms.set(room.id, room);
  }
}
