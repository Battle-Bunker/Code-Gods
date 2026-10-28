// test/client-daemon-integration.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID as randomUUID4 } from "node:crypto";
import { fork } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import WebSocket2 from "ws";

// src/routes/device.ts
import { Router } from "express";
import { randomUUID as randomUUID2, randomBytes as randomBytes2, createHash as createHash2 } from "node:crypto";

// fixture:db
var fixtureDevices = /* @__PURE__ */ new Map();
var fixtureSessions = /* @__PURE__ */ new Map();
var fixtureAgents = /* @__PURE__ */ new Map();
var fixtureStats = { sessionReads: 0 };
var rooms = /* @__PURE__ */ new Map();
var games = /* @__PURE__ */ new Map();
var sessions = fixtureSessions;
async function query(sql, a = []) {
  const rows = (value) => ({ rows: value });
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return rows([]);
  if (sql === "SELECT * FROM cg_ai_agents WHERE id=$1") return rows(fixtureAgents.has(a[0]) ? [fixtureAgents.get(a[0])] : []);
  if (sql === "SELECT id,name,provider,model FROM cg_ai_agents ORDER BY created_at,id")
    return rows([...fixtureAgents.values()].map(({ id, name, provider, model }) => ({ id, name, provider, model })));
  if (sql.startsWith("INSERT INTO cg_sessions")) {
    sessions.set(a[0], { data: JSON.parse(a[1]), expires: a[2] });
    return rows([]);
  }
  if (sql.startsWith("SELECT data,expires FROM cg_sessions WHERE hash")) {
    fixtureStats.sessionReads++;
    const s = sessions.get(a[0]);
    return rows(s && s.expires > Date.now() ? [s] : []);
  }
  if (sql.startsWith("SELECT data,expires FROM cg_sessions")) return rows([...sessions.values()].filter((s) => s.data.id === a[0] && s.data.scope === "player" && s.data.delegateId && s.expires > Date.now()));
  if (sql.startsWith("DELETE FROM cg_sessions")) {
    const deleted = [];
    for (const [key, s] of sessions) {
      const match = sql.includes("WHERE hash=") ? key === a[0] : s.data.delegateId === a[0] && (!sql.includes("AND data->>'id'") || s.data.id === a[1]);
      if (match) {
        sessions.delete(key);
        deleted.push({ hash: key, ...s });
      }
    }
    return rows(deleted);
  }
  if (sql.startsWith("INSERT INTO cg_devices")) {
    fixtureDevices.set(a[0], { id: a[0], code: a[1], secret_hash: a[2], challenge: a[3], room_id: a[4], expires: a[5], client_label: a[6], permission: a[7], status: "pending" });
    return rows([]);
  }
  if (sql.startsWith("SELECT * FROM cg_devices WHERE code")) return rows([...fixtureDevices.values()].filter((d) => d.code === a[0]));
  if (sql.startsWith("UPDATE cg_devices SET user_id")) {
    const updated = [];
    for (const d of fixtureDevices.values()) if (d.code === a[2] && d.status === "pending" && !d.user_id && d.expires > Date.now()) {
      Object.assign(d, { user_id: a[0], user_name: a[1], status: a[3] });
      updated.push({ id: d.id });
    }
    return rows(updated);
  }
  if (sql.startsWith("UPDATE cg_devices SET status='redeemed'") || sql.startsWith("SELECT status FROM cg_devices") || sql.startsWith("DELETE FROM cg_devices")) {
    const d = fixtureDevices.get(a[0]), valid = d && d.secret_hash === a[1] && d.challenge === a[2] && d.expires > Date.now();
    if (sql.startsWith("DELETE")) {
      if (d && d.secret_hash === a[1] && d.challenge === a[2]) {
        fixtureDevices.delete(a[0]);
        return rows([d]);
      }
      return rows([]);
    }
    if (sql.startsWith("UPDATE")) {
      if (valid && (d.status === "approved" || d.status === "pending" && d.user_id)) {
        d.status = "redeemed";
        return rows([d]);
      }
      return rows([]);
    }
    return rows(valid ? [{ status: d.status }] : []);
  }
  if (sql.startsWith("SELECT id")) return rows([...games.values()].map((g) => ({ id: g.id, prefix_length: g.shortCode.length })));
  if (sql.startsWith("INSERT INTO cg_rooms")) {
    rooms.set(a[0], JSON.parse(a[3]));
    return rows([]);
  }
  if (sql.startsWith("INSERT INTO cg_games")) {
    games.set(a[0], JSON.parse(a[3]));
    return rows([]);
  }
  if (sql === "UPDATE cg_rooms SET state=$2 WHERE id=$1") {
    rooms.set(a[0], JSON.parse(a[1]));
    return rows([]);
  }
  if (/^(INSERT INTO|DELETE FROM) cg_interaction_batches/.test(sql.trim())) return rows([]);
  throw new Error("Unexpected isolated fixture SQL");
}
var pool = { query, connect: async () => ({ query, release() {
} }) };

// src/lib/identity.ts
import { createHash, randomBytes } from "node:crypto";
import * as oidc from "openid-client";
var hash = (value) => createHash("sha256").update(value).digest("hex");
var opaque = () => randomBytes(32).toString("base64url");
async function issueSession(identity, ttlMs, db = pool) {
  const token = opaque();
  const expires = new Date(Date.now() + ttlMs);
  await db.query(
    "INSERT INTO cg_sessions(hash,data,expires) VALUES($1,$2,$3)",
    [hash(token), JSON.stringify({ ...identity, expiresAt: expires.toISOString() }), expires]
  );
  return token;
}
var invalidated = /* @__PURE__ */ new Map();
var sessionWatchers = /* @__PURE__ */ new Map();
function invalidateSession(sessionHash, expiresAt) {
  invalidated.set(sessionHash, expiresAt ? Date.parse(expiresAt) : Date.now() + 864e5);
  for (const callback of sessionWatchers.get(sessionHash) ?? []) callback();
  for (const [key, expiry] of invalidated) if (expiry <= Date.now()) invalidated.delete(key);
}
function assertSessionActive(actor) {
  if (actor.sessionHash && invalidated.has(actor.sessionHash) || actor.expiresAt && Date.parse(actor.expiresAt) <= Date.now())
    throw Object.assign(new Error("Session expired or revoked; reapproval required"), { status: 401 });
}
function requireAct(actor) {
  assertSessionActive(actor);
  if (actor.permission === "read") throw Object.assign(new Error("Read-only authorization cannot submit commands"), { status: 403 });
}
function watchSession(actor, close) {
  assertSessionActive(actor);
  const key = actor.sessionHash;
  const callbacks = sessionWatchers.get(key) ?? /* @__PURE__ */ new Set();
  callbacks.add(close);
  sessionWatchers.set(key, callbacks);
  const timer = actor.expiresAt ? setTimeout(close, Math.max(0, Date.parse(actor.expiresAt) - Date.now())).unref() : void 0;
  return () => {
    if (timer) clearTimeout(timer);
    callbacks.delete(close);
    if (!callbacks.size) sessionWatchers.delete(key);
  };
}
async function lookupSession(token) {
  const sessionHash = hash(token);
  const result = await pool.query("SELECT data,expires FROM cg_sessions WHERE hash=$1 AND expires > now()", [sessionHash]);
  const row = result.rows[0];
  if (!row || invalidated.has(sessionHash)) return void 0;
  return { ...row.data, sessionHash, expiresAt: row.expires ? new Date(row.expires).toISOString() : row.data.expiresAt };
}
async function authenticate(req, _res, next) {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : req.cookies?.cg_session;
    if (typeof token === "string" && token.length < 256) req.identity = await lookupSession(token);
    next();
  } catch (error) {
    next(error);
  }
}
function requireIdentity(req) {
  if (!req.identity) throw Object.assign(new Error("Please log in"), { status: 401 });
  assertSessionActive(req.identity);
  return req.identity;
}

// src/game/store.ts
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, defaultSettingsFor, uniquePrefixes, resolveIdentifier, encodeUuid, validateSettings } from "@workspace/game-core";

// src/game/projection.ts
import { instantiationOf, leaderboard, personalView, salience } from "@workspace/game-core";
import { instanceInfo } from "@workspace/game-types";
import { card, context, publicCatalog } from "@workspace/game-utilities";

// src/game/economy.ts
import { agentBattery, isEligible, settleAgentEnergy } from "@workspace/game-core";
function worldNow(game, nowMs = Date.now()) {
  const running = game.phase === "running" ? Math.max(0, nowMs - game.lastTick) / 1e3 : 0;
  return Math.min(game.endAtWorld, game.worldSeconds + running);
}
function settledAccount(settings, agent, world) {
  if (!(world > agent.account.settledWorldSeconds)) return agent.account;
  return settleAgentEnergy(
    agent.account,
    world,
    settings.agentEnergyPerSecond,
    agentBattery(agent.expectedActCost, settings.agentBatteryActs)
  );
}
function agentStatus(game, agent, nowMs = Date.now()) {
  const account = settledAccount(game.settings, agent, worldNow(game, nowMs));
  return { energy: account.balance, eligible: isEligible(account, agent.expectedActCost) };
}
function godEnergy(game, deity, nowMs = Date.now()) {
  return game.settings.startingEnergy + Math.max(0, nowMs - game.createdAt) / 1e3 * game.settings.energyPerSecond - deity.spent;
}

// src/game/projection.ts
var SCORING = "information-v1";
var netMap = (o) => new Map(Object.entries(o.scores).map(([id, s]) => [id, s.netBits]));
function standings(game) {
  const member2 = (id) => game.roster.find((m) => m.id === id);
  return leaderboard(game.roster.map((m) => m.id), game.objects.map(netMap)).map((row) => ({ deityId: row.godId, name: member2(row.godId).name, kind: member2(row.godId).kind, totalPayoff: row.totalPayoff, rank: row.rank }));
}
function utilityCard(game, id) {
  const deity = game.deities.find((d) => d.id === id);
  if (!deity) return null;
  const language = game.settings.language;
  const c = card(deity.utility, context(instantiationOf(game.settings)));
  return {
    familyId: c.familyId,
    emoji: c.emoji,
    name: c.name,
    theme: c.theme,
    summary: c.summary,
    shape: c.shape,
    language,
    source: c.source[language],
    ...c.penalty ? { penalty: {
      familyId: c.penalty.familyId,
      emoji: c.penalty.emoji,
      name: c.penalty.name,
      summary: c.penalty.summary,
      comparative: c.penalty.comparative,
      shape: c.penalty.shape,
      source: c.penalty.source[language]
    } } : {}
  };
}
function personalObject(game, o, id) {
  const own = o.scores?.[id];
  if (!own) return null;
  const view = personalView(netMap(o), id);
  return {
    id: o.id,
    value: o.value,
    version: o.version,
    own: { ordinal: own.ordinal, rewardBits: own.rewardBits, ...own.penaltyBits !== void 0 ? { penaltyBits: own.penaltyBits } : {}, netBits: own.netBits },
    peerNetBits: view.peerNetBits,
    peerCare: view.peerCare,
    payoff: view.payoff
  };
}
function agentView(game, agent, nowMs = Date.now()) {
  const status = agentStatus(game, agent, nowMs);
  return {
    id: agent.id,
    source: agent.source,
    createdAt: agent.createdAt,
    summonCost: agent.summonCost,
    decisionBits: agent.decisionBits,
    expectedActCost: agent.expectedActCost,
    breakdown: agent.breakdown,
    randomized: agent.randomized,
    energy: status.energy,
    eligible: status.eligible,
    acts: agent.acts,
    spent: agent.spent
  };
}
function objectInstance(settings) {
  return instanceInfo(instantiationOf(settings));
}
function catalogFor(settings) {
  return publicCatalog(instantiationOf(settings)).map((f) => ({ ...f, excluded: settings.excludedFamilies.includes(f.id) }));
}
var rosterEntry = ({ id, name, kind }) => ({ id, name, kind });
var isActive = (game) => !!game && game.phase !== "ended";
function gameRecord(roomId, game) {
  const leaderboard2 = standings(game);
  return {
    id: game.id,
    shortCode: game.shortCode,
    roomId,
    startedAt: game.createdAt,
    endedAt: game.endedAt ?? null,
    endReason: game.endReason ?? null,
    settings: game.settings,
    roster: game.roster.map(rosterEntry),
    leaderboard: leaderboard2,
    winners: leaderboard2.filter((row) => row.rank === 1).map(({ deityId, name, kind }) => ({ deityId, name, kind })),
    worldSeconds: game.worldSeconds,
    objectCount: game.objects.length,
    agentCount: game.agents.length,
    scoring: SCORING,
    seasonCommitment: game.seasonCommitment
  };
}
function activeGameRef(room) {
  const game = room.game;
  return !isActive(game) ? null : {
    id: game.id,
    shortCode: game.shortCode,
    phase: game.phase,
    startedAt: game.createdAt,
    roster: game.roster.map(rosterEntry)
  };
}
function publicRoom(room) {
  return {
    id: room.id,
    shortCode: room.shortCode,
    ownerId: room.ownerId,
    ownerName: room.members.find((m) => m.id === room.ownerId)?.name ?? room.ownerId,
    createdAt: room.createdAt,
    revision: room.revision,
    settings: room.settings,
    members: room.members.map(({ aiAgent, ...member2 }) => ({
      ...member2,
      ...aiAgent ? { aiAgentId: aiAgent.id, aiAgentRevision: aiAgent.revision, provider: aiAgent.provider, model: aiAgent.model } : {}
    })),
    chat: room.chat.slice(-100),
    aiBudget: room.aiBudget,
    aiUsed: room.aiUsed,
    serverTime: Date.now(),
    aiInputTokens: room.aiInputTokens ?? 0,
    aiOutputTokens: room.aiOutputTokens ?? 0,
    // The lobby describes the NEXT game: its object type, and the families its gods might draw, never who drew which.
    objectInstance: objectInstance(room.settings),
    utilityCatalog: catalogFor(room.settings),
    activeGame: activeGameRef(room)
  };
}

// src/game/store.ts
var rooms2 = /* @__PURE__ */ new Map();
var tails = /* @__PURE__ */ new Map();
var closing = false;
var interactionBuffers = /* @__PURE__ */ new Map();
var bufferedInteractions = 0;
var flushTimer;
var flushFailure;
var MAX_BUFFERED_INTERACTIONS = 256;
var MAX_ROOM_INTERACTIONS = 64;
function interactionCapacity(roomId) {
  return !closing && !flushFailure && bufferedInteractions < MAX_BUFFERED_INTERACTIONS && (interactionBuffers.get(roomId)?.events.length ?? 0) < MAX_ROOM_INTERACTIONS;
}
function scheduleInteractionFlush(delay = 100) {
  if (delay === 0 && flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = void 0;
  }
  if (flushTimer || closing) return;
  flushTimer = setTimeout(() => {
    flushTimer = void 0;
    void serialized("interaction-flush", flushInteractions).catch((error) => {
      flushFailure = error;
      console.error("Interaction persistence failed; admission suspended until retry succeeds", error);
      scheduleInteractionFlush();
    });
  }, delay).unref();
}
async function flushInteractions() {
  for (const [id, buffer] of interactionBuffers) {
    try {
      await pool.query(
        `INSERT INTO cg_interaction_batches(room_id,game_id,end_seq,events) VALUES($1,$2,$3,$4)
        ON CONFLICT(room_id,end_seq) DO NOTHING`,
        [id, buffer.latest.game.id, buffer.latest.seq, JSON.stringify(buffer.events)]
      );
    } catch (error) {
      flushFailure = error;
      throw error;
    }
    interactionBuffers.delete(id);
    bufferedInteractions -= buffer.events.length;
    for (const listener of listeners) {
      try {
        listener(buffer.latest, "room.snapshot");
      } catch (error) {
        console.error("Committed interaction notification failed", error);
      }
    }
  }
  flushFailure = void 0;
}
function mutateInteraction(id, objectId, work, agentId) {
  return serialized(id, async () => {
    if (!interactionCapacity(id)) return;
    const original = resolveRoom(id);
    if (!original.game) return;
    const targetIndex = original.game.objects.findIndex((object) => object.id === objectId);
    if (targetIndex < 0) return;
    const objects = original.game.objects.slice();
    objects[targetIndex] = { ...objects[targetIndex] };
    const draft = { ...original, game: {
      ...original.game,
      objects,
      agents: original.game.agents.slice(),
      events: original.game.events.slice()
    } };
    if (!work(draft)) return;
    const added = draft.game.events.at(-1);
    if (!added || added.id === original.game.events.at(-1)?.id || added.type === "object.spawned" || added.type === "object.transformed" && !draft.game.objects.some((object) => object.id === added.object.id) || agentId !== void 0 && added.agent?.id !== agentId) throw new Error("Invalid interaction mutation");
    draft.seq++;
    const buffer = interactionBuffers.get(id) ?? { latest: draft, events: [] };
    buffer.latest = draft;
    buffer.events.push(added);
    interactionBuffers.set(id, buffer);
    bufferedInteractions++;
    rooms2.set(id, draft);
    scheduleInteractionFlush(buffer.events.length >= 32 || bufferedInteractions >= 128 ? 0 : 100);
  });
}
var listeners = /* @__PURE__ */ new Set();
var allRooms = () => [...rooms2.values()];
function resolveRoom(id) {
  try {
    return rooms2.get(resolveIdentifier(id, [...rooms2.keys()]));
  } catch (error) {
    throw Object.assign(error, { status: 404 });
  }
}
function member(room, actor) {
  assertSessionActive(actor);
  if (actor.scope === "player" && actor.roomId !== room.id) throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  if (!room.members.some((m) => m.id === actor.id)) throw Object.assign(new Error("Join this room first"), { status: 403 });
}
function owner(room, actor) {
  member(room, actor);
  if (room.ownerId !== actor.id || actor.scope !== "browser" && actor.permission !== "owner")
    throw Object.assign(new Error("Room owner access required"), { status: 403 });
}
async function persist(room) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const changedAliases = [];
    if (room.game) {
      const existing = await client.query("SELECT id,prefix_length FROM cg_games");
      const ids = existing.rows.map((row) => row.id);
      if (!ids.includes(room.game.id)) ids.push(room.game.id);
      for (const alias of uniquePrefixes(ids)) {
        if (alias.id === room.game.id) room.game.shortCode = alias.shortCode;
        const prior = existing.rows.find((row) => row.id === alias.id);
        if (prior && prior.prefix_length !== alias.prefixLength) {
          changedAliases.push(alias);
          await client.query(
            `UPDATE cg_games SET prefix_length=$2,state=jsonb_set(state,'{shortCode}',to_jsonb($3::text)) WHERE id=$1`,
            [alias.id, alias.prefixLength, alias.shortCode]
          );
          await client.query(
            `UPDATE cg_rooms SET state=jsonb_set(state,'{game,shortCode}',to_jsonb($2::text)) WHERE state->'game'->>'id'=$1`,
            [alias.id, alias.shortCode]
          );
        }
      }
      const ended = room.game.phase === "ended";
      await client.query(
        `INSERT INTO cg_games(id,room_id,prefix_length,state,started_at,ended_at,summary)
        VALUES($1,$2,$3,$4,to_timestamp($5::double precision/1000),to_timestamp($6::double precision/1000),$7)
        ON CONFLICT(id) DO UPDATE SET state=$4,prefix_length=$3,started_at=EXCLUDED.started_at,ended_at=EXCLUDED.ended_at,summary=EXCLUDED.summary`,
        [
          room.game.id,
          room.id,
          room.game.shortCode.length,
          JSON.stringify(room.game),
          room.game.createdAt,
          room.game.endedAt ?? null,
          ended ? summarize(room.id, room.game) : null
        ]
      );
    }
    await client.query(
      `INSERT INTO cg_rooms(id,owner_id,prefix_length,state) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET state=$4,prefix_length=$3,updated_at=now()`,
      [room.id, room.ownerId, room.shortCode.length, JSON.stringify(room)]
    );
    await client.query("DELETE FROM cg_interaction_batches WHERE room_id=$1 AND end_seq <= $2", [room.id, room.seq]);
    await client.query("COMMIT");
    for (const alias of changedAliases) {
      for (const live of rooms2.values()) if (live.game?.id === alias.id) live.game.shortCode = alias.shortCode;
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
function serialized(id, work) {
  if (closing) return Promise.reject(Object.assign(new Error("Server shutting down"), { status: 503 }));
  id = "authority";
  const prior = tails.get(id) ?? Promise.resolve();
  const next = prior.catch(() => {
  }).then(work);
  tails.set(id, next);
  void next.finally(() => {
    if (tails.get(id) === next) tails.delete(id);
  }).catch(() => {
  });
  return next;
}
async function mutate(id, work, event = "room.snapshot") {
  return serialized(id, async () => {
    await flushInteractions();
    const original = resolveRoom(id);
    const draft = structuredClone(original);
    const result = await work(draft);
    settleGameEnd(draft);
    draft.seq++;
    await persist(draft);
    rooms2.set(draft.id, draft);
    for (const listener of listeners) listener(draft, event);
    return result;
  });
}
function summarize(roomId, game) {
  return JSON.stringify(gameRecord(roomId, game));
}
function settleGameEnd(room) {
  const game = room.game;
  if (game?.phase !== "ended" || game.endedAt !== void 0) return;
  game.endedAt = Date.now();
  game.endReason ??= "lifetime";
}
async function createRoom(actor) {
  if (actor.scope !== "browser") throw Object.assign(new Error("Browser login required"), { status: 403 });
  return serialized("room-creation", async () => {
    await flushInteractions();
    const id = randomUUID();
    const room = {
      id,
      shortCode: "",
      ownerId: actor.id,
      createdAt: Date.now(),
      revision: 0,
      settings: defaultSettingsFor(DEFAULT_SETTINGS.objectType),
      members: [{ id: actor.id, name: actor.name, kind: "human", ready: false }],
      chat: [],
      game: null,
      aiBudget: 0,
      aiUsed: 0,
      aiReservedUsd: 0,
      aiDaily: { day: "", usd: 0, calls: [] },
      receipts: {},
      seq: 0
    };
    const nextRooms = [...rooms2.values()].map((r) => structuredClone(r)).concat(room);
    const aliases = uniquePrefixes(nextRooms.map((r) => r.id));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const next of nextRooms) {
        next.shortCode = aliases.find((a) => a.id === next.id).shortCode;
        await client.query(
          `INSERT INTO cg_rooms(id,owner_id,prefix_length,state) VALUES($1,$2,$3,$4)
          ON CONFLICT(id) DO UPDATE SET prefix_length=$3,state=$4`,
          [next.id, next.ownerId, next.shortCode.length, JSON.stringify(next)]
        );
        await client.query("DELETE FROM cg_interaction_batches WHERE room_id=$1 AND end_seq <= $2", [next.id, next.seq]);
      }
      await client.query("COMMIT");
      for (const next of nextRooms) rooms2.set(next.id, next);
      return room;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

// src/routes/device.ts
var router = Router();
var fail = (message, status = 400) => Object.assign(new Error(message), { status });
var codeOf = (value) => String(value ?? "").toUpperCase().replaceAll("-", "");
function browser(req) {
  const actor = requireIdentity(req);
  if (actor.scope !== "browser") throw fail("Human browser approval required", 403);
  return actor;
}
function proof(body = {}) {
  const { deviceId, deviceSecret, verifier } = body;
  if (![deviceId, deviceSecret, verifier].every((v) => typeof v === "string" && v.length > 0 && v.length <= 256))
    throw fail("Invalid device request");
  return [deviceId, hash(deviceSecret), createHash2("sha256").update(verifier).digest("base64url")];
}
async function invalidateRows(rows) {
  for (const row of rows) invalidateSession(row.hash, row.data.expiresAt);
}
var attempts = /* @__PURE__ */ new Map();
router.use("/device", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const key = req.ip ?? "unknown", now = Date.now();
  let record = attempts.get(key);
  if (!record || now - record.since > 6e4) {
    record = { count: 0, since: now };
    attempts.set(key, record);
  }
  if (++record.count > 60) {
    res.status(429).json({ error: "Too many device requests" });
    return;
  }
  if (attempts.size > 1e4) {
    for (const [key2, entry] of attempts) if (now - entry.since > 6e4) attempts.delete(key2);
  }
  next();
});
router.post("/device/request", async (req, res) => {
  if (typeof req.body?.roomId !== "string" || typeof req.body?.challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(req.body.challenge))
    throw fail("roomId and S256 challenge required");
  const permission = req.body.permission ?? "act";
  const clientLabel = req.body.clientLabel ?? "Room assistant";
  if (!["read", "act", "owner"].includes(permission)) throw fail("permission must be read, act or owner");
  if (typeof clientLabel !== "string" || !clientLabel.trim() || clientLabel.length > 120 || /[\u0000-\u001f\u007f]/.test(clientLabel))
    throw fail("clientLabel must be 1\u2013120 printable characters (self-reported)");
  const room = resolveRoom(req.body.roomId), id = randomUUID2(), secret = opaque();
  const code = randomBytes2(5).toString("hex").toUpperCase();
  await pool.query(
    `INSERT INTO cg_devices(id,code,secret_hash,challenge,room_id,expires,client_label,permission)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, code, hash(secret), req.body.challenge, room.id, new Date(Date.now() + 3e5), clientLabel.trim(), permission]
  );
  res.json({
    deviceId: id,
    delegateId: id,
    deviceSecret: secret,
    roomId: room.id,
    userCode: code,
    verificationPath: `/device?code=${code}`,
    expiresIn: 300,
    interval: 2,
    permission
  });
});
router.get("/device/details", async (req, res) => {
  const actor = browser(req);
  const result = await pool.query("SELECT * FROM cg_devices WHERE code=$1", [codeOf(req.query.code)]);
  const row = result.rows[0];
  if (!row) throw fail("Invalid approval code", 404);
  const room = resolveRoom(row.room_id);
  member(room, actor);
  if (row.user_id && row.user_id !== actor.id) throw fail("Approval belongs to another user", 403);
  res.json({
    roomId: room.id,
    roomCode: room.shortCode,
    clientLabel: row.client_label,
    permission: row.permission,
    expiresAt: new Date(row.expires).toISOString(),
    canApprove: row.status === "pending" && !row.user_id && new Date(row.expires).getTime() > Date.now() && (row.permission !== "owner" || room.ownerId === actor.id),
    status: new Date(row.expires).getTime() <= Date.now() ? "expired" : row.status === "pending" && row.user_id ? "approved" : row.status
  });
});
for (const decision of ["approve", "deny"]) router.post(`/device/${decision}`, async (req, res) => {
  const actor = browser(req), code = codeOf(req.body?.code);
  const found = await pool.query("SELECT * FROM cg_devices WHERE code=$1", [code]);
  const row = found.rows[0];
  if (!row || row.status !== "pending" || row.user_id || new Date(row.expires).getTime() <= Date.now()) throw fail("Invalid or expired approval code");
  const room = resolveRoom(row.room_id);
  if (row.permission === "owner") owner(room, actor);
  else member(room, actor);
  const status = decision === "approve" ? "approved" : "denied";
  const updated = await pool.query(`UPDATE cg_devices SET user_id=$1,user_name=$2,status=$4
    WHERE code=$3 AND status='pending' AND user_id IS NULL AND expires>now() RETURNING id`, [actor.id, actor.name, code, status]);
  if (!updated.rows.length) throw fail("Approval already decided", 409);
  res.json({ status });
});
router.post("/device/poll", async (req, res) => {
  const args = proof(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`UPDATE cg_devices SET status='redeemed' WHERE id=$1 AND secret_hash=$2 AND challenge=$3
      AND (status='approved' OR (status='pending' AND user_id IS NOT NULL)) AND expires>now() RETURNING *`, args);
    const row = result.rows[0];
    if (!row) {
      const pending = await client.query(`SELECT status FROM cg_devices WHERE id=$1 AND secret_hash=$2 AND challenge=$3 AND expires>now()`, args);
      await client.query("COMMIT");
      const status = pending.rows[0]?.status === "pending" ? "pending" : pending.rows[0]?.status === "denied" ? "denied" : "expired";
      res.status(status === "pending" ? 202 : 400).json({ status });
      return;
    }
    const identity = {
      id: row.user_id,
      name: row.user_name,
      kind: "human",
      scope: "player",
      roomId: row.room_id,
      delegateId: row.id,
      clientLabel: row.client_label,
      permission: row.permission
    };
    if (row.permission === "owner") owner(resolveRoom(row.room_id), identity);
    const token = await issueSession(identity, 9e5, client);
    await client.query("COMMIT");
    res.json({ token, expiresIn: 900, roomId: row.room_id, godId: row.user_id, delegateId: row.id, permission: row.permission });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
router.post("/device/cancel", async (req, res) => {
  const args = proof(req.body);
  const result = await pool.query("DELETE FROM cg_devices WHERE id=$1 AND secret_hash=$2 AND challenge=$3 RETURNING id", args);
  if (!result.rows.length) throw fail("Invalid or already cancelled device request");
  const deleted = await pool.query("DELETE FROM cg_sessions WHERE data->>'delegateId'=$1 RETURNING hash,data", [args[0]]);
  await invalidateRows(deleted.rows);
  res.json({ status: "cancelled" });
});
router.get("/device/grants", async (req, res) => {
  const actor = browser(req);
  const result = await pool.query(`SELECT data,expires FROM cg_sessions
    WHERE data->>'id'=$1 AND data->>'scope'='player' AND data->>'delegateId' IS NOT NULL AND expires>now()`, [actor.id]);
  res.json({ grants: result.rows.map(({ data, expires }) => ({
    delegateId: data.delegateId,
    roomId: data.roomId,
    clientLabel: data.clientLabel,
    permission: data.permission,
    expiresAt: new Date(expires).toISOString()
  })) });
});
router.post("/device/grants/:delegateId/revoke", async (req, res) => {
  const actor = browser(req);
  const result = await pool.query(`DELETE FROM cg_sessions WHERE data->>'delegateId'=$1 AND data->>'id'=$2
    AND data->>'scope'='player' RETURNING hash,data`, [String(req.params.delegateId), actor.id]);
  if (!result.rows.length) throw fail("Grant not found", 404);
  await invalidateRows(result.rows);
  res.json({ status: "revoked" });
});
router.post("/device/revoke", async (req, res) => {
  const actor = requireIdentity(req);
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : void 0;
  if (!token || actor.scope !== "player") throw fail("Player bearer required", 403);
  await pool.query("DELETE FROM cg_sessions WHERE hash=$1", [hash(token)]);
  invalidateSession(hash(token), actor.expiresAt);
  res.json({ status: "revoked" });
});
var device_default = router;

// src/routes/player.ts
import { Router as Router2 } from "express";

// src/game/player-api.ts
import { GAME_COMMANDS, VERSION, envelopeSchema, observationSchema } from "@workspace/player-client";

// src/game/engine.ts
import { randomBytes as randomBytes5, randomUUID as randomUUID3 } from "node:crypto";
import {
  chargeAct,
  instantiationOf as instantiationOf4,
  lifetimeSeconds,
  newAgentAccount,
  poissonIntervalSeconds,
  uniquePrefixes as uniquePrefixes2,
  validateSettings as validateSettings3
} from "@workspace/game-core";
import { actCharge, applyCalls, deriveSeed, objectType as objectType2 } from "@workspace/game-types";

// src/game/adapters.ts
import { codecOf, instantiationOf as instantiationOf2, netBits, softHinge, validateSettings as validateSettings2 } from "@workspace/game-core";
import { RuntimeError } from "@workspace/game-runtime";
import { objectType, seededRng } from "@workspace/game-types";
import { divineLottery, evaluator, selector } from "@workspace/game-utilities";
import { randomBytes as randomBytes3 } from "node:crypto";

// src/game/calibration.ts
import { UNIFORM_PRIOR } from "@workspace/game-utilities";
import { tableFor, hasTable, surprisal, penaltyMeanBits, offeredInstantiations } from "@workspace/game-utilities";
var PRIORS = Object.freeze({ [UNIFORM_PRIOR.id]: UNIFORM_PRIOR });
function priorOf(priorId) {
  const prior = PRIORS[priorId];
  if (!prior) throw Object.assign(new Error(`Unknown prior ${priorId}: choose one of ${Object.keys(PRIORS).join(", ")}`), { status: 400 });
  return prior;
}

// src/game/adapters.ts
var runtime;
var utilities;
function registerAdapters(next) {
  runtime = next.runtime;
  utilities = next.utilities;
}
function unregisterAdapters() {
  runtime = void 0;
  utilities = void 0;
}
var AGENT_FAULTS = /* @__PURE__ */ new Set(["COMPILE", "DOMAIN", "EXECUTION", "LIMIT"]);
var isAgentFault = (error) => !!error && typeof error === "object" && AGENT_FAULTS.has(String(error.code));
var cryptoRng = {
  big(bound) {
    if (bound <= 0n) throw new Error("Random bound must be positive");
    const bytes = Math.ceil(bound.toString(2).length / 8);
    const range = 1n << BigInt(bytes * 8), limit = range - range % bound;
    for (; ; ) {
      const n = BigInt(`0x${randomBytes3(bytes).toString("hex")}`);
      if (n < limit) return n % bound;
    }
  },
  int(bound) {
    if (!Number.isSafeInteger(bound) || bound <= 0) throw new Error("Random bound must be a positive safe integer");
    return Number(cryptoRng.big(BigInt(bound)));
  }
};
var actSettingsCache = /* @__PURE__ */ new Map();
function actSettings(settings) {
  const inst = instantiationOf2(settings);
  const cacheKey = `${inst.key}\0${settings.interactionComputeMs}\0${settings.stepBudget}`;
  let cached = actSettingsCache.get(cacheKey);
  if (!cached) {
    const parts = objectType(inst.objectType).prelude(inst);
    cached = Object.freeze({
      objectType: inst.objectType,
      wireMaxLength: codecOf(settings).maxLength,
      interactionComputeMs: settings.interactionComputeMs,
      stepBudget: settings.stepBudget,
      prelude: {
        key: parts.hash,
        python: parts.python,
        js: parts.js,
        dts: parts.dts,
        pricing: parts.pricing
      }
    });
    if (actSettingsCache.size >= 64) actSettingsCache.delete(actSettingsCache.keys().next().value);
    actSettingsCache.set(cacheKey, cached);
  }
  return cached;
}
function probeValue(settings) {
  const inst = instantiationOf2(settings), T = objectType(inst.objectType);
  return T.codec(inst).encode(T.spawn(inst, seededRng(`code-gods:probe:${inst.key}`)));
}
function createRuntimeAdapter(pools2) {
  let active = 0;
  const waiting = [];
  async function admitted(run) {
    if (active < 4) active++;
    else {
      if (waiting.length >= 64) throw new RuntimeError("CAPACITY", "Runtime capacity exhausted; retry later");
      await new Promise((resolve, reject) => {
        const resume = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          const index = waiting.indexOf(resume);
          if (index >= 0) waiting.splice(index, 1);
          reject(new RuntimeError("CAPACITY", "Queue wait expired"));
        }, 34e3);
        waiting.push(resume);
      });
    }
    try {
      return await run();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }
  function pool2(settings) {
    validateSettings2(settings);
    const selected = pools2[settings.language];
    if (!selected) throw new RuntimeError("UNAVAILABLE", `Isolated ${settings.language} runtime is unavailable`);
    return selected;
  }
  async function guarded(run) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof RuntimeError && error.code === "CONFIG") {
        console.error("Runtime configuration error (server bug)", error.message);
        throw Object.assign(new Error("The game runtime is misconfigured"), { status: 500, code: "RUNTIME_CONFIG" });
      }
      throw error;
    }
  }
  return {
    languages: Object.keys(pools2),
    async inspect(source, settings) {
      const selected = pool2(settings);
      return guarded(() => admitted(() => selected.inspect(source, actSettings(settings))));
    },
    async act(source, input, settings, seed) {
      const selected = pool2(settings);
      return guarded(() => admitted(() => selected.act(source, input, actSettings(settings), seed.toString())));
    }
  };
}
var bits = (x) => x === 0 ? 0 : x;
function createUtilitiesAdapter() {
  const table = (draw, settings) => {
    const found = tableFor(draw, instantiationOf2(settings), priorOf(settings.priorId));
    if (!found) throw new Error(`No calibration table for ${draw.familyId} in ${instantiationOf2(settings).key}`);
    return found;
  };
  return {
    deal(settings, count) {
      validateSettings2(settings);
      const inst = instantiationOf2(settings);
      return selector(settings.utilitySelectorId ?? divineLottery.id).select(inst, count, cryptoRng, {
        defenceRate: settings.defenceRate,
        hasTable: (draw) => hasTable(draw, inst, priorOf(settings.priorId)),
        exclude: settings.excludedFamilies,
        priorId: settings.priorId
      });
    },
    score(settings, descriptor, value) {
      const inst = instantiationOf2(settings);
      const ordinal = evaluator(descriptor, inst)(value);
      const rewardBits = bits(surprisal(table(descriptor, settings), ordinal));
      if (!descriptor.penalty) return { ordinal, rewardBits, netBits: bits(netBits({ rewardBits }, settings.penaltyWeight)) };
      const penaltyTable = table(descriptor.penalty, settings);
      const penaltyOrdinal = evaluator(descriptor.penalty, inst)(value);
      const penaltyBits = bits(softHinge(surprisal(penaltyTable, penaltyOrdinal)));
      return {
        ordinal,
        rewardBits,
        penaltyOrdinal,
        penaltyBits,
        netBits: bits(netBits({ rewardBits, penaltyBits, penaltyMeanBits: penaltyMeanBits(penaltyTable) }, settings.penaltyWeight))
      };
    }
  };
}
function requireAdapters() {
  if (!runtime || !utilities) throw Object.assign(
    new Error("Game execution is unavailable until the isolated runtime has started"),
    { status: 503, code: "RUNNER_UNAVAILABLE" }
  );
  return { runtime, utilities };
}

// src/game/pricing.ts
import { instantiationOf as instantiationOf3 } from "@workspace/game-core";
import { MOVE_FLAG_BITS } from "@workspace/game-runtime";
import {
  availableMutators,
  measureAgent,
  referenceMixture,
  withComponents
} from "@workspace/game-types";

// src/game/season.ts
import { createHash as createHash3, randomBytes as randomBytes4 } from "node:crypto";
var salt;
var commitment;
function load() {
  if (salt !== void 0) return salt;
  const configured = process.env.CODE_GODS_SEASON_SALT;
  if (configured && configured.length >= 16) salt = configured;
  else if (process.env.NODE_ENV === "production") {
    throw new Error("CODE_GODS_SEASON_SALT must be set (at least 16 characters) in production");
  } else {
    salt = randomBytes4(32).toString("hex");
    console.warn("CODE_GODS_SEASON_SALT is not set: using a random per-process season salt (development and tests only)");
  }
  commitment = createHash3("sha256").update(salt, "utf8").digest("hex");
  return salt;
}
function seasonSalt() {
  return load();
}
function seasonCommitment() {
  load();
  return commitment;
}

// src/game/pricing.ts
var GAME_COMPONENT = 16;
var CONCURRENCY = 4;
var lg = (x) => x > 1 ? Math.log2(x) : 0;
function summonPrice(inspection, inst) {
  const avail = availableMutators(inst), byId = new Map(avail.map((m) => [m.id, m]));
  let literalMoves = 0;
  inspection.literalMoves.forEach(([id, raw], i) => {
    const m = byId.get(id);
    let bits2 = inspection.literalMoveFallbackBits[i];
    if (m) {
      try {
        bits2 = MOVE_FLAG_BITS + lg(avail.length) + m.describeBits(m.parse(raw, inst), inst);
      } catch {
      }
    }
    literalMoves += bits2;
  });
  return { cost: inspection.cost + literalMoves, parts: { ...inspection.parts, literalMoves } };
}
var mixtures = /* @__PURE__ */ new Map();
function seasonMixture(inst) {
  const key = `${inst.key}\0${seasonCommitment()}`;
  let mix = mixtures.get(key);
  if (!mix) {
    mix = referenceMixture(inst, seasonSalt());
    if (mixtures.size >= 32) mixtures.delete(mixtures.keys().next().value);
    mixtures.set(key, mix);
  }
  return mix;
}
async function examineAgent(settings, source, live) {
  const { runtime: runtime2 } = requireAdapters();
  const inst = instantiationOf3(settings);
  let inspection;
  try {
    inspection = await runtime2.inspect(source, settings);
  } catch (error) {
    if (!isAgentFault(error)) throw error;
    throw Object.assign(new Error(error.message.slice(0, 1e3)), { agentFault: true });
  }
  const price = summonPrice(inspection, inst);
  const game = live.slice(0, GAME_COMPONENT);
  const mixture = game.length ? withComponents(seasonMixture(inst), { game }) : seasonMixture(inst);
  let hostFailure, runs = 0;
  const sample = { value: void 0, calls: void 0, error: void 0 };
  const started = performance.now();
  const measured = await measureAgent(async (value, seed, at) => {
    runs++;
    try {
      const result = await runtime2.act(source, value, settings, seed);
      if (at.component === "game" && at.replicate === 0 && sample.value === void 0) Object.assign(sample, { value, calls: result.calls });
      return { calls: result.calls, usedRandom: result.usedRandom, steps: result.steps };
    } catch (error) {
      if (!isAgentFault(error)) {
        hostFailure ??= error;
        throw error;
      }
      if (at.component === "game" && at.replicate === 0 && sample.value === void 0) Object.assign(sample, { value, error: error.message });
      return { calls: "[]", error: error.message.slice(0, 200) };
    }
  }, inst, mixture, { salt: seasonSalt(), perActFloorBits: settings.perActFloorBits, concurrency: CONCURRENCY, byComponent: false });
  if (hostFailure) throw hostFailure;
  const measureMs = performance.now() - started;
  const breakdown = {
    decision: measured.decisionBits,
    erasure: measured.expectedErasure,
    motion: measured.expectedMotion,
    floor: measured.perActFloorBits
  };
  const d = measured.diagnostics;
  const diagnostics = [
    `Summon price ${price.cost.toFixed(1)} bits (${inspection.complexityFunctionId}: structure ${inspection.parts.structure.toFixed(1)}, names ${inspection.parts.names.toFixed(1)}, literals ${inspection.parts.literals.toFixed(1)}, literal moves ${price.parts.literalMoves.toFixed(1)}).`,
    `Each act: ${measured.expectedActCost.toFixed(2)} bits expected = decision ${measured.decisionBits.toFixed(2)} + erasure ${measured.expectedErasure.toFixed(2)} + motion ${measured.expectedMotion.toFixed(2)}${measured.perActFloorBits ? ` + floor ${measured.perActFloorBits}` : ""}.`,
    `Measured on ${d.n} reference objects${measured.randomized ? ` \xD7 ${d.replicates} seeds (it uses random)` : ""}: changes ${(100 * d.changeRate).toFixed(0)}%, invalid or failing ${(100 * d.invalidRate).toFixed(0)}%${d.errors.length ? ` (${d.errors.map(([e, n]) => `${e} \xD7${n}`).join(", ")})` : ""}; mutators ${d.mutators.join(", ") || "none"}.`
  ];
  if (sample.value !== void 0) {
    diagnostics.push(sample.error ? `On object 1 it fails: ${sample.error.slice(0, 300)}` : `On object 1 it returns ${sample.calls.length > 300 ? `${sample.calls.slice(0, 300)}\u2026` : sample.calls}.`);
  }
  return {
    cost: price.cost,
    parts: price.parts,
    complexityFunctionId: inspection.complexityFunctionId,
    decisionBits: measured.decisionBits,
    expectedActCost: measured.expectedActCost,
    breakdown,
    randomized: measured.randomized,
    diagnostics,
    runs,
    measureMs
  };
}

// src/lib/logger.ts
import pino from "pino";
var isProduction = process.env.NODE_ENV === "production";
var logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']"
  ],
  ...isProduction ? {} : {
    transport: {
      target: "pino-pretty",
      options: { colorize: true }
    }
  }
});

// src/game/ai-provider.ts
import { createDirectAnthropicProvider, createDirectOpenAIProvider } from "@workspace/ai-player";
var AI_MODEL_CATALOG = Object.freeze([
  Object.freeze({ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", provider: "anthropic", inputUsdPerMillion: 2, outputUsdPerMillion: 10 }),
  Object.freeze({ id: "claude-opus-5-5", label: "Claude Opus 5.5", provider: "anthropic", inputUsdPerMillion: 4, outputUsdPerMillion: 20 }),
  Object.freeze({ id: "gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai", inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6 })
]);
function getAIModel(provider, model) {
  const config = AI_MODEL_CATALOG.find((item) => item.provider === provider && item.id === model);
  if (!config) throw Object.assign(new Error("Select an available model for the chosen provider"), { status: 400 });
  return config;
}
function getAIProvider(selection) {
  const config = getAIModel(selection.provider, selection.model);
  const key = config.provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw Object.assign(new Error(`AI players require a server-side ${config.provider} API key`), { status: 503 });
  return config.provider === "anthropic" ? createDirectAnthropicProvider(key, { ...config, model: config.id }) : createDirectOpenAIProvider(key, config.id, config);
}

// src/game/activity.ts
import { performance as performance2 } from "node:perf_hooks";
var INACTIVITY_MS = 30 * 60 * 1e3;
function createActivityClock(now = () => performance2.now()) {
  let deadline = -Infinity;
  return {
    isIdle: () => now() >= deadline,
    remaining: () => Math.max(0, deadline - now()),
    record: () => {
      deadline = now() + INACTIVITY_MS;
    }
  };
}
var clock = createActivityClock();
var servers = /* @__PURE__ */ new Set();
var connections = /* @__PURE__ */ new Map();
var websockets = /* @__PURE__ */ new Map();
var closingWebsockets = /* @__PURE__ */ new WeakSet();
var deadlineTimer;
var sweepTimer;
var isLocallyIdle = () => clock.isIdle();
async function isServerActive() {
  return !clock.isIdle();
}
async function recordHumanActivity() {
  clock.record();
  if (deadlineTimer) clearTimeout(deadlineTimer);
  deadlineTimer = setTimeout(sweepIdleConnections, clock.remaining() + 1);
  deadlineTimer.unref();
  return { active: true, idleDeadline: Date.now() + clock.remaining() };
}
function sweepIdleConnections() {
  if (!clock.isIdle()) return;
  for (const [ws, busy] of websockets) {
    if (busy() || ws.readyState !== 1) continue;
    closeIdleSocket(ws);
  }
  for (const server of servers) server.closeIdleConnections();
  for (const [socket, state] of connections) {
    if (state.requests || state.upgraded || socket.destroyed) continue;
    socket.end();
    const grace = setTimeout(() => {
      if (clock.isIdle() && !state.requests && !state.upgraded) socket.destroy();
    }, 5e3);
    grace.unref();
  }
}
function closeIdleSocket(ws) {
  if (closingWebsockets.has(ws)) return;
  closingWebsockets.add(ws);
  ws.close(4008, "SERVER_IDLE");
  const grace = setTimeout(() => {
    if (ws.readyState !== 3) ws.terminate();
  }, 5e3);
  grace.unref();
  ws.once("close", () => clearTimeout(grace));
}
function ensureSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepIdleConnections, 1e3);
  sweepTimer.unref();
}
function stopUnusedSweep() {
  if (connections.size || websockets.size || !sweepTimer) return;
  clearInterval(sweepTimer);
  sweepTimer = void 0;
}
function registerActivitySocket(ws, busy = () => false) {
  websockets.set(ws, busy);
  ensureSweep();
  ws.once("close", () => {
    websockets.delete(ws);
    stopUnusedSweep();
  });
}

// src/game/interaction-scheduler.ts
var InteractionScheduler = class {
  constructor(now, candidates, capture, onError, wake = () => {
  }, currentGameId) {
    this.now = now;
    this.candidates = candidates;
    this.capture = capture;
    this.onError = onError;
    this.wake = wake;
    this.currentGameId = currentGameId;
  }
  now;
  candidates;
  capture;
  onError;
  wake;
  currentGameId;
  flights = /* @__PURE__ */ new Set();
  reserved = /* @__PURE__ */ new Set();
  deadlines = /* @__PURE__ */ new Map();
  cursor = "";
  stopped = false;
  generation = 0;
  eligibleDeadline = Infinity;
  get inFlight() {
    return this.flights.size;
  }
  invalidate() {
    this.generation++;
  }
  /** Sub-millisecond deadlines use an immediate; empty/saturated worlds sleep. */
  nextDelay() {
    if (this.stopped || this.flights.size >= 4) return 100;
    return Math.min(100, Math.max(0, this.eligibleDeadline - this.now()));
  }
  pump() {
    this.eligibleDeadline = Infinity;
    if (this.stopped || this.flights.size >= 4) return;
    const rooms3 = this.candidates();
    const start = (rooms3.indexOf(this.cursor) + 1) % (rooms3.length || 1);
    const live = new Set(rooms3);
    for (const roomId of this.deadlines.keys()) if (!live.has(roomId)) this.deadlines.delete(roomId);
    for (let i = 0; i < rooms3.length && this.flights.size < 4; i++) {
      const roomId = rooms3[(start + i) % rooms3.length];
      const now = this.now();
      const deadline = this.deadlines.get(roomId);
      if (deadline && now < deadline.at && this.currentGameId?.(roomId) === deadline.gameId) {
        this.eligibleDeadline = Math.min(this.eligibleDeadline, deadline.at);
        continue;
      }
      let job;
      try {
        job = this.capture(roomId, (gameId, objectId) => !this.reserved.has(`${gameId}:${objectId}`));
      } catch (error) {
        this.onError(error);
        continue;
      }
      if (!job) continue;
      if (!(job.rate > 0) || !Number.isFinite(job.rate)) {
        job.release?.();
        continue;
      }
      if (deadline?.gameId === job.gameId && now < deadline.at) {
        job.release?.();
        this.eligibleDeadline = Math.min(this.eligibleDeadline, deadline.at);
        continue;
      }
      const key = `${job.gameId}:${job.objectId}`;
      if (this.reserved.has(key)) {
        job.release?.();
        continue;
      }
      this.reserved.add(key);
      this.cursor = roomId;
      this.deadlines.set(roomId, { gameId: job.gameId, at: now + 1e3 / job.rate });
      this.eligibleDeadline = Math.min(this.eligibleDeadline, now + 1e3 / job.rate);
      const generation2 = this.generation;
      const current = () => !this.stopped && generation2 === this.generation;
      const flight = Promise.resolve().then(() => job.execute()).then((value) => current() ? job.commit(value, current) : void 0).catch((error) => this.onError(error)).finally(() => {
        job.release?.();
        this.reserved.delete(key);
        this.flights.delete(flight);
        if (!this.stopped) this.wake();
      });
      this.flights.add(flight);
    }
  }
  async stop() {
    this.stopped = true;
    this.invalidate();
    await Promise.allSettled([...this.flights]);
  }
};
function completionTarget(game, snapshot, now) {
  if (!game || game.id !== snapshot.gameId || game.phase !== "running" || game.pauseEndsAt !== snapshot.pauseEndsAt || (game.executionEpoch ?? 0) !== snapshot.epoch || game.worldSeconds + Math.max(0, now - game.lastTick) / 1e3 >= game.endAtWorld) return;
  return game.objects.find((o) => o.id === snapshot.objectId && o.version === snapshot.version);
}
function advanceWorld(game, now, spawn2, spawnInterval) {
  if (game.phase === "planning" || game.phase === "paused") {
    const deadline = game.phase === "planning" ? game.planningEndsAt : game.pauseEndsAt;
    if (now < deadline) return;
    game.phase = "running";
    game.lastTick = deadline;
  }
  if (game.phase !== "running") return;
  const target = game.worldSeconds + Math.max(0, now - game.lastTick) / 1e3;
  game.lastTick = now;
  const until = Math.min(target, game.endAtWorld);
  while (game.nextSpawn <= until && game.nextSpawn < game.endAtWorld) {
    game.worldSeconds = game.nextSpawn;
    if (game.objects.length >= 2e3) {
      game.phase = "recovery";
      game.recoveryReason = "The world reached its 2,000-object safety limit.";
      return;
    }
    spawn2(game);
    const next = game.nextSpawn + spawnInterval();
    game.nextSpawn = Number.isFinite(next) ? next : Number.MAX_VALUE;
  }
  game.worldSeconds = until;
  if (target >= game.endAtWorld) game.phase = "ended";
}

// src/game/engine.ts
var openUniform = () => (randomBytes5(6).readUIntBE(0, 6) + 0.5) / 281474976710656;
var below = (bound) => cryptoRng.int(bound);
function scoresOf(game, value) {
  const { utilities: utilities2 } = requireAdapters();
  return Object.fromEntries(game.deities.map((d) => [d.id, utilities2.score(game.settings, d.utility, value)]));
}
var occupied = (game, value) => game.objects.some((o) => o.value === value);
function spawnValue(settings) {
  const inst = instantiationOf4(settings), T = objectType2(inst.objectType);
  return T.codec(inst).encode(T.spawn(inst, cryptoRng));
}
function spawn(game) {
  let value = spawnValue(game.settings);
  for (let attempt = 0; occupied(game, value); attempt++) {
    if (attempt >= 100) return;
    value = spawnValue(game.settings);
  }
  const object = { id: randomUUID3(), value, version: 0, scores: scoresOf(game, value) };
  game.objects.push(object);
  recordEvent(game, { id: randomUUID3(), gameId: game.id, type: "object.spawned", object: structuredClone(object), timestamp: Date.now() });
}
function recordEvent(game, event) {
  game.events.push(event);
  if (game.events.length > 5e3) game.events.splice(0, game.events.length - 5e3);
}
function actOutcome(settings, before, result) {
  if ("error" in result) return { ok: false, reason: result.error, cost: { decision: 0, erasure: 0, motion: 0, total: 0 } };
  const inst = instantiationOf4(settings);
  return applyCalls(objectType2(inst.objectType), inst, before, result.calls);
}
var playSeed = (gameId, agentId, actIndex) => deriveSeed(seasonSalt(), ["play", gameId, agentId, actIndex]);
async function startGame(room, actor) {
  owner(room, actor);
  if (room.game && room.game.phase !== "ended") throw new Error("There is already a live game");
  if (room.members.length < 3) throw new Error("At least three gods are required");
  if (room.members.length > 8) throw new Error("At most eight gods can play");
  if (room.members.some((m) => m.kind === "ai")) {
    for (const bot of room.members.filter((m) => m.kind === "ai")) {
      if (!bot.aiAgent) throw new Error("Every AI seat needs an agent from the library");
      getAIProvider(bot.aiAgent);
    }
    if (room.aiBudget <= 0) throw new Error("Approve an AI token budget before starting with AI seats");
  }
  validateSettings3(room.settings);
  const { utilities: utilities2, runtime: runtime2 } = requireAdapters();
  if (!runtime2.languages.includes(room.settings.language)) throw new Error("The selected isolated runtime is unavailable");
  const dealt = utilities2.deal(room.settings, room.members.length);
  const id = randomUUID3(), now = Date.now();
  const gameIds = (await pool.query("SELECT id FROM cg_games")).rows.map((row) => row.id);
  const aliases = uniquePrefixes2([...gameIds, id]);
  const game = {
    id,
    shortCode: aliases.find((a) => a.id === id).shortCode,
    phase: "planning",
    scoring: "information-v1",
    seasonCommitment: seasonCommitment(),
    settings: structuredClone(room.settings),
    roster: structuredClone(room.members),
    deities: room.members.map((m, i) => ({
      id: m.id,
      utility: dealt[i],
      spent: 0,
      pauseUsed: false
    })),
    objects: [],
    agents: [],
    events: [],
    createdAt: now,
    planningEndsAt: now + room.settings.planningSeconds * 1e3,
    pauseEndsAt: 0,
    worldSeconds: 0,
    endAtWorld: lifetimeSeconds(room.settings.halfLifeSeconds, openUniform()),
    nextSpawn: poissonIntervalSeconds(room.settings.spawnRateHz, openUniform()),
    lastTick: now
  };
  if (!Number.isFinite(game.nextSpawn)) game.nextSpawn = Number.MAX_VALUE;
  for (let i = 0; i < game.settings.startingObjectCount; i++) spawn(game);
  room.game = game;
  room.aiUsed = 0;
  room.aiReservedUsd = 0;
  room.aiInputTokens = 0;
  room.aiOutputTokens = 0;
  room.members.forEach((m) => {
    m.ready = false;
  });
}
async function playerCommand(room, actor, input) {
  requireAct(actor);
  member(room, actor);
  if (!input.requestId || input.requestId.length > 100) throw new Error("Invalid request ID");
  const key = `${actor.id}:${input.gameId ?? "room"}:${input.requestId}`;
  const digest = hash(JSON.stringify(input));
  if (room.receipts[key]) {
    if (room.receipts[key].hash !== digest) throw new Error("Request ID reused with different payload");
    return room.receipts[key].result;
  }
  const game = room.game, payload = input.payload ?? {};
  let result;
  if (input.command === "chat.send") {
    const text = payload.text;
    if (typeof text !== "string" || !text.trim() || text.length > 2e3) throw new Error("Chat text must be 1\u20132000 characters");
    const last = [...room.chat].reverse().find((m) => m.authorId === actor.id);
    if (last && Date.now() - last.timestamp < 1e3) throw Object.assign(new Error("Chat rate limit"), { status: 429 });
    const message = { id: randomUUID3(), authorId: actor.id, authorName: room.members.find((m) => m.id === actor.id).name, kind: actor.kind, text, timestamp: Date.now() };
    room.chat.push(message);
    result = message;
  } else if (input.command === "ready.set") {
    if (typeof payload.ready !== "boolean") throw new Error("Expected readiness boolean");
    room.members.find((m) => m.id === actor.id).ready = payload.ready;
    result = { ready: payload.ready };
  } else {
    if (!game || input.gameId !== game.id) throw new Error("Stale game");
    if (game.phase === "ended" || game.phase === "recovery") throw new Error("Game is not accepting commands");
    const deity = game.deities.find((d) => d.id === actor.id);
    if (!deity) throw new Error("You are observing until the next game");
    if (input.command === "pause.use") {
      if (game.phase !== "running" || deity.pauseUsed) throw new Error("Pause is unavailable");
      advanceWorld(game, Date.now(), spawn, () => poissonIntervalSeconds(game.settings.spawnRateHz, openUniform()));
      if (game.phase !== "running") throw new Error("Pause is unavailable");
      deity.pauseUsed = true;
      game.executionEpoch = (game.executionEpoch ?? 0) + 1;
      game.phase = "paused";
      game.pauseEndsAt = Date.now() + game.settings.pauseSeconds * 1e3;
      result = { pauseEndsAt: game.pauseEndsAt };
    } else if (input.command === "agent.summon" || input.command === "agent.validate") {
      const source = payload.source;
      if (typeof source !== "string" || !source || Buffer.byteLength(source) > 16384) throw new Error("Source must be 1\u201316384 bytes");
      const prior = input.examined?.gameId === game.id && input.examined.source === source ? input.examined.result : void 0;
      if (prior instanceof Error) throw prior;
      const examined = prior ?? await examineAgent(game.settings, source, liveSample(game));
      if (input.command === "agent.validate") {
        result = {
          valid: true,
          cost: examined.cost,
          parts: examined.parts,
          decisionBits: examined.decisionBits,
          expectedActCost: examined.expectedActCost,
          breakdown: examined.breakdown,
          randomized: examined.randomized,
          diagnostics: examined.diagnostics
        };
        room.receipts[key] = { hash: digest, result };
        return result;
      }
      if (godEnergy(game, deity) < examined.cost) throw new Error("Insufficient energy");
      if (game.agents.filter((a) => a.ownerId === actor.id).length >= game.settings.maxAgentsPerGod)
        throw new Error(`This god has reached the ${game.settings.maxAgentsPerGod}-agent resource limit`);
      const agent = {
        id: randomUUID3(),
        ownerId: actor.id,
        source,
        createdAt: Date.now(),
        summonCost: examined.cost,
        decisionBits: examined.decisionBits,
        expectedActCost: examined.expectedActCost,
        perActFloorBits: game.settings.perActFloorBits,
        breakdown: examined.breakdown,
        randomized: examined.randomized,
        account: newAgentAccount(worldNow(game)),
        acts: 0,
        spent: 0
      };
      deity.spent += examined.cost;
      game.agents.push(agent);
      result = { id: agent.id, summonCost: agent.summonCost, decisionBits: agent.decisionBits, expectedActCost: agent.expectedActCost };
    } else if (input.command === "agent.destroy") {
      const index = game.agents.findIndex((a) => a.id === payload.agentId && a.ownerId === actor.id);
      if (index < 0) throw new Error("You have no agent with that ID");
      const [agent] = game.agents.splice(index, 1);
      result = { destroyed: agent.id };
    } else throw new Error("Unknown command");
  }
  room.receipts[key] = { hash: digest, result };
  return result;
}
var liveSample = (game) => game.objects.slice(0, 16).map((o) => o.value);
function resumeGame(game) {
  game.phase = game.worldSeconds === 0 && game.planningEndsAt > Date.now() ? "planning" : "running";
  game.lastTick = Date.now();
  delete game.recoveryReason;
  delete game.autoResume;
}
function commitAct(g, snapshot, result, nowMs = Date.now()) {
  const target = completionTarget(g, snapshot, nowMs);
  const agentIndex = g.agents.findIndex((a) => a.id === snapshot.agentId);
  if (!target || agentIndex < 0) return false;
  const agent = g.agents[agentIndex];
  const outcome = actOutcome(g.settings, snapshot.before, result);
  const duplicate = outcome.ok && occupied(g, outcome.value);
  const cost = { ...actCharge(agent, outcome, { duplicate }), naming: outcome.cost.decision };
  const account = chargeAct(settledAccount(g.settings, agent, worldNow(g, nowMs)), cost.total);
  const state = { id: agent.id, account, acts: agent.acts + 1, spent: agent.spent + cost.total };
  g.agents[agentIndex] = { ...agent, account, acts: state.acts, spent: state.spent };
  const common = { id: randomUUID3(), gameId: g.id, timestamp: nowMs, agentId: agent.id, ownerId: agent.ownerId };
  if (outcome.ok && !duplicate) {
    target.value = outcome.value;
    target.version++;
    target.scores = scoresOf(g, outcome.value);
    recordEvent(g, {
      ...common,
      type: "object.transformed",
      object: structuredClone(target),
      before: snapshot.before,
      calls: outcome.calls,
      cost,
      agent: state
    });
  } else {
    recordEvent(g, {
      ...common,
      type: "agent.failed",
      objectId: target.id,
      cost,
      agent: state,
      reason: outcome.ok ? "another object already has this value" : outcome.reason.slice(0, 300)
    });
  }
  return true;
}
function startTicker() {
  const actingAgents = /* @__PURE__ */ new Set();
  let pending;
  let stopped = false;
  const scheduler = new InteractionScheduler(
    () => performance.now(),
    () => {
      if (isLocallyIdle()) {
        scheduler.invalidate();
        return [];
      }
      return allRooms().filter((r) => r.game?.phase === "running").map((r) => r.id);
    },
    (roomId, available) => {
      if (stopped || isLocallyIdle() || !interactionCapacity(roomId)) return;
      const room = allRooms().find((r) => r.id === roomId), game = room?.game;
      if (!game || game.phase !== "running" || !game.agents.length || game.settings.interactionRateHz <= 0) return;
      const now = Date.now();
      if (game.worldSeconds + Math.max(0, now - game.lastTick) / 1e3 >= game.endAtWorld) return;
      const objects = game.objects.filter((o) => available(game.id, o.id));
      if (!objects.length) return;
      const agents = game.agents.filter((a) => !actingAgents.has(a.id) && agentStatus(game, a, now).eligible);
      if (!agents.length) return;
      const object = objects[below(objects.length)];
      const agent = agents[below(agents.length)];
      const settings = structuredClone(game.settings);
      const snapshot = {
        gameId: game.id,
        objectId: object.id,
        version: object.version,
        before: object.value,
        agentId: agent.id,
        ownerId: agent.ownerId,
        pauseEndsAt: game.pauseEndsAt,
        epoch: game.executionEpoch ?? 0
      };
      const source = agent.source, seed = playSeed(game.id, agent.id, agent.acts);
      actingAgents.add(agent.id);
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          actingAgents.delete(agent.id);
        }
      };
      return {
        roomId,
        gameId: game.id,
        objectId: object.id,
        rate: game.settings.interactionRateHz,
        execute: async () => {
          try {
            const act = await requireAdapters().runtime.act(source, snapshot.before, settings, seed);
            return { calls: act.calls, usedRandom: act.usedRandom, steps: act.steps };
          } catch (error) {
            if (isAgentFault(error)) return { error: error.message.slice(0, 300) };
            release();
            throw error;
          }
        },
        commit: async (result, current) => {
          try {
            if (!current() || stopped || isLocallyIdle()) return;
            await mutateInteraction(roomId, snapshot.objectId, (draft) => {
              const g = draft.game;
              if (!current() || stopped || isLocallyIdle() || !g) return false;
              return commitAct(g, snapshot, result);
            }, snapshot.agentId);
          } finally {
            release();
          }
        },
        release
      };
    },
    (error) => logger.info({ errorName: error instanceof Error ? error.name : "Error" }, "Agent execution failed without changing the object"),
    () => wakeDispatch(),
    (roomId) => allRooms().find((r) => r.id === roomId)?.game?.id
  );
  let dispatchTimer;
  let dispatchImmediate;
  function wakeDispatch() {
    if (stopped || dispatchImmediate) return;
    if (dispatchTimer) {
      clearTimeout(dispatchTimer);
      dispatchTimer = void 0;
    }
    dispatchImmediate = setImmediate(() => {
      dispatchImmediate = void 0;
      scheduler.pump();
      const delay = scheduler.nextDelay();
      if (delay < 1) wakeDispatch();
      else dispatchTimer = setTimeout(() => {
        dispatchTimer = void 0;
        wakeDispatch();
      }, delay).unref();
    });
  }
  wakeDispatch();
  const timer = setInterval(() => {
    if (pending || stopped) return;
    if (isLocallyIdle() && !allRooms().some((r) => r.game && !["ended", "recovery"].includes(r.game.phase))) return;
    pending = (async () => {
      for (const room of allRooms()) {
        if (stopped) break;
        if (room.game?.phase === "recovery" && room.game.autoResume && !isLocallyIdle()) {
          await mutate(room.id, async (draft) => {
            if (draft.game?.phase === "recovery") resumeGame(draft.game);
          });
          continue;
        }
        if (!room.game || ["ended", "recovery"].includes(room.game.phase)) continue;
        const game = room.game, now = Date.now();
        const deadline = game.phase === "planning" ? game.planningEndsAt : game.pauseEndsAt;
        if (!isLocallyIdle() && (game.phase === "planning" || game.phase === "paused") && now < deadline) continue;
        const target = game.worldSeconds + Math.max(0, now - game.lastTick) / 1e3;
        if (!isLocallyIdle() && game.phase === "running" && now - game.lastTick < 1e3 && target < Math.min(game.nextSpawn, game.endAtWorld)) continue;
        await mutate(room.id, async (draft) => {
          const g = draft.game, now2 = Date.now();
          if (stopped || !g || g.id !== game.id || ["ended", "recovery"].includes(g.phase)) return;
          if (isLocallyIdle()) {
            scheduler.invalidate();
            g.executionEpoch = (g.executionEpoch ?? 0) + 1;
            g.phase = "recovery";
            g.recoveryReason = "Server became idle. The game resumes when a player returns.";
            g.autoResume = true;
            return;
          }
          advanceWorld(g, now2, spawn, () => poissonIntervalSeconds(g.settings.spawnRateHz, openUniform()));
          if (g.phase === "recovery") g.executionEpoch = (g.executionEpoch ?? 0) + 1;
        });
      }
      wakeDispatch();
    })().catch((error) => logger.error({ errorName: error.name }, "World tick failed")).finally(() => {
      pending = void 0;
    });
  }, 100).unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    if (dispatchTimer) clearTimeout(dispatchTimer);
    if (dispatchImmediate) clearImmediate(dispatchImmediate);
    await Promise.all([pending, scheduler.stop()]);
  };
}

// src/game/player-api.ts
function observation(room, actor) {
  member(room, actor);
  const game = room.game, deity = game?.deities.find((d) => d.id === actor.id);
  const self = room.members.find((m) => m.id === actor.id);
  const settings = game?.settings ?? room.settings;
  const instance = objectInstance(settings);
  return observationSchema.parse({
    version: VERSION,
    roomId: room.id,
    revision: room.seq,
    roomShortCode: room.shortCode,
    gameShortCode: game?.shortCode,
    seated: !!deity,
    gameId: game?.id,
    planningEndsAt: game?.planningEndsAt,
    pauseEndsAt: game?.pauseEndsAt,
    phase: game?.phase === "recovery" ? "paused" : game?.phase ?? "lobby",
    language: settings.language,
    ...instance ? { instance } : {},
    economy: {
      energyPerSecond: settings.energyPerSecond,
      agentEnergyPerSecond: settings.agentEnergyPerSecond,
      agentBatteryActs: settings.agentBatteryActs,
      maxAgentsPerGod: settings.maxAgentsPerGod,
      penaltyWeight: settings.penaltyWeight,
      worldSeconds: game ? worldNow(game) : 0
    },
    self: {
      godId: actor.id,
      label: self.name,
      isAI: self.kind === "ai",
      ready: self.ready,
      utility: game && deity ? utilityCard(game, actor.id) ?? void 0 : void 0,
      pauseUsed: deity?.pauseUsed ?? false,
      energy: !game || !deity ? 0 : godEnergy(game, deity)
    },
    objects: !game || !deity ? [] : game.objects.flatMap((o) => {
      const view = personalObject(game, o, actor.id);
      return view ? [{ id: view.id, value: view.value, own: view.own, peerNetBits: view.peerNetBits, peerCare: view.peerCare, payoff: view.payoff }] : [];
    }),
    agents: game?.agents.filter((a) => a.ownerId === actor.id).map((a) => ({ ...agentView(game, a), language: game.settings.language })) ?? [],
    transformations: game?.events.flatMap((e) => e.type === "object.transformed" && e.ownerId === actor.id ? [e] : []).slice(-500).map((e) => ({
      id: e.id,
      agentId: e.agentId,
      before: e.before,
      after: e.object.value,
      ...e.calls ? { calls: e.calls.slice(0, 16) } : {},
      ...e.cost ? { cost: e.cost.total } : {}
    })) ?? [],
    leaderboard: game ? standings(game).map((s) => ({ godId: s.deityId, label: s.name, isAI: s.kind === "ai", totalPayoff: s.totalPayoff })) : [],
    chat: room.chat.slice(-100).map((m) => ({ id: m.id, godId: m.authorId, label: m.authorName, isAI: m.kind === "ai", text: m.text.slice(0, 2e3) }))
  });
}
async function premeasure(room, actor, envelope) {
  const command = envelope.command;
  if (command.type !== "validate" && command.type !== "summon") return void 0;
  const game = room.game;
  if (!game || envelope.gameId !== game.id || command.language !== game.settings.language || room.receipts[`client:${actor.id}:${envelope.commandId}`] || !game.deities.some((d) => d.id === actor.id) || ["ended", "recovery"].includes(game.phase)) return void 0;
  try {
    return { gameId: game.id, source: command.source, result: await examineAgent(game.settings, command.source, liveSample(game)) };
  } catch (error) {
    if (error.agentFault) return { gameId: game.id, source: command.source, result: error };
    throw error;
  }
}
async function executePlayerEnvelope(roomId, actor, raw) {
  requireAct(actor);
  const envelope = envelopeSchema.parse(raw);
  const id = resolveRoom(roomId).id;
  member(resolveRoom(id), actor);
  let examined;
  try {
    examined = await premeasure(resolveRoom(id), actor, envelope);
  } catch (error) {
    examined = { gameId: envelope.gameId ?? "", source: "source" in envelope.command ? envelope.command.source : "", result: error };
  }
  return mutate(id, async (room) => {
    requireAct(actor);
    member(room, actor);
    const key = `client:${actor.id}:${envelope.commandId}`, digest = hash(JSON.stringify(envelope));
    if (room.receipts[key]) {
      if (room.receipts[key].hash !== digest) throw new Error("Command ID was reused with different content");
      return room.receipts[key].result;
    }
    const command = envelope.command;
    let receipt;
    try {
      if (GAME_COMMANDS.includes(command.type) && !envelope.gameId) throw new Error("Game ID is required");
      if (envelope.gameId && envelope.gameId !== room.game?.id) throw new Error("Stale game");
      if ("language" in command && command.language !== room.game?.settings.language) throw new Error("Wrong game language");
      const names = {
        validate: "agent.validate",
        summon: "agent.summon",
        ready: "ready.set",
        chat: "chat.send",
        pause: "pause.use",
        destroy: "agent.destroy"
      };
      const result = await playerCommand(room, actor, {
        command: names[command.type],
        requestId: envelope.commandId,
        gameId: room.game?.id,
        payload: command,
        examined
      });
      receipt = {
        commandId: envelope.commandId,
        accepted: true,
        message: "Accepted",
        ...command.type === "validate" ? { validation: result } : {}
      };
    } catch (error) {
      receipt = {
        commandId: envelope.commandId,
        accepted: false,
        message: error.message.slice(0, 2e3),
        ...command.type === "validate" ? { validation: { valid: false, cost: 0, expectedActCost: 0, diagnostics: [error.message.slice(0, 1e3)] } } : {}
      };
    }
    room.receipts[key] = { hash: digest, result: receipt };
    return receipt;
  });
}

// src/routes/player.ts
var router2 = Router2();
router2.get("/player/v1/rooms/:roomId/observation", (req, res) => {
  res.set("Cache-Control", "no-store").json(observation(resolveRoom(String(req.params.roomId)), requireIdentity(req)));
});
router2.post("/player/v1/rooms/:roomId/commands", async (req, res) => {
  res.json(await executePlayerEnvelope(String(req.params.roomId), requireIdentity(req), req.body));
});
var player_default = router2;

// test/client-daemon-integration.test.ts
import { VERSION as VERSION3 } from "@workspace/player-client";

// src/game/socket.ts
import { WebSocketServer, WebSocket } from "ws";
import { VERSION as VERSION2 } from "@workspace/player-client";
function attachSockets(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
  let closing2 = false;
  const pending = /* @__PURE__ */ new Set();
  const track = (work) => {
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => {
    });
  };
  server.on("upgrade", (req, socket, head) => {
    if (closing2) {
      socket.destroy();
      return;
    }
    track((async () => {
      const url = new URL(req.url, "https://localhost");
      const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
      if (!match) {
        socket.destroy();
        return;
      }
      const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : void 0;
      if (!bearer && req.headers.origin !== `https://${req.headers.host}`) throw new Error("Origin mismatch");
      const cookie = req.headers.cookie?.split(";").map((s) => s.trim()).find((s) => s.startsWith("cg_session="))?.slice(11);
      const token = bearer ?? cookie;
      if (!token) throw new Error("Unauthorized");
      const actor = await lookupSession(token);
      if (closing2) {
        socket.destroy();
        return;
      }
      if (!actor) throw new Error("Unauthorized");
      if (!await isServerActive()) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          registerActivitySocket(ws);
          closeIdleSocket(ws);
        });
        return;
      }
      const room = resolveRoom(decodeURIComponent(match[1]));
      member(room, actor);
      wss.handleUpgrade(req, socket, head, (ws) => {
        let authorized = true;
        const closeSession = () => {
          authorized = false;
          ws.close(1008, "Session expired or revoked; reapproval required");
        };
        let unwatch;
        try {
          unwatch = watchSession(actor, closeSession);
        } catch {
          closeSession();
          return;
        }
        const active = () => {
          if (!authorized) return false;
          try {
            assertSessionActive(actor);
            return true;
          } catch {
            closeSession();
            return false;
          }
        };
        const send = (type, payload, seq = resolveRoom(room.id).seq) => {
          if (!active() || isLocallyIdle()) return;
          if (ws.bufferedAmount > 1048576) {
            ws.close(1013, "Reconnect to resync");
            return;
          }
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ protocolVersion: 1, type, seq, serverTime: Date.now(), payload }));
        };
        const project = () => publicRoom(resolveRoom(room.id));
        send("room.snapshot", project());
        send("player.observation", observation(room, actor));
        let gameId = room.game?.id;
        let gameEnded = room.game?.phase === "ended";
        let lastEvent = room.game?.events.at(-1)?.id;
        const listener = (changed) => {
          if (changed.id !== room.id || !active()) return;
          send("room.snapshot", project());
          send("player.observation", observation(changed, actor));
          if (gameId !== changed.game?.id) {
            gameId = changed.game?.id;
            gameEnded = false;
            lastEvent = void 0;
            if (changed.game?.deities.some((d) => d.id === actor.id)) send("game.preparing", observation(changed, actor));
          }
          const events = changed.game?.events ?? [];
          const start = lastEvent ? events.findIndex((e) => e.id === lastEvent) + 1 : 0;
          const seatedGame = changed.game?.deities.some((d) => d.id === actor.id) ? changed.game : void 0;
          if (seatedGame) {
            for (const event of events.slice(start)) {
              if (event.type === "agent.failed") continue;
              const own = personalObject(seatedGame, event.object, actor.id);
              const mine = event.type === "object.transformed" && event.ownerId === actor.id;
              send(event.type, {
                id: event.id,
                gameId: event.gameId,
                ...event.type === "object.transformed" ? { agentId: event.agentId, before: event.before } : {},
                // Only an agent's owner learns which calls it made and what they cost.
                ...mine && event.type === "object.transformed" ? { calls: event.calls, cost: event.cost } : {},
                object: {
                  id: event.object.id,
                  value: event.object.value,
                  version: event.object.version,
                  ...own ? { own: own.own, peerNetBits: own.peerNetBits, peerCare: own.peerCare, payoff: own.payoff } : {}
                }
              });
            }
          }
          lastEvent = events.at(-1)?.id;
          send("leaderboard.updated", changed.game ? standings(changed.game) : []);
          if (changed.game?.phase === "ended" && !gameEnded) send("game.ended", gameRecord(changed.id, changed.game));
          gameEnded = changed.game?.phase === "ended";
        };
        listeners.add(listener);
        let busy = false;
        registerActivitySocket(ws, () => busy);
        ws.on("message", (data) => {
          if (closing2 || !active()) return;
          if (busy) {
            send("command.error", { error: "Previous command still pending" });
            return;
          }
          busy = true;
          track((async () => {
            if (!await lookupSession(token)) {
              ws.close(1008, "Session expired");
              return;
            }
            if (!await isServerActive()) {
              closeIdleSocket(ws);
              return;
            }
            const input = JSON.parse(data.toString());
            if (input?.version !== VERSION2) throw new Error(`Unsupported protocol: send ${VERSION2} envelopes`);
            const receipt = await executePlayerEnvelope(room.id, actor, input);
            if (receipt.accepted && actor.kind === "human") await recordHumanActivity();
            send("command.receipt", receipt);
          })().catch((error) => send("command.error", { error: String(error.message) })).finally(() => {
            busy = false;
          }));
        });
        const heartbeat = setInterval(() => {
          if (isLocallyIdle()) return;
          void lookupSession(token).then((identity) => {
            if (!identity) ws.close(1008, "Session expired");
            else ws.ping();
          }).catch(() => ws.close(1011, "Authentication unavailable"));
        }, 15e3);
        ws.on("close", () => {
          authorized = false;
          unwatch();
          clearInterval(heartbeat);
          listeners.delete(listener);
        });
      });
    })().catch(() => {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }));
  });
  return async () => {
    closing2 = true;
    await Promise.allSettled([...pending]);
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => wss.close(() => resolve()));
  };
}

// src/game/runtime-setup.ts
import { defaultSettingsFor as defaultSettingsFor2 } from "@workspace/game-core";
import { OBJECT_TYPES } from "@workspace/game-types";
import { createRuntime, RuntimeError as RuntimeError2 } from "@workspace/game-runtime";
var languages = ["python", "typescript"];
var pools = {};
var initialization;
var generation = 0;
function initializeRuntimeAdapters() {
  if (initialization) return initialization;
  const currentGeneration = generation;
  const candidates = {};
  pools = candidates;
  initialization = (async () => {
    const failures = [];
    const usable = {};
    await Promise.all(languages.map(async (language) => {
      const pool2 = createRuntime({ language, workers: 4, queueLimit: 32, startupMs: 12e4 });
      candidates[language] = pool2;
      const probe = async () => {
        for (const type of OBJECT_TYPES) {
          const settings = defaultSettingsFor2(type.id, language);
          const source = language === "python" ? "def agent(x):\n    return []" : "function agent(x) { return []; }";
          const act = actSettings(settings);
          const { cost } = await pool2.inspect(source, act);
          const input = probeValue(settings);
          const { calls } = await pool2.act(source, input, act, "0");
          if (!Number.isFinite(cost) || cost <= 0 || calls !== "[]") {
            throw new RuntimeError2("UNAVAILABLE", `${language} ${type.id} agent probe failed`);
          }
        }
      };
      try {
        for (let attempt = 1; ; attempt++) {
          try {
            await probe();
            break;
          } catch (error) {
            if (attempt >= 3) throw error;
          }
        }
        const warm = defaultSettingsFor2("Grid", language), act = actSettings(warm);
        const source = language === "python" ? "def agent(x):\n    return []" : "function agent(x) { return []; }";
        await Promise.all(Array.from({ length: 4 }, (_, i) => pool2.act(source, probeValue(warm), act, String(i))));
        usable[language] = pool2;
      } catch (error) {
        pool2.close();
        failures.push(`${language}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
    if (currentGeneration !== generation) {
      for (const pool2 of Object.values(candidates)) pool2.close();
      throw new RuntimeError2("UNAVAILABLE", "Runtime initialization was shut down");
    }
    if (!Object.keys(usable).length) {
      throw new RuntimeError2("UNAVAILABLE", `No isolated runtime is usable: ${failures.join("; ")}`);
    }
    for (const failure of failures) console.warn(`Isolated runtime unavailable (no fallback): ${failure}`);
    pools = usable;
    registerAdapters({ runtime: createRuntimeAdapter(usable), utilities: createUtilitiesAdapter() });
  })().catch((error) => {
    if (currentGeneration === generation) {
      for (const pool2 of Object.values(candidates)) pool2.close();
      pools = {};
      initialization = void 0;
      unregisterAdapters();
    }
    throw error;
  });
  return initialization;
}
function shutdownRuntimeAdapters() {
  generation++;
  for (const pool2 of Object.values(pools)) pool2.close();
  pools = {};
  initialization = void 0;
  unregisterAdapters();
}

// test/client-daemon-integration.test.ts
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await sleep(100);
  }
  assert.fail("Timed out waiting for client state");
}
var rpc = async (child, type) => {
  const reply = once(child, "message");
  child.send({ type });
  return (await reply)[0];
};
test("two independent daemon processes approve through PKCE and play via real HTTP/WebSocket", { timeout: 9e4 }, async () => {
  const children = [];
  const app = express();
  app.use(express.json(), authenticate);
  app.use("/api", device_default, player_default);
  app.use((error, _req, res, _next) => res.status(error.status ?? 400).json({ error: "Request rejected" }));
  const server = createServer(app);
  attachSockets(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await initializeRuntimeAdapters();
    await recordHumanActivity();
    const actors = ["Host fixture", "Independent A", "Independent B"].map((name) => ({ id: randomUUID4(), name, kind: "human", scope: "browser" }));
    const room = await createRoom(actors[0]);
    await mutate(room.id, async (draft) => {
      Object.assign(draft.settings, {
        language: "typescript",
        grammarId: "typescript-agent-v1",
        complexityFunctionId: "ts-ast-bits-v1-uniform",
        objectType: "Int",
        startingEnergy: 100,
        startingObjectCount: 3,
        agentEnergyPerSecond: 1e3,
        agentBatteryActs: 1e3
      });
      draft.members.push(...actors.slice(1).map((actor) => ({ ...actor, ready: false })));
      await startGame(draft, actors[0]);
    });
    const clients = [];
    for (const actor of actors.slice(1)) {
      const child = fork(new URL("./client-daemon-integration.worker.mjs", import.meta.url), [`${base}/api/player/v1`], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" },
        execArgv: ["--experimental-transform-types"],
        stdio: ["ignore", "ignore", "ignore", "ipc"]
      });
      children.push(child);
      const ready = (await once(child, "message"))[0];
      let cookie = "", csrf = "";
      const request = async (path, body) => fetch(`${ready.origin}/player/daemon${path}`, {
        method: body === void 0 ? "GET" : "POST",
        headers: { origin: ready.origin, "content-type": "application/json", cookie, "x-csrf-token": csrf },
        ...body === void 0 ? {} : { body: JSON.stringify(body) }
      });
      const ticket = new URL(ready.launch).hash.slice("#launch=".length);
      const login = await request("/session", { ticket });
      assert.equal(login.status, 200);
      cookie = login.headers.get("set-cookie").split(";")[0];
      assert.equal((await request("/session", { ticket })).status, 401, "launch is single-use");
      csrf = (await (await request("/session")).json()).csrf;
      const approval = await (await request("/approval", { roomId: clients.length ? room.id : room.shortCode.toLowerCase() })).json();
      assert.deepEqual(Object.keys(approval).sort(), ["userCode", "verificationUri"]);
      assert.equal(new URL(approval.verificationUri).origin, base);
      const device = [...fixtureDevices.values()].find((d) => d.code === approval.userCode);
      assert.equal(device.room_id, room.id);
      assert.match(device.challenge, /^[A-Za-z0-9_-]{43}$/);
      const browser2 = await issueSession(actor, 6e4);
      const approve = await fetch(`${base}/api/device/approve`, {
        method: "POST",
        headers: { authorization: `Bearer ${browser2}`, "content-type": "application/json" },
        body: JSON.stringify({ code: approval.userCode })
      });
      assert.equal(approve.status, 200);
      assert.equal((await fetch(`${base}/api/device/poll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: device.id, deviceSecret: "wrong", verifier: "wrong" })
      })).status, 400);
      await eventually(async () => {
        const data = await (await request("/approval/poll", {})).json();
        assert.deepEqual(Object.keys(data), ["status"]);
        return data.status === "approved";
      });
      await eventually(async () => (await rpc(child, "stats")).opens === 1);
      clients.push({ child, request, actor, pid: ready.pid, cookie, origin: ready.origin });
    }
    assert.notEqual(clients[0].pid, clients[1].pid);
    assert.notEqual(clients[0].origin, clients[1].origin);
    assert.equal((await fetch(`${clients[1].origin}/player/daemon/session`, { headers: { cookie: clients[0].cookie } })).status, 401);
    const unauthorized = new WebSocket2(`${base.replace("http", "ws")}/api/rooms/${room.id}/ws`);
    const rejection = new Promise((resolve) => {
      unauthorized.once("unexpected-response", (_req, res) => {
        res.resume();
        resolve(res.statusCode);
        unauthorized.terminate();
      });
      unauthorized.on("error", () => {
      });
    });
    assert.equal(await rejection, 401);
    const command = (type, extra = {}) => ({ version: VERSION3, commandId: randomUUID4(), command: { type, ...extra } });
    for (const client of clients) {
      const observation2 = await (await client.request("/observation")).json();
      assert.equal(observation2.self.godId, client.actor.id);
      assert.equal(observation2.agents.length, 0);
      const source = client === clients[0] ? "function agent(x) { return [add(1)]; }" : "function agent(x) { return [add(2)]; }";
      const validation = await (await client.request("/commands", command("validate", { language: "typescript", source }))).json();
      assert.equal(validation.accepted, true);
      assert.ok(validation.validation.cost > 0);
      assert.ok(validation.validation.expectedActCost > 0);
      const summon = command("summon", { language: "typescript", source });
      const receipt = await (await client.request("/commands", summon)).json();
      assert.equal(receipt.accepted, true);
      assert.deepEqual(await (await client.request("/commands", summon)).json(), receipt);
      assert.equal((await client.request("/commands", { ...summon, command: { type: "pause" } })).status, 409);
      await client.request("/commands", command("chat", { text: `Hello from ${client.actor.name}` }));
      await client.request("/commands", command("ready", { ready: true }));
      const own = await (await client.request("/observation")).json();
      assert.equal(own.agents.length, 1);
      assert.equal(own.agents[0].source, source);
      assert.ok((await rpc(client.child, "stats")).receipts >= 4, "commands received real WS receipts");
    }
    const sharedChat = await (await clients[0].request("/observation")).json();
    assert.ok(sharedChat.chat.some((entry) => entry.text === `Hello from ${clients[1].actor.name}`));
    await mutate(room.id, async (draft) => {
      const game = draft.game;
      game.phase = "running";
      game.lastTick = Date.now();
      for (const agent of game.agents) agent.account = { balance: 100, settledWorldSeconds: game.worldSeconds };
    });
    startTicker();
    await eventually(async () => resolveRoom(room.id).game.events.some((event) => event.type === "object.transformed"));
    await eventually(async () => (await rpc(clients[0].child, "stats")).transformations > 0);
    const before = await rpc(clients[0].child, "stats");
    await rpc(clients[0].child, "drop");
    await eventually(async () => (await rpc(clients[0].child, "stats")).opens > before.opens);
    await eventually(async () => (await rpc(clients[0].child, "stats")).observations > before.observations);
    const recovered = await (await clients[0].request("/observation")).json();
    assert.equal(recovered.self.godId, clients[0].actor.id);
    assert.ok(recovered.transformations.length > 0);
    assert.equal((await (await clients[0].request("/commands", command("chat", { text: "Reconnected" }))).json()).accepted, true);
    assert.equal((await clients[0].request("/disconnect", {})).status, 200);
    assert.equal((await clients[0].request("/observation")).status, 401);
    assert.equal((await clients[1].request("/observation")).status, 200);
  } finally {
    for (const child of children) {
      const exit = once(child, "exit");
      child.kill();
      await exit;
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve()));
    shutdownRuntimeAdapters();
  }
});
