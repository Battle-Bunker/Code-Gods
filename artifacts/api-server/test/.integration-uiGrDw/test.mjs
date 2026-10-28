// test/game-integration.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID as randomUUID4 } from "node:crypto";

// fixture:db
import { openSync, writeFileSync, readFileSync, fsyncSync, closeSync } from "node:fs";
var fixtureRooms = /* @__PURE__ */ new Map();
var fixtureGames = /* @__PURE__ */ new Map();
var fixtureAgents = /* @__PURE__ */ new Map();
var fixtureBatches = /* @__PURE__ */ new Map();
var fixtureGameRows = /* @__PURE__ */ new Map();
function fixtureDurableRoom(id) {
  let room;
  for (const line of readFileSync("/home/user/Code-Gods/artifacts/api-server/test/.integration-uiGrDw/durable.json", "utf8").trim().split("\n")) {
    for (const [key, value] of JSON.parse(line).rooms) if (key === id) room = value;
  }
  return room;
}
function fixtureDurableBatches() {
  const lines = readFileSync("/home/user/Code-Gods/artifacts/api-server/test/.integration-uiGrDw/durable.json", "utf8").trim().split("\n");
  return JSON.parse(lines.at(-1)).batches ?? [];
}
var fixtureControl = { failCommit: false, failCheckpoint: false, loseAppendAck: false, commits: 0, interactionWrites: 0 };
var prior;
async function query(sql, args = []) {
  if (sql === "BEGIN") {
    prior = [new Map(fixtureRooms), new Map(fixtureGames), new Map(fixtureBatches), new Map(fixtureGameRows)];
    return { rows: [] };
  }
  if (sql === "ROLLBACK") {
    if (prior) {
      fixtureRooms.clear();
      fixtureGames.clear();
      fixtureBatches.clear();
      for (const [k, v] of prior[0]) fixtureRooms.set(k, v);
      for (const [k, v] of prior[1]) fixtureGames.set(k, v);
      for (const [k, v] of prior[2]) fixtureBatches.set(k, v);
      fixtureGameRows.clear();
      for (const [k, v] of prior[3]) fixtureGameRows.set(k, v);
    }
    prior = void 0;
    return { rows: [] };
  }
  if (sql === "COMMIT") {
    if (fixtureControl.failCommit) throw new Error("fixture commit failure");
    if (fixtureControl.failCheckpoint && [...fixtureRooms].some(([id, value]) => prior?.[0].get(id) !== value))
      throw new Error("fixture checkpoint failure");
    const fd = openSync("/home/user/Code-Gods/artifacts/api-server/test/.integration-uiGrDw/durable.json", "a");
    try {
      writeFileSync(fd, JSON.stringify({
        rooms: [...fixtureRooms].filter(([id, value]) => prior?.[0].get(id) !== value),
        games: [...fixtureGames].filter(([id, value]) => prior?.[1].get(id) !== value),
        batches: [...fixtureBatches.values()]
      }) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    fixtureControl.commits++;
    prior = void 0;
    return { rows: [] };
  }
  if (sql.startsWith("INSERT INTO cg_interaction_batches")) {
    if (!prior) {
      await query("BEGIN");
      try {
        const result = await query(sql, args);
        await query("COMMIT");
        if (fixtureControl.loseAppendAck) {
          fixtureControl.loseAppendAck = false;
          throw new Error("fixture lost append acknowledgement");
        }
        return result;
      } catch (error) {
        await query("ROLLBACK");
        throw error;
      }
    }
    const key = args[0] + ":" + args[2];
    if (!fixtureBatches.has(key)) fixtureBatches.set(key, { room_id: args[0], game_id: args[1], end_seq: args[2], events: JSON.parse(args[3]) });
    fixtureControl.interactionWrites++;
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith("DELETE FROM cg_interaction_batches")) {
    for (const [key, batch] of fixtureBatches) if (batch.room_id === args[0] && batch.end_seq <= args[1]) fixtureBatches.delete(key);
    return { rows: [] };
  }
  if (sql.startsWith("SELECT room_id,game_id,end_seq,events FROM cg_interaction_batches"))
    return { rows: [...fixtureBatches.values()].filter((b) => b.room_id === args[0] && b.end_seq > args[1]).sort((a, b) => a.end_seq - b.end_seq) };
  if (sql === "SELECT id,state FROM cg_rooms") return { rows: [...fixtureRooms].map(([id, state]) => ({ id, state: structuredClone(state) })) };
  if (sql === "SELECT * FROM cg_ai_agents WHERE id=$1") return { rows: fixtureAgents.has(args[0]) ? [fixtureAgents.get(args[0])] : [] };
  if (sql.startsWith("SELECT id,prefix_length,summary FROM cg_games WHERE room_id=$1"))
    return { rows: [...fixtureGameRows.values()].filter((r) => r.room_id === args[0] && r.summary?.scoring === "information-v1").sort((a, b) => b.started_at - a.started_at).slice(0, args[1]).map((r) => ({ id: r.id, prefix_length: r.prefix_length, summary: r.summary })) };
  if (sql === "SELECT state,prefix_length FROM cg_games WHERE id=$1")
    return { rows: fixtureGames.has(args[0]) ? [{ state: structuredClone(fixtureGames.get(args[0])), prefix_length: fixtureGameRows.get(args[0]).prefix_length }] : [] };
  if (sql.startsWith("SELECT id")) return { rows: [...fixtureGames.values()].map((g) => ({ id: g.id, room_id: fixtureGameRows.get(g.id)?.room_id, prefix_length: g.shortCode.length })) };
  if (sql.startsWith("INSERT INTO cg_rooms")) {
    fixtureRooms.set(args[0], JSON.parse(args[3]));
    return { rows: [] };
  }
  if (sql.startsWith("INSERT INTO cg_games")) {
    fixtureGames.set(args[0], JSON.parse(args[3]));
    fixtureGameRows.set(args[0], { id: args[0], room_id: args[1], prefix_length: args[2], started_at: args[4], ended_at: args[5], summary: args[6] && JSON.parse(args[6]) });
    return { rows: [] };
  }
  if (sql === "UPDATE cg_rooms SET state=$2 WHERE id=$1") {
    fixtureRooms.set(args[0], JSON.parse(args[1]));
    return { rows: [] };
  }
  throw new Error("Unexpected fixture SQL: " + sql);
}
var pool = { query, connect: async () => ({ query, release() {
} }) };

// fixture:identity
import { createHash } from "node:crypto";
var fixtureActors = /* @__PURE__ */ new Map();
var hash = (x) => createHash("sha256").update(x).digest("hex");
var lookupSession = async (token) => fixtureActors.get(token);
var assertSessionActive = () => {
};
var requireAct = (actor) => {
  if (actor.permission === "read") throw new Error("Read-only authorization");
};
var watchSession = () => () => {
};
function requireIdentity(req) {
  const actor = fixtureActors.get(req.headers.authorization?.slice(7));
  if (!actor) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return actor;
}

// test/game-integration.test.ts
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import WebSocket2 from "ws";

// src/routes/rooms.ts
import { Router } from "express";
import { randomUUID as randomUUID3 } from "node:crypto";

// ../../lib/api-zod/src/generated/api.ts
import * as zod from "zod";
var GetCurrentAuthUserResponse = zod.object({
  "user": zod.union([zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "isAdmin": zod.boolean()
  }), zod.null()])
});
var ListPublicAiAgentsResponse = zod.object({
  "agents": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "provider": zod.enum(["anthropic", "openai"]),
    "model": zod.string()
  }))
});
var listAdminAiAgentsResponseAgentsItemTwoPromptMax = 1e4;
var ListAdminAiAgentsResponse = zod.object({
  "agents": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "provider": zod.enum(["anthropic", "openai"]),
    "model": zod.string()
  }).and(zod.object({
    "prompt": zod.string().max(listAdminAiAgentsResponseAgentsItemTwoPromptMax),
    "revision": zod.number().int().min(1),
    "createdAt": zod.coerce.date(),
    "updatedAt": zod.coerce.date()
  }))),
  "models": zod.array(zod.object({
    "id": zod.string(),
    "label": zod.string(),
    "provider": zod.enum(["anthropic", "openai"]),
    "configured": zod.boolean(),
    "inputUsdPerMillion": zod.number(),
    "outputUsdPerMillion": zod.number()
  }))
});
var createAdminAiAgentBodyNameMax = 100;
var createAdminAiAgentBodyPromptMax = 1e4;
var CreateAdminAiAgentBody = zod.object({
  "name": zod.string().min(1).max(createAdminAiAgentBodyNameMax),
  "provider": zod.enum(["anthropic", "openai"]),
  "model": zod.string(),
  "prompt": zod.string().max(createAdminAiAgentBodyPromptMax)
});
var createAdminAiAgentResponseTwoPromptMax = 1e4;
var CreateAdminAiAgentResponse = zod.object({
  "id": zod.string(),
  "name": zod.string(),
  "provider": zod.enum(["anthropic", "openai"]),
  "model": zod.string()
}).and(zod.object({
  "prompt": zod.string().max(createAdminAiAgentResponseTwoPromptMax),
  "revision": zod.number().int().min(1),
  "createdAt": zod.coerce.date(),
  "updatedAt": zod.coerce.date()
}));
var UpdateAdminAiAgentParams = zod.object({
  "id": zod.coerce.string()
});
var updateAdminAiAgentBodyNameMax = 100;
var updateAdminAiAgentBodyPromptMax = 1e4;
var UpdateAdminAiAgentBody = zod.object({
  "name": zod.string().min(1).max(updateAdminAiAgentBodyNameMax),
  "provider": zod.enum(["anthropic", "openai"]),
  "model": zod.string(),
  "prompt": zod.string().max(updateAdminAiAgentBodyPromptMax),
  "revision": zod.number().int().min(1)
});
var updateAdminAiAgentResponseTwoPromptMax = 1e4;
var UpdateAdminAiAgentResponse = zod.object({
  "id": zod.string(),
  "name": zod.string(),
  "provider": zod.enum(["anthropic", "openai"]),
  "model": zod.string()
}).and(zod.object({
  "prompt": zod.string().max(updateAdminAiAgentResponseTwoPromptMax),
  "revision": zod.number().int().min(1),
  "createdAt": zod.coerce.date(),
  "updatedAt": zod.coerce.date()
}));
var DeleteAdminAiAgentParams = zod.object({
  "id": zod.coerce.string()
});
var DeleteAdminAiAgentQueryParams = zod.object({
  "revision": zod.coerce.number().int().min(1)
});
var DeleteAdminAiAgentResponse = zod.void();
var ListRoomsResponseItem = zod.object({
  "id": zod.string(),
  "shortCode": zod.string(),
  "ownerId": zod.string(),
  "ownerName": zod.string(),
  "createdAt": zod.union([zod.number(), zod.null()]).describe("Unix milliseconds; null when the creation time is unknown."),
  "memberCount": zod.number().int(),
  "phase": zod.string().describe("`lobby` between games, otherwise the active game's phase."),
  "activeGameShortCode": zod.string().nullable()
});
var ListRoomsResponse = zod.array(ListRoomsResponseItem);
var CreateRoomBody = zod.object({});
var createRoomResponseSettingsOneInteractionRateHzDefault = 100;
var createRoomResponseSettingsOneInteractionRateHzMin = 0;
var createRoomResponseSettingsOneInteractionRateHzMax = 1e3;
var createRoomResponseSettingsOneInteractionComputeMsDefault = 5;
var createRoomResponseSettingsOneInteractionComputeMsMax = 1e3;
var createRoomResponseSettingsOneAgentEnergyPerSecondDefault = 2;
var createRoomResponseSettingsOneAgentEnergyPerSecondMin = 0;
var createRoomResponseSettingsOneAgentEnergyPerSecondMax = 1e3;
var createRoomResponseSettingsOneAgentBatteryActsDefault = 2;
var createRoomResponseSettingsOneAgentBatteryActsMax = 1e3;
var createRoomResponseSettingsOneMaxAgentsPerGodDefault = 200;
var createRoomResponseSettingsOneMaxAgentsPerGodMax = 200;
var createRoomResponseSettingsOnePenaltyWeightDefault = 1;
var createRoomResponseSettingsOnePenaltyWeightMin = 0;
var createRoomResponseSettingsOneDefenceRateDefault = 0;
var createRoomResponseSettingsOneDefenceRateMin = 0;
var createRoomResponseSettingsOneDefenceRateMax = 1;
var CreateRoomResponse = zod.object({
  "id": zod.string(),
  "shortCode": zod.string(),
  "ownerId": zod.string(),
  "ownerName": zod.string(),
  "createdAt": zod.number().nullable().describe("Unix milliseconds; null when the creation time is unknown."),
  "revision": zod.number().int(),
  "settings": zod.object({
    "language": zod.enum(["python", "typescript"]),
    "objectType": zod.enum(["Int", "string", "Grid"]).describe("The object type constructor."),
    "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.").describe("Its arguments. Only instantiations listed in Manifest.objectTypes[].offered are accepted."),
    "grammarId": zod.enum(["python-agent-v1", "typescript-agent-v1"]),
    "utilitySelectorId": zod.string(),
    "complexityFunctionId": zod.string(),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(createRoomResponseSettingsOneInteractionRateHzMin).max(createRoomResponseSettingsOneInteractionRateHzMax).default(createRoomResponseSettingsOneInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(createRoomResponseSettingsOneInteractionComputeMsMax).default(createRoomResponseSettingsOneInteractionComputeMsDefault).describe("Guest execution CPU budget per interaction in milliseconds; excludes compilation and worker startup. Configurable only between games."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(createRoomResponseSettingsOneAgentEnergyPerSecondMin).max(createRoomResponseSettingsOneAgentEnergyPerSecondMax).default(createRoomResponseSettingsOneAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(createRoomResponseSettingsOneAgentBatteryActsMax).default(createRoomResponseSettingsOneAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(createRoomResponseSettingsOneMaxAgentsPerGodMax).default(createRoomResponseSettingsOneMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(createRoomResponseSettingsOnePenaltyWeightMin).default(createRoomResponseSettingsOnePenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(createRoomResponseSettingsOneDefenceRateMin).max(createRoomResponseSettingsOneDefenceRateMax).default(createRoomResponseSettingsOneDefenceRateDefault).describe("Probability that a god is also dealt a defence goal.")
  }).describe("Settings for the next game. Each game keeps its own snapshot from launch."),
  "members": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "kind": zod.enum(["human", "ai"]),
    "ready": zod.boolean(),
    "status": zod.string().optional()
  })),
  "chat": zod.array(zod.object({
    "id": zod.string(),
    "authorId": zod.string(),
    "authorName": zod.string(),
    "kind": zod.string(),
    "text": zod.string(),
    "timestamp": zod.number()
  })),
  "activeGame": zod.union([zod.object({
    "id": zod.string(),
    "shortCode": zod.string(),
    "phase": zod.string(),
    "startedAt": zod.number(),
    "roster": zod.array(zod.object({
      "id": zod.string(),
      "name": zod.string(),
      "kind": zod.enum(["human", "ai"])
    }))
  }).describe("The room's single active (not yet ended) game."), zod.null()]),
  "serverTime": zod.number(),
  "objectInstance": zod.object({
    "objectType": zod.string(),
    "args": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}."),
    "key": zod.string(),
    "label": zod.string(),
    "badges": zod.array(zod.object({
      "id": zod.string(),
      "emoji": zod.string(),
      "label": zod.string(),
      "kid": zod.string()
    }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
    "terms": zod.record(zod.string(), zod.number()),
    "display": zod.record(zod.string(), zod.unknown()).describe("Type-specific display tables (Grid: symbols and colours)."),
    "codec": zod.object({
      "format": zod.string(),
      "maxLength": zod.number().int()
    }),
    "mutators": zod.array(zod.object({
      "id": zod.string(),
      "name": zod.string(),
      "emoji": zod.string(),
      "summary": zod.string()
    })),
    "helpers": zod.array(zod.object({
      "name": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "signature": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "kid": zod.string(),
      "class": zod.string().optional(),
      "group": zod.enum(["read", "mutator"])
    }))
  }).describe("A fully applied object type (e.g. Grid(5,base10,rgby)), its display tables, mutators and prelude helpers.").describe("The instantiation the next game will play."),
  "utilityCatalog": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "emoji": zod.string(),
    "theme": zod.string(),
    "role": zod.enum(["reward", "penalty"]).describe("penalty families are dealt only as defence goals."),
    "tags": zod.array(zod.string()),
    "available": zod.boolean(),
    "badges": zod.array(zod.object({
      "id": zod.string(),
      "emoji": zod.string(),
      "label": zod.string(),
      "kid": zod.string()
    }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
    "locked": zod.object({
      "reason": zod.string().describe("Kid wording, e.g. needs \u2660 Suits: pick Playing cards."),
      "unlock": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).optional().describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.")
    }).optional()
  }).describe("A family any god might draw (never who drew what). Locked families say why, and the smallest settings change that unlocks them.")).describe("Public list of utility-function families gods may draw for these settings, with availability."),
  "aiBudget": zod.number().int(),
  "aiUsed": zod.number().int(),
  "aiInputTokens": zod.number().int().optional().describe("Provider-reported input tokens recorded for this game."),
  "aiOutputTokens": zod.number().int().optional().describe("Provider-reported output tokens recorded for this game.")
}).describe("A room is a persistent lobby: members, readiness and the owner's settings for the NEXT game. Each launched game has its own page (GET /games/{code}/state) and, once ended, an entry in GET /rooms/{roomId}/games.");
var GetGameLinkParams = zod.object({
  "code": zod.coerce.string().describe("Game short code or UUID")
});
var GetGameLinkResponse = zod.object({
  "id": zod.string(),
  "shortCode": zod.string(),
  "roomShortCode": zod.string().nullable(),
  "status": zod.enum(["current", "historical", "unavailable"])
});
var GetRoomParams = zod.object({
  "roomId": zod.coerce.string()
});
var getRoomResponseSettingsOneInteractionRateHzDefault = 100;
var getRoomResponseSettingsOneInteractionRateHzMin = 0;
var getRoomResponseSettingsOneInteractionRateHzMax = 1e3;
var getRoomResponseSettingsOneInteractionComputeMsDefault = 5;
var getRoomResponseSettingsOneInteractionComputeMsMax = 1e3;
var getRoomResponseSettingsOneAgentEnergyPerSecondDefault = 2;
var getRoomResponseSettingsOneAgentEnergyPerSecondMin = 0;
var getRoomResponseSettingsOneAgentEnergyPerSecondMax = 1e3;
var getRoomResponseSettingsOneAgentBatteryActsDefault = 2;
var getRoomResponseSettingsOneAgentBatteryActsMax = 1e3;
var getRoomResponseSettingsOneMaxAgentsPerGodDefault = 200;
var getRoomResponseSettingsOneMaxAgentsPerGodMax = 200;
var getRoomResponseSettingsOnePenaltyWeightDefault = 1;
var getRoomResponseSettingsOnePenaltyWeightMin = 0;
var getRoomResponseSettingsOneDefenceRateDefault = 0;
var getRoomResponseSettingsOneDefenceRateMin = 0;
var getRoomResponseSettingsOneDefenceRateMax = 1;
var GetRoomResponse = zod.object({
  "id": zod.string(),
  "shortCode": zod.string(),
  "ownerId": zod.string(),
  "ownerName": zod.string(),
  "createdAt": zod.number().nullable().describe("Unix milliseconds; null when the creation time is unknown."),
  "revision": zod.number().int(),
  "settings": zod.object({
    "language": zod.enum(["python", "typescript"]),
    "objectType": zod.enum(["Int", "string", "Grid"]).describe("The object type constructor."),
    "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.").describe("Its arguments. Only instantiations listed in Manifest.objectTypes[].offered are accepted."),
    "grammarId": zod.enum(["python-agent-v1", "typescript-agent-v1"]),
    "utilitySelectorId": zod.string(),
    "complexityFunctionId": zod.string(),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(getRoomResponseSettingsOneInteractionRateHzMin).max(getRoomResponseSettingsOneInteractionRateHzMax).default(getRoomResponseSettingsOneInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(getRoomResponseSettingsOneInteractionComputeMsMax).default(getRoomResponseSettingsOneInteractionComputeMsDefault).describe("Guest execution CPU budget per interaction in milliseconds; excludes compilation and worker startup. Configurable only between games."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(getRoomResponseSettingsOneAgentEnergyPerSecondMin).max(getRoomResponseSettingsOneAgentEnergyPerSecondMax).default(getRoomResponseSettingsOneAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(getRoomResponseSettingsOneAgentBatteryActsMax).default(getRoomResponseSettingsOneAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(getRoomResponseSettingsOneMaxAgentsPerGodMax).default(getRoomResponseSettingsOneMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(getRoomResponseSettingsOnePenaltyWeightMin).default(getRoomResponseSettingsOnePenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(getRoomResponseSettingsOneDefenceRateMin).max(getRoomResponseSettingsOneDefenceRateMax).default(getRoomResponseSettingsOneDefenceRateDefault).describe("Probability that a god is also dealt a defence goal.")
  }).describe("Settings for the next game. Each game keeps its own snapshot from launch."),
  "members": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "kind": zod.enum(["human", "ai"]),
    "ready": zod.boolean(),
    "status": zod.string().optional()
  })),
  "chat": zod.array(zod.object({
    "id": zod.string(),
    "authorId": zod.string(),
    "authorName": zod.string(),
    "kind": zod.string(),
    "text": zod.string(),
    "timestamp": zod.number()
  })),
  "activeGame": zod.union([zod.object({
    "id": zod.string(),
    "shortCode": zod.string(),
    "phase": zod.string(),
    "startedAt": zod.number(),
    "roster": zod.array(zod.object({
      "id": zod.string(),
      "name": zod.string(),
      "kind": zod.enum(["human", "ai"])
    }))
  }).describe("The room's single active (not yet ended) game."), zod.null()]),
  "serverTime": zod.number(),
  "objectInstance": zod.object({
    "objectType": zod.string(),
    "args": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}."),
    "key": zod.string(),
    "label": zod.string(),
    "badges": zod.array(zod.object({
      "id": zod.string(),
      "emoji": zod.string(),
      "label": zod.string(),
      "kid": zod.string()
    }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
    "terms": zod.record(zod.string(), zod.number()),
    "display": zod.record(zod.string(), zod.unknown()).describe("Type-specific display tables (Grid: symbols and colours)."),
    "codec": zod.object({
      "format": zod.string(),
      "maxLength": zod.number().int()
    }),
    "mutators": zod.array(zod.object({
      "id": zod.string(),
      "name": zod.string(),
      "emoji": zod.string(),
      "summary": zod.string()
    })),
    "helpers": zod.array(zod.object({
      "name": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "signature": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "kid": zod.string(),
      "class": zod.string().optional(),
      "group": zod.enum(["read", "mutator"])
    }))
  }).describe("A fully applied object type (e.g. Grid(5,base10,rgby)), its display tables, mutators and prelude helpers.").describe("The instantiation the next game will play."),
  "utilityCatalog": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "emoji": zod.string(),
    "theme": zod.string(),
    "role": zod.enum(["reward", "penalty"]).describe("penalty families are dealt only as defence goals."),
    "tags": zod.array(zod.string()),
    "available": zod.boolean(),
    "badges": zod.array(zod.object({
      "id": zod.string(),
      "emoji": zod.string(),
      "label": zod.string(),
      "kid": zod.string()
    }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
    "locked": zod.object({
      "reason": zod.string().describe("Kid wording, e.g. needs \u2660 Suits: pick Playing cards."),
      "unlock": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).optional().describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.")
    }).optional()
  }).describe("A family any god might draw (never who drew what). Locked families say why, and the smallest settings change that unlocks them.")).describe("Public list of utility-function families gods may draw for these settings, with availability."),
  "aiBudget": zod.number().int(),
  "aiUsed": zod.number().int(),
  "aiInputTokens": zod.number().int().optional().describe("Provider-reported input tokens recorded for this game."),
  "aiOutputTokens": zod.number().int().optional().describe("Provider-reported output tokens recorded for this game.")
}).describe("A room is a persistent lobby: members, readiness and the owner's settings for the NEXT game. Each launched game has its own page (GET /games/{code}/state) and, once ended, an entry in GET /rooms/{roomId}/games.");
var ListRoomGamesParams = zod.object({
  "roomId": zod.coerce.string()
});
var listRoomGamesResponseSettingsInteractionRateHzDefault = 100;
var listRoomGamesResponseSettingsInteractionRateHzMin = 0;
var listRoomGamesResponseSettingsInteractionRateHzMax = 1e3;
var listRoomGamesResponseSettingsInteractionComputeMsDefault = 5;
var listRoomGamesResponseSettingsInteractionComputeMsMax = 1e3;
var listRoomGamesResponseSettingsAgentEnergyPerSecondDefault = 2;
var listRoomGamesResponseSettingsAgentEnergyPerSecondMin = 0;
var listRoomGamesResponseSettingsAgentEnergyPerSecondMax = 1e3;
var listRoomGamesResponseSettingsAgentBatteryActsDefault = 2;
var listRoomGamesResponseSettingsAgentBatteryActsMax = 1e3;
var listRoomGamesResponseSettingsMaxAgentsPerGodDefault = 200;
var listRoomGamesResponseSettingsMaxAgentsPerGodMax = 200;
var listRoomGamesResponseSettingsPenaltyWeightDefault = 1;
var listRoomGamesResponseSettingsPenaltyWeightMin = 0;
var listRoomGamesResponseSettingsDefenceRateDefault = 0;
var listRoomGamesResponseSettingsDefenceRateMin = 0;
var listRoomGamesResponseSettingsDefenceRateMax = 1;
var ListRoomGamesResponseItem = zod.object({
  "id": zod.string(),
  "shortCode": zod.string(),
  "roomId": zod.string(),
  "startedAt": zod.number(),
  "endedAt": zod.number().nullable().describe("Unix milliseconds."),
  "endReason": zod.union([zod.literal("lifetime"), zod.literal("owner"), zod.literal(null)]).nullable(),
  "settings": zod.object({
    "language": zod.enum(["python", "typescript"]),
    "objectType": zod.enum(["Int", "string", "Grid"]).describe("The object type constructor."),
    "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.").describe("Its arguments. Only instantiations listed in Manifest.objectTypes[].offered are accepted."),
    "grammarId": zod.enum(["python-agent-v1", "typescript-agent-v1"]),
    "utilitySelectorId": zod.string(),
    "complexityFunctionId": zod.string(),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(listRoomGamesResponseSettingsInteractionRateHzMin).max(listRoomGamesResponseSettingsInteractionRateHzMax).default(listRoomGamesResponseSettingsInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(listRoomGamesResponseSettingsInteractionComputeMsMax).default(listRoomGamesResponseSettingsInteractionComputeMsDefault).describe("Guest execution CPU budget per interaction in milliseconds; excludes compilation and worker startup. Configurable only between games."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(listRoomGamesResponseSettingsAgentEnergyPerSecondMin).max(listRoomGamesResponseSettingsAgentEnergyPerSecondMax).default(listRoomGamesResponseSettingsAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(listRoomGamesResponseSettingsAgentBatteryActsMax).default(listRoomGamesResponseSettingsAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(listRoomGamesResponseSettingsMaxAgentsPerGodMax).default(listRoomGamesResponseSettingsMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(listRoomGamesResponseSettingsPenaltyWeightMin).default(listRoomGamesResponseSettingsPenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(listRoomGamesResponseSettingsDefenceRateMin).max(listRoomGamesResponseSettingsDefenceRateMax).default(listRoomGamesResponseSettingsDefenceRateDefault).describe("Probability that a god is also dealt a defence goal.")
  }),
  "roster": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "kind": zod.enum(["human", "ai"])
  })),
  "leaderboard": zod.array(zod.object({
    "deityId": zod.string(),
    "name": zod.string(),
    "kind": zod.string(),
    "totalPayoff": zod.number().describe("\u03A3 over live objects of n_i \xB7 max(0, \u03A3_{j\u2260i} n_j), in bits\xB2."),
    "rank": zod.number().int()
  })),
  "winners": zod.array(zod.object({
    "deityId": zod.string(),
    "name": zod.string(),
    "kind": zod.string()
  })).describe("Every god ranked first (ties share the win)."),
  "worldSeconds": zod.number(),
  "objectCount": zod.number().int(),
  "agentCount": zod.number().int(),
  "scoring": zod.enum(["information-v1"]).describe("Information scoring: payoffs in bits\xB2.")
}).describe("Public result of one finished game, kept in its room's history.");
var ListRoomGamesResponse = zod.array(ListRoomGamesResponseItem);
var GetGameStateParams = zod.object({
  "code": zod.coerce.string().describe("Game short code or UUID")
});
var getGameStateResponseOneSettingsInteractionRateHzDefault = 100;
var getGameStateResponseOneSettingsInteractionRateHzMin = 0;
var getGameStateResponseOneSettingsInteractionRateHzMax = 1e3;
var getGameStateResponseOneSettingsInteractionComputeMsDefault = 5;
var getGameStateResponseOneSettingsInteractionComputeMsMax = 1e3;
var getGameStateResponseOneSettingsAgentEnergyPerSecondDefault = 2;
var getGameStateResponseOneSettingsAgentEnergyPerSecondMin = 0;
var getGameStateResponseOneSettingsAgentEnergyPerSecondMax = 1e3;
var getGameStateResponseOneSettingsAgentBatteryActsDefault = 2;
var getGameStateResponseOneSettingsAgentBatteryActsMax = 1e3;
var getGameStateResponseOneSettingsMaxAgentsPerGodDefault = 200;
var getGameStateResponseOneSettingsMaxAgentsPerGodMax = 200;
var getGameStateResponseOneSettingsPenaltyWeightDefault = 1;
var getGameStateResponseOneSettingsPenaltyWeightMin = 0;
var getGameStateResponseOneSettingsDefenceRateDefault = 0;
var getGameStateResponseOneSettingsDefenceRateMin = 0;
var getGameStateResponseOneSettingsDefenceRateMax = 1;
var GetGameStateResponse = zod.object({
  "id": zod.string(),
  "shortCode": zod.string(),
  "phase": zod.string(),
  "worldSeconds": zod.number(),
  "planningEndsAt": zod.number(),
  "pauseEndsAt": zod.number(),
  "agentCount": zod.number().int(),
  "objects": zod.array(zod.object({
    "id": zod.string(),
    "value": zod.union([zod.number().int(), zod.string()]),
    "version": zod.number().int(),
    "salience": zod.number().describe("\u03A3 over gods of their net bits for this object. Individual scores are never public.")
  })),
  "leaderboard": zod.array(zod.object({
    "deityId": zod.string(),
    "name": zod.string(),
    "kind": zod.string(),
    "totalPayoff": zod.number().describe("\u03A3 over live objects of n_i \xB7 max(0, \u03A3_{j\u2260i} n_j), in bits\xB2."),
    "rank": zod.number().int()
  })),
  "startedAt": zod.number(),
  "endedAt": zod.number().nullable(),
  "endReason": zod.string().nullable(),
  "recoveryReason": zod.string().nullable(),
  "settings": zod.object({
    "language": zod.enum(["python", "typescript"]),
    "objectType": zod.enum(["Int", "string", "Grid"]).describe("The object type constructor."),
    "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.").describe("Its arguments. Only instantiations listed in Manifest.objectTypes[].offered are accepted."),
    "grammarId": zod.enum(["python-agent-v1", "typescript-agent-v1"]),
    "utilitySelectorId": zod.string(),
    "complexityFunctionId": zod.string(),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(getGameStateResponseOneSettingsInteractionRateHzMin).max(getGameStateResponseOneSettingsInteractionRateHzMax).default(getGameStateResponseOneSettingsInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(getGameStateResponseOneSettingsInteractionComputeMsMax).default(getGameStateResponseOneSettingsInteractionComputeMsDefault).describe("Guest execution CPU budget per interaction in milliseconds; excludes compilation and worker startup. Configurable only between games."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(getGameStateResponseOneSettingsAgentEnergyPerSecondMin).max(getGameStateResponseOneSettingsAgentEnergyPerSecondMax).default(getGameStateResponseOneSettingsAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(getGameStateResponseOneSettingsAgentBatteryActsMax).default(getGameStateResponseOneSettingsAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(getGameStateResponseOneSettingsMaxAgentsPerGodMax).default(getGameStateResponseOneSettingsMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(getGameStateResponseOneSettingsPenaltyWeightMin).default(getGameStateResponseOneSettingsPenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(getGameStateResponseOneSettingsDefenceRateMin).max(getGameStateResponseOneSettingsDefenceRateMax).default(getGameStateResponseOneSettingsDefenceRateDefault).describe("Probability that a god is also dealt a defence goal.")
  }),
  "roster": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "kind": zod.enum(["human", "ai"])
  })),
  "objectInstance": zod.object({
    "objectType": zod.string(),
    "args": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}."),
    "key": zod.string(),
    "label": zod.string(),
    "badges": zod.array(zod.object({
      "id": zod.string(),
      "emoji": zod.string(),
      "label": zod.string(),
      "kid": zod.string()
    }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
    "terms": zod.record(zod.string(), zod.number()),
    "display": zod.record(zod.string(), zod.unknown()).describe("Type-specific display tables (Grid: symbols and colours)."),
    "codec": zod.object({
      "format": zod.string(),
      "maxLength": zod.number().int()
    }),
    "mutators": zod.array(zod.object({
      "id": zod.string(),
      "name": zod.string(),
      "emoji": zod.string(),
      "summary": zod.string()
    })),
    "helpers": zod.array(zod.object({
      "name": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "signature": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "kid": zod.string(),
      "class": zod.string().optional(),
      "group": zod.enum(["read", "mutator"])
    }))
  }).describe("A fully applied object type (e.g. Grid(5,base10,rgby)), its display tables, mutators and prelude helpers.")
}).and(zod.object({
  "roomId": zod.string().nullable(),
  "roomShortCode": zod.string().nullable(),
  "ownerId": zod.string().nullable(),
  "status": zod.enum(["active", "ended"]),
  "winners": zod.array(zod.object({
    "deityId": zod.string(),
    "name": zod.string(),
    "kind": zod.string()
  })),
  "chat": zod.array(zod.object({
    "id": zod.string(),
    "authorId": zod.string(),
    "authorName": zod.string(),
    "kind": zod.string(),
    "text": zod.string(),
    "timestamp": zod.number()
  })).describe("Public room chat sent while this game was played (most recent 100)."),
  "roomActiveGame": zod.union([zod.object({
    "id": zod.string(),
    "shortCode": zod.string(),
    "phase": zod.string(),
    "startedAt": zod.number(),
    "roster": zod.array(zod.object({
      "id": zod.string(),
      "name": zod.string(),
      "kind": zod.enum(["human", "ai"])
    }))
  }).describe("The room's single active (not yet ended) game."), zod.null()]).describe("The room's active game now, which may be a newer one."),
  "utilityCatalog": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "emoji": zod.string(),
    "theme": zod.string(),
    "role": zod.enum(["reward", "penalty"]).describe("penalty families are dealt only as defence goals."),
    "tags": zod.array(zod.string()),
    "available": zod.boolean(),
    "badges": zod.array(zod.object({
      "id": zod.string(),
      "emoji": zod.string(),
      "label": zod.string(),
      "kid": zod.string()
    }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
    "locked": zod.object({
      "reason": zod.string().describe("Kid wording, e.g. needs \u2660 Suits: pick Playing cards."),
      "unlock": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).optional().describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.")
    }).optional()
  }).describe("A family any god might draw (never who drew what). Locked families say why, and the smallest settings change that unlocks them.")),
  "serverTime": zod.number()
})).describe("A game's own page. Public information only.");
var RoomActionParams = zod.object({
  "roomId": zod.coerce.string()
});
var roomActionBodySettingsInteractionRateHzDefault = 100;
var roomActionBodySettingsInteractionRateHzMin = 0;
var roomActionBodySettingsInteractionRateHzMax = 1e3;
var roomActionBodySettingsInteractionComputeMsDefault = 5;
var roomActionBodySettingsInteractionComputeMsMax = 1e3;
var roomActionBodySettingsAgentEnergyPerSecondDefault = 2;
var roomActionBodySettingsAgentEnergyPerSecondMin = 0;
var roomActionBodySettingsAgentEnergyPerSecondMax = 1e3;
var roomActionBodySettingsAgentBatteryActsDefault = 2;
var roomActionBodySettingsAgentBatteryActsMax = 1e3;
var roomActionBodySettingsMaxAgentsPerGodDefault = 200;
var roomActionBodySettingsMaxAgentsPerGodMax = 200;
var roomActionBodySettingsPenaltyWeightDefault = 1;
var roomActionBodySettingsPenaltyWeightMin = 0;
var roomActionBodySettingsDefenceRateDefault = 0;
var roomActionBodySettingsDefenceRateMin = 0;
var roomActionBodySettingsDefenceRateMax = 1;
var roomActionBodyTextMax = 4e3;
var roomActionBodyAiBudgetMin = 0;
var roomActionBodyAiBudgetMax = 1e6;
var RoomActionBody = zod.object({
  "action": zod.enum(["join", "leave", "ready", "settings", "start", "endGame", "addAi", "removeAi", "chat", "resume"]).describe("Settings and seats describe the NEXT game and can change only while no game is active. `leave` is refused for the owner and for a member seated in the active game. `endGame` (owner) ends the active game early and records its result."),
  "requestId": zod.string(),
  "revision": zod.number().int().optional(),
  "settings": zod.object({
    "language": zod.enum(["python", "typescript"]),
    "objectType": zod.enum(["Int", "string", "Grid"]).describe("The object type constructor."),
    "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.").describe("Its arguments. Only instantiations listed in Manifest.objectTypes[].offered are accepted."),
    "grammarId": zod.enum(["python-agent-v1", "typescript-agent-v1"]),
    "utilitySelectorId": zod.string(),
    "complexityFunctionId": zod.string(),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(roomActionBodySettingsInteractionRateHzMin).max(roomActionBodySettingsInteractionRateHzMax).default(roomActionBodySettingsInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(roomActionBodySettingsInteractionComputeMsMax).default(roomActionBodySettingsInteractionComputeMsDefault).describe("Guest execution CPU budget per interaction in milliseconds; excludes compilation and worker startup. Configurable only between games."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(roomActionBodySettingsAgentEnergyPerSecondMin).max(roomActionBodySettingsAgentEnergyPerSecondMax).default(roomActionBodySettingsAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(roomActionBodySettingsAgentBatteryActsMax).default(roomActionBodySettingsAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(roomActionBodySettingsMaxAgentsPerGodMax).default(roomActionBodySettingsMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(roomActionBodySettingsPenaltyWeightMin).default(roomActionBodySettingsPenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(roomActionBodySettingsDefenceRateMin).max(roomActionBodySettingsDefenceRateMax).default(roomActionBodySettingsDefenceRateDefault).describe("Probability that a god is also dealt a defence goal.")
  }).optional(),
  "ready": zod.boolean().optional(),
  "text": zod.string().max(roomActionBodyTextMax).optional(),
  "deityId": zod.string().optional(),
  "aiBudget": zod.number().int().min(roomActionBodyAiBudgetMin).max(roomActionBodyAiBudgetMax).optional(),
  "aiAgentId": zod.string().optional()
});
var roomActionResponseSettingsOneInteractionRateHzDefault = 100;
var roomActionResponseSettingsOneInteractionRateHzMin = 0;
var roomActionResponseSettingsOneInteractionRateHzMax = 1e3;
var roomActionResponseSettingsOneInteractionComputeMsDefault = 5;
var roomActionResponseSettingsOneInteractionComputeMsMax = 1e3;
var roomActionResponseSettingsOneAgentEnergyPerSecondDefault = 2;
var roomActionResponseSettingsOneAgentEnergyPerSecondMin = 0;
var roomActionResponseSettingsOneAgentEnergyPerSecondMax = 1e3;
var roomActionResponseSettingsOneAgentBatteryActsDefault = 2;
var roomActionResponseSettingsOneAgentBatteryActsMax = 1e3;
var roomActionResponseSettingsOneMaxAgentsPerGodDefault = 200;
var roomActionResponseSettingsOneMaxAgentsPerGodMax = 200;
var roomActionResponseSettingsOnePenaltyWeightDefault = 1;
var roomActionResponseSettingsOnePenaltyWeightMin = 0;
var roomActionResponseSettingsOneDefenceRateDefault = 0;
var roomActionResponseSettingsOneDefenceRateMin = 0;
var roomActionResponseSettingsOneDefenceRateMax = 1;
var RoomActionResponse = zod.object({
  "id": zod.string(),
  "shortCode": zod.string(),
  "ownerId": zod.string(),
  "ownerName": zod.string(),
  "createdAt": zod.number().nullable().describe("Unix milliseconds; null when the creation time is unknown."),
  "revision": zod.number().int(),
  "settings": zod.object({
    "language": zod.enum(["python", "typescript"]),
    "objectType": zod.enum(["Int", "string", "Grid"]).describe("The object type constructor."),
    "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.").describe("Its arguments. Only instantiations listed in Manifest.objectTypes[].offered are accepted."),
    "grammarId": zod.enum(["python-agent-v1", "typescript-agent-v1"]),
    "utilitySelectorId": zod.string(),
    "complexityFunctionId": zod.string(),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(roomActionResponseSettingsOneInteractionRateHzMin).max(roomActionResponseSettingsOneInteractionRateHzMax).default(roomActionResponseSettingsOneInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(roomActionResponseSettingsOneInteractionComputeMsMax).default(roomActionResponseSettingsOneInteractionComputeMsDefault).describe("Guest execution CPU budget per interaction in milliseconds; excludes compilation and worker startup. Configurable only between games."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(roomActionResponseSettingsOneAgentEnergyPerSecondMin).max(roomActionResponseSettingsOneAgentEnergyPerSecondMax).default(roomActionResponseSettingsOneAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(roomActionResponseSettingsOneAgentBatteryActsMax).default(roomActionResponseSettingsOneAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(roomActionResponseSettingsOneMaxAgentsPerGodMax).default(roomActionResponseSettingsOneMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(roomActionResponseSettingsOnePenaltyWeightMin).default(roomActionResponseSettingsOnePenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(roomActionResponseSettingsOneDefenceRateMin).max(roomActionResponseSettingsOneDefenceRateMax).default(roomActionResponseSettingsOneDefenceRateDefault).describe("Probability that a god is also dealt a defence goal.")
  }).describe("Settings for the next game. Each game keeps its own snapshot from launch."),
  "members": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "kind": zod.enum(["human", "ai"]),
    "ready": zod.boolean(),
    "status": zod.string().optional()
  })),
  "chat": zod.array(zod.object({
    "id": zod.string(),
    "authorId": zod.string(),
    "authorName": zod.string(),
    "kind": zod.string(),
    "text": zod.string(),
    "timestamp": zod.number()
  })),
  "activeGame": zod.union([zod.object({
    "id": zod.string(),
    "shortCode": zod.string(),
    "phase": zod.string(),
    "startedAt": zod.number(),
    "roster": zod.array(zod.object({
      "id": zod.string(),
      "name": zod.string(),
      "kind": zod.enum(["human", "ai"])
    }))
  }).describe("The room's single active (not yet ended) game."), zod.null()]),
  "serverTime": zod.number(),
  "objectInstance": zod.object({
    "objectType": zod.string(),
    "args": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}."),
    "key": zod.string(),
    "label": zod.string(),
    "badges": zod.array(zod.object({
      "id": zod.string(),
      "emoji": zod.string(),
      "label": zod.string(),
      "kid": zod.string()
    }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
    "terms": zod.record(zod.string(), zod.number()),
    "display": zod.record(zod.string(), zod.unknown()).describe("Type-specific display tables (Grid: symbols and colours)."),
    "codec": zod.object({
      "format": zod.string(),
      "maxLength": zod.number().int()
    }),
    "mutators": zod.array(zod.object({
      "id": zod.string(),
      "name": zod.string(),
      "emoji": zod.string(),
      "summary": zod.string()
    })),
    "helpers": zod.array(zod.object({
      "name": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "signature": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "kid": zod.string(),
      "class": zod.string().optional(),
      "group": zod.enum(["read", "mutator"])
    }))
  }).describe("A fully applied object type (e.g. Grid(5,base10,rgby)), its display tables, mutators and prelude helpers.").describe("The instantiation the next game will play."),
  "utilityCatalog": zod.array(zod.object({
    "id": zod.string(),
    "name": zod.string(),
    "emoji": zod.string(),
    "theme": zod.string(),
    "role": zod.enum(["reward", "penalty"]).describe("penalty families are dealt only as defence goals."),
    "tags": zod.array(zod.string()),
    "available": zod.boolean(),
    "badges": zod.array(zod.object({
      "id": zod.string(),
      "emoji": zod.string(),
      "label": zod.string(),
      "kid": zod.string()
    }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
    "locked": zod.object({
      "reason": zod.string().describe("Kid wording, e.g. needs \u2660 Suits: pick Playing cards."),
      "unlock": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).optional().describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.")
    }).optional()
  }).describe("A family any god might draw (never who drew what). Locked families say why, and the smallest settings change that unlocks them.")).describe("Public list of utility-function families gods may draw for these settings, with availability."),
  "aiBudget": zod.number().int(),
  "aiUsed": zod.number().int(),
  "aiInputTokens": zod.number().int().optional().describe("Provider-reported input tokens recorded for this game."),
  "aiOutputTokens": zod.number().int().optional().describe("Provider-reported output tokens recorded for this game.")
}).describe("A room is a persistent lobby: members, readiness and the owner's settings for the NEXT game. Each launched game has its own page (GET /games/{code}/state) and, once ended, an entry in GET /rooms/{roomId}/games.");
var requestDeviceBodyChallengeRegExp = new RegExp("^[A-Za-z0-9_-]{43}$");
var requestDeviceBodyClientLabelDefault = `Room assistant`;
var requestDeviceBodyClientLabelMax = 120;
var requestDeviceBodyPermissionDefault = `act`;
var RequestDeviceBody = zod.object({
  "roomId": zod.string().describe("Canonical room UUID or authority-resolved room alias"),
  "challenge": zod.string().regex(requestDeviceBodyChallengeRegExp).describe("Base64url S256 digest of the private verifier"),
  "clientLabel": zod.string().min(1).max(requestDeviceBodyClientLabelMax).default(requestDeviceBodyClientLabelDefault).describe("Self-reported printable label; not verified workspace or model identity"),
  "permission": zod.enum(["read", "act", "owner"]).describe("read permits personal observations; act additionally permits player commands. owner requires explicit approval by the room owner and includes room configuration, AI budget and seats, game lifecycle and player commands, but never global administration or access to another room.").default(requestDeviceBodyPermissionDefault)
});
var RequestDeviceResponse = zod.object({
  "deviceId": zod.string().uuid(),
  "delegateId": zod.string().uuid().describe("Unique generated delegated request/session identifier; equals deviceId"),
  "deviceSecret": zod.string().describe("Private proof material; never display in chat or logs"),
  "roomId": zod.string().uuid(),
  "userCode": zod.string(),
  "verificationPath": zod.string(),
  "expiresIn": zod.literal(300),
  "interval": zod.literal(2),
  "permission": zod.enum(["read", "act", "owner"]).describe("read permits personal observations; act additionally permits player commands. owner requires explicit approval by the room owner and includes room configuration, AI budget and seats, game lifecycle and player commands, but never global administration or access to another room.")
});
var GetDeviceDetailsQueryParams = zod.object({
  "code": zod.coerce.string()
});
var GetDeviceDetailsResponse = zod.object({
  "roomId": zod.string().uuid(),
  "roomCode": zod.string(),
  "clientLabel": zod.string().describe("Self-reported, not verified requester identity"),
  "permission": zod.enum(["read", "act", "owner"]).describe("read permits personal observations; act additionally permits player commands. owner requires explicit approval by the room owner and includes room configuration, AI budget and seats, game lifecycle and player commands, but never global administration or access to another room."),
  "canApprove": zod.boolean().optional().describe("Whether the signed-in human may approve this request. Owner grants require the current room owner."),
  "expiresAt": zod.coerce.date().describe("Approval-request deadline, not a redeemed grant's lifetime"),
  "status": zod.enum(["pending", "approved", "denied", "redeemed", "expired"])
});
var approveDeviceBodyCodeMin = 4;
var approveDeviceBodyCodeMax = 32;
var ApproveDeviceBody = zod.object({
  "code": zod.string().min(approveDeviceBodyCodeMin).max(approveDeviceBodyCodeMax)
});
var ApproveDeviceResponse = zod.object({
  "status": zod.string()
});
var denyDeviceBodyCodeMin = 4;
var denyDeviceBodyCodeMax = 32;
var DenyDeviceBody = zod.object({
  "code": zod.string().min(denyDeviceBodyCodeMin).max(denyDeviceBodyCodeMax)
});
var DenyDeviceResponse = zod.object({
  "status": zod.string()
});
var pollDeviceBodyDeviceIdMax = 256;
var pollDeviceBodyDeviceSecretMax = 256;
var pollDeviceBodyVerifierMax = 256;
var PollDeviceBody = zod.object({
  "deviceId": zod.string().min(1).max(pollDeviceBodyDeviceIdMax),
  "deviceSecret": zod.string().min(1).max(pollDeviceBodyDeviceSecretMax),
  "verifier": zod.string().min(1).max(pollDeviceBodyVerifierMax).describe("Private verifier whose S256 digest matches the request challenge")
});
var PollDeviceResponse = zod.object({
  "token": zod.string().describe("Private opaque bearer; do not display or persist to assistant output"),
  "expiresIn": zod.literal(900),
  "roomId": zod.string().uuid(),
  "godId": zod.string(),
  "delegateId": zod.string().uuid(),
  "permission": zod.enum(["read", "act", "owner"]).describe("read permits personal observations; act additionally permits player commands. owner requires explicit approval by the room owner and includes room configuration, AI budget and seats, game lifecycle and player commands, but never global administration or access to another room.")
});
var cancelDeviceBodyDeviceIdMax = 256;
var cancelDeviceBodyDeviceSecretMax = 256;
var cancelDeviceBodyVerifierMax = 256;
var CancelDeviceBody = zod.object({
  "deviceId": zod.string().min(1).max(cancelDeviceBodyDeviceIdMax),
  "deviceSecret": zod.string().min(1).max(cancelDeviceBodyDeviceSecretMax),
  "verifier": zod.string().min(1).max(cancelDeviceBodyVerifierMax).describe("Private verifier whose S256 digest matches the request challenge")
});
var CancelDeviceResponse = zod.object({
  "status": zod.string()
});
var ListDeviceGrantsResponse = zod.object({
  "grants": zod.array(zod.object({
    "delegateId": zod.string().uuid(),
    "roomId": zod.string().uuid(),
    "clientLabel": zod.string().describe("Self-reported, not verified requester identity"),
    "permission": zod.enum(["read", "act", "owner"]).describe("read permits personal observations; act additionally permits player commands. owner requires explicit approval by the room owner and includes room configuration, AI budget and seats, game lifecycle and player commands, but never global administration or access to another room."),
    "expiresAt": zod.coerce.date().describe("Persisted player-session expiry")
  }))
});
var RevokeDeviceGrantParams = zod.object({
  "delegateId": zod.coerce.string().uuid()
});
var RevokeDeviceGrantResponse = zod.object({
  "status": zod.string()
});
var RevokeDeviceResponse = zod.object({
  "status": zod.string()
});
var getManifestResponseDefaultsInteractionRateHzDefault = 100;
var getManifestResponseDefaultsInteractionRateHzMin = 0;
var getManifestResponseDefaultsInteractionRateHzMax = 1e3;
var getManifestResponseDefaultsInteractionComputeMsDefault = 5;
var getManifestResponseDefaultsInteractionComputeMsMax = 1e3;
var getManifestResponseDefaultsAgentEnergyPerSecondDefault = 2;
var getManifestResponseDefaultsAgentEnergyPerSecondMin = 0;
var getManifestResponseDefaultsAgentEnergyPerSecondMax = 1e3;
var getManifestResponseDefaultsAgentBatteryActsDefault = 2;
var getManifestResponseDefaultsAgentBatteryActsMax = 1e3;
var getManifestResponseDefaultsMaxAgentsPerGodDefault = 200;
var getManifestResponseDefaultsMaxAgentsPerGodMax = 200;
var getManifestResponseDefaultsPenaltyWeightDefault = 1;
var getManifestResponseDefaultsPenaltyWeightMin = 0;
var getManifestResponseDefaultsDefenceRateDefault = 0;
var getManifestResponseDefaultsDefenceRateMin = 0;
var getManifestResponseDefaultsDefenceRateMax = 1;
var GetManifestResponse = zod.object({
  "protocolVersion": zod.number().int(),
  "playerProtocol": zod.string().describe("Player protocol version accepted at /player/v1 (code-gods.player.v3)."),
  "minimumPlayers": zod.number().int(),
  "defaults": zod.object({
    "language": zod.enum(["python", "typescript"]),
    "objectType": zod.enum(["Int", "string", "Grid"]).describe("The object type constructor."),
    "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.").describe("Its arguments. Only instantiations listed in Manifest.objectTypes[].offered are accepted."),
    "grammarId": zod.enum(["python-agent-v1", "typescript-agent-v1"]),
    "utilitySelectorId": zod.string(),
    "complexityFunctionId": zod.string(),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(getManifestResponseDefaultsInteractionRateHzMin).max(getManifestResponseDefaultsInteractionRateHzMax).default(getManifestResponseDefaultsInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(getManifestResponseDefaultsInteractionComputeMsMax).default(getManifestResponseDefaultsInteractionComputeMsDefault).describe("Guest execution CPU budget per interaction in milliseconds; excludes compilation and worker startup. Configurable only between games."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(getManifestResponseDefaultsAgentEnergyPerSecondMin).max(getManifestResponseDefaultsAgentEnergyPerSecondMax).default(getManifestResponseDefaultsAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(getManifestResponseDefaultsAgentBatteryActsMax).default(getManifestResponseDefaultsAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(getManifestResponseDefaultsMaxAgentsPerGodMax).default(getManifestResponseDefaultsMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(getManifestResponseDefaultsPenaltyWeightMin).default(getManifestResponseDefaultsPenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(getManifestResponseDefaultsDefenceRateMin).max(getManifestResponseDefaultsDefenceRateMax).default(getManifestResponseDefaultsDefenceRateDefault).describe("Probability that a god is also dealt a defence goal.")
  }),
  "options": zod.object({
    "grammarId": zod.array(zod.object({
      "id": zod.string(),
      "label": zod.string(),
      "languages": zod.array(zod.string()),
      "objectTypes": zod.array(zod.string())
    })),
    "utilitySelectorId": zod.array(zod.object({
      "id": zod.string(),
      "label": zod.string(),
      "languages": zod.array(zod.string()),
      "objectTypes": zod.array(zod.string())
    })),
    "complexityFunctionId": zod.array(zod.object({
      "id": zod.string(),
      "label": zod.string(),
      "languages": zod.array(zod.string()),
      "objectTypes": zod.array(zod.string())
    }))
  }),
  "aiFunding": zod.object({
    "provider": zod.enum(["anthropic"]),
    "model": zod.string(),
    "billing": zod.enum(["direct"]),
    "inputUsdPerMillion": zod.number(),
    "outputUsdPerMillion": zod.number(),
    "configured": zod.boolean(),
    "live": zod.boolean()
  }),
  "runtimes": zod.array(zod.string()),
  "objectTypes": zod.array(zod.object({
    "id": zod.string().describe("Int, string or Grid."),
    "label": zod.string(),
    "emoji": zod.string(),
    "kid": zod.string(),
    "params": zod.array(zod.object({
      "kind": zod.enum(["component", "int"]),
      "id": zod.string(),
      "label": zod.string(),
      "slot": zod.string().optional(),
      "options": zod.array(zod.object({
        "id": zod.string(),
        "label": zod.string(),
        "emoji": zod.string(),
        "kid": zod.string()
      })).optional(),
      "min": zod.number().int().optional(),
      "max": zod.number().int().optional(),
      "presets": zod.array(zod.number().int()).optional()
    }).describe("One type parameter. `component` picks one of `options`; `int` is a number in [min, max], with the calibrated `presets`.")),
    "defaults": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}."),
    "classes": zod.array(zod.object({
      "id": zod.string(),
      "slot": zod.string(),
      "superclasses": zod.array(zod.string()),
      "badge": zod.object({
        "id": zod.string(),
        "emoji": zod.string(),
        "label": zod.string(),
        "kid": zod.string()
      }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")
    })),
    "offered": zod.array(zod.object({
      "key": zod.string().describe("Canonical key, e.g. Grid(5,base10,rgby)."),
      "args": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}."),
      "label": zod.string(),
      "badges": zod.array(zod.object({
        "id": zod.string(),
        "emoji": zod.string(),
        "label": zod.string(),
        "kid": zod.string()
      }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
      "classes": zod.array(zod.string())
    }).describe("An instantiation the server offers (every utility function dealable in it has a calibration table)."))
  })).describe("Object types for the settings pickers. Settings may choose only an instantiation listed in `offered`.")
});
var HealthCheckResponse = zod.object({
  "status": zod.string()
});
var GetPlayerObservationParams = zod.object({
  "roomId": zod.coerce.string()
});
var GetPlayerObservationResponse = zod.object({
  "version": zod.enum(["code-gods.player.v3"]),
  "roomId": zod.string(),
  "revision": zod.number().int(),
  "gameId": zod.string().optional(),
  "roomShortCode": zod.string().optional(),
  "gameShortCode": zod.string().optional(),
  "seated": zod.boolean().optional(),
  "planningEndsAt": zod.number().optional(),
  "pauseEndsAt": zod.number().optional(),
  "phase": zod.enum(["lobby", "planning", "running", "paused", "ended"]),
  "language": zod.enum(["python", "typescript"]),
  "instance": zod.object({
    "objectType": zod.string(),
    "args": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}."),
    "key": zod.string(),
    "label": zod.string(),
    "badges": zod.array(zod.object({
      "id": zod.string(),
      "emoji": zod.string(),
      "label": zod.string(),
      "kid": zod.string()
    }).describe("A capability in kid-friendly words, e.g. \u{1F51F} Place value or \u2660 Suits.")),
    "terms": zod.record(zod.string(), zod.number()),
    "display": zod.record(zod.string(), zod.unknown()).describe("Type-specific display tables (Grid: symbols and colours)."),
    "codec": zod.object({
      "format": zod.string(),
      "maxLength": zod.number().int()
    }),
    "mutators": zod.array(zod.object({
      "id": zod.string(),
      "name": zod.string(),
      "emoji": zod.string(),
      "summary": zod.string()
    })),
    "helpers": zod.array(zod.object({
      "name": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "signature": zod.object({
        "python": zod.string(),
        "typescript": zod.string()
      }),
      "kid": zod.string(),
      "class": zod.string().optional(),
      "group": zod.enum(["read", "mutator"])
    }))
  }).optional().describe("A fully applied object type (e.g. Grid(5,base10,rgby)), its display tables, mutators and prelude helpers."),
  "economy": zod.object({
    "energyPerSecond": zod.number(),
    "agentEnergyPerSecond": zod.number(),
    "agentBatteryActs": zod.number(),
    "maxAgentsPerGod": zod.number().int(),
    "penaltyWeight": zod.number(),
    "worldSeconds": zod.number()
  }).optional(),
  "self": zod.object({
    "godId": zod.string(),
    "label": zod.string(),
    "isAI": zod.boolean(),
    "energy": zod.number(),
    "ready": zod.boolean(),
    "pauseUsed": zod.boolean().optional(),
    "utility": zod.object({
      "familyId": zod.string(),
      "emoji": zod.string(),
      "name": zod.string(),
      "theme": zod.string(),
      "summary": zod.string(),
      "language": zod.enum(["python", "typescript"]),
      "source": zod.string(),
      "penalty": zod.object({
        "familyId": zod.string(),
        "emoji": zod.string(),
        "name": zod.string(),
        "summary": zod.string(),
        "comparative": zod.string().describe("The \u26A0\uFE0F line reads '\u26A0\uFE0F <comparative> than 90% of objects'."),
        "source": zod.string().describe("Defines penalty(x): bigger is worse.")
      }).optional()
    }).optional().describe("A god's own kid card, with an optional defence goal.")
  }),
  "objects": zod.array(zod.object({
    "id": zod.string(),
    "value": zod.union([zod.number().int(), zod.string()]),
    "own": zod.object({
      "ordinal": zod.union([zod.number(), zod.array(zod.number())]).describe("The utility function's value, a number or a tuple compared lexicographically."),
      "rewardBits": zod.number().describe("\u2728 surprisal of the ordinal under the spawn prior."),
      "penaltyBits": zod.number().optional().describe("\u26A0\uFE0F defence-goal penalty bits (only with a defence goal)."),
      "netBits": zod.number()
    }).describe("One god's own score of one object (private to that god)."),
    "peerNetBits": zod.number(),
    "peerCare": zod.number(),
    "payoff": zod.number()
  })),
  "agents": zod.array(zod.object({
    "id": zod.string(),
    "source": zod.string(),
    "createdAt": zod.number(),
    "summonCost": zod.number().describe("Description bits paid once from god energy (ast-bytes-v1)."),
    "expectedActCost": zod.number().describe("Mean act cost over 16 reference objects, measured at summon."),
    "energy": zod.number(),
    "eligible": zod.boolean(),
    "acts": zod.number().int(),
    "spent": zod.number()
  }).describe("One of your own agents. It acts only while eligible (energy \u2265 expectedActCost); negative energy is a cooldown.").and(zod.object({
    "language": zod.enum(["python", "typescript"])
  }))),
  "transformations": zod.array(zod.object({
    "id": zod.string(),
    "agentId": zod.string(),
    "before": zod.union([zod.number().int(), zod.string()]),
    "after": zod.union([zod.number().int(), zod.string()]),
    "calls": zod.array(zod.array(zod.unknown())).optional(),
    "cost": zod.number().optional()
  })),
  "leaderboard": zod.array(zod.object({
    "godId": zod.string(),
    "label": zod.string(),
    "isAI": zod.boolean(),
    "totalPayoff": zod.number()
  })),
  "chat": zod.array(zod.object({
    "id": zod.string(),
    "godId": zod.string(),
    "label": zod.string(),
    "isAI": zod.boolean(),
    "text": zod.string()
  }))
});
var SendPlayerCommandParams = zod.object({
  "roomId": zod.coerce.string()
});
var sendPlayerCommandBodyCommandSourceMax = 16384;
var sendPlayerCommandBodyCommandTextMax = 2e3;
var SendPlayerCommandBody = zod.object({
  "version": zod.enum(["code-gods.player.v3"]),
  "commandId": zod.string().uuid(),
  "gameId": zod.string().optional().describe("Required for validate, summon, pause and destroy."),
  "command": zod.object({
    "type": zod.enum(["validate", "summon", "ready", "pause", "chat", "destroy"]),
    "language": zod.enum(["python", "typescript"]).optional(),
    "source": zod.string().max(sendPlayerCommandBodyCommandSourceMax).optional().describe("Defines agent(obj) returning mutator calls, e.g. def agent(x): return [add(1)]."),
    "ready": zod.boolean().optional(),
    "text": zod.string().max(sendPlayerCommandBodyCommandTextMax).optional(),
    "agentId": zod.string().optional().describe("destroy only. One of your own agents.")
  }).describe("One of validate/summon {language, source}, ready {ready}, pause, chat {text}, destroy {agentId}.")
});
var SendPlayerCommandResponse = zod.object({
  "commandId": zod.string(),
  "accepted": zod.boolean(),
  "message": zod.string(),
  "validation": zod.object({
    "valid": zod.boolean(),
    "cost": zod.number().describe("Summon price in bits (ast-bytes-v1)."),
    "expectedActCost": zod.number().describe("Mean act cost over 16 reference objects."),
    "diagnostics": zod.array(zod.string())
  }).optional()
});

// src/routes/rooms.ts
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS2, SETTINGS_OPTIONS, instantiationOf as instantiationOf4, validateSettings as validateSettings4 } from "@workspace/game-core";
import { OBJECT_TYPES, instanceInfo as instanceInfo2 } from "@workspace/game-types";
import { VERSION as PLAYER_PROTOCOL } from "@workspace/player-client";

// src/game/calibration-fallback.ts
import { softHinge } from "@workspace/game-core";
import {
  INT_PRESETS,
  STRING_PRESETS,
  objectType,
  seededRng
} from "@workspace/game-types";
import { compareOrdinals, context, evaluator, family, paramsKey } from "@workspace/game-utilities";
var SAMPLES = 2048;
var MIN_SLOPE_BITS = 0.05;
var tables = /* @__PURE__ */ new Map();
var MAX_TABLES = 1024;
function lookup(table, ordinal) {
  const L = table.levels;
  let lo = 0, hi = L.length - 1, i = -1;
  while (lo <= hi) {
    const mid = lo + hi >> 1;
    if (compareOrdinals(L[mid][0], ordinal) <= 0) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (i < 0) return 0;
  const [top, bits] = L[i];
  if (i < L.length - 1 || compareOrdinals(top, ordinal) === 0) return bits;
  const steps = typeof top === "number" && typeof ordinal === "number" ? ordinal - top : 1;
  return bits + table.slope * steps;
}
function surprisal(table, ordinal) {
  return lookup(table, ordinal);
}
function penaltyMeanBits(table) {
  return table.penaltyMeanBits ?? 0;
}
function tableFor(draw, inst) {
  const f = family(draw.familyId);
  if (f.objectType !== inst.objectType) return void 0;
  const canonical = f.canonical(draw.params, context(inst));
  const key = `${inst.key}\0${draw.familyId}\0${paramsKey(canonical)}`;
  const hit = tables.get(key);
  if (hit) return hit;
  const T = objectType(inst.objectType), codec = T.codec(inst), rng = seededRng(`fallback-calibration:${key}`);
  const score = evaluator({ familyId: draw.familyId, params: canonical }, inst);
  const ordinals = [];
  for (let i = 0; i < SAMPLES; i++) ordinals.push(score(codec.encode(T.spawn(inst, rng))));
  ordinals.sort(compareOrdinals);
  const levels = [];
  for (let i = 0; i < ordinals.length; i++) {
    if (i > 0 && compareOrdinals(ordinals[i - 1], ordinals[i]) === 0) continue;
    levels.push([ordinals[i], -Math.log2((ordinals.length - i) / ordinals.length)]);
  }
  const n = levels.length;
  const slope = n >= 2 && typeof levels[n - 1][0] === "number" && typeof levels[Math.max(0, n - 5)][0] === "number" ? Math.max(MIN_SLOPE_BITS, (levels[n - 1][1] - levels[Math.max(0, n - 5)][1]) / Math.max(1, levels[n - 1][0] - levels[Math.max(0, n - 5)][0])) : 1;
  const base = { key, family: draw.familyId, instance: inst.key, levels, slope };
  const table = f.role === "penalty" ? { ...base, penaltyMeanBits: ordinals.reduce((sum, o) => sum + softHinge(lookup(base, o)), 0) / ordinals.length } : base;
  if (tables.size >= MAX_TABLES) tables.delete(tables.keys().next().value);
  tables.set(key, table);
  return table;
}
function hasTable(draw, inst) {
  return family(draw.familyId).objectType === inst.objectType;
}
var OFFERED = {
  Int: INT_PRESETS,
  string: STRING_PRESETS,
  Grid: [{ size: 5, symbols: "base10", colours: "rgby" }, { size: 4, symbols: "cards", colours: "rainbow6" }, { size: 3, symbols: "base10", colours: "rgb" }]
};
function offeredInstantiations(objectTypeId) {
  const T = objectType(objectTypeId);
  return (OFFERED[objectTypeId] ?? []).map((args) => T.instantiate(args));
}

// src/game/store.ts
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, defaultSettingsFor, uniquePrefixes, resolveIdentifier, encodeUuid, validateSettings } from "@workspace/game-core";

// src/game/projection.ts
import { instantiationOf, leaderboard, personalView, salience } from "@workspace/game-core";
import { instanceInfo } from "@workspace/game-types";
import { card, context as context2, publicCatalog } from "@workspace/game-utilities";

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
  const c = card(deity.utility, context2(instantiationOf(game.settings)));
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
    expectedActCost: agent.expectedActCost,
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
  return publicCatalog(instantiationOf(settings));
}
var rosterEntry = ({ id, name, kind }) => ({ id, name, kind });
var isActive = (game) => !!game && game.phase !== "ended";
function publicGame(game) {
  return {
    id: game.id,
    shortCode: game.shortCode,
    phase: game.phase,
    worldSeconds: game.worldSeconds,
    planningEndsAt: game.planningEndsAt,
    pauseEndsAt: game.pauseEndsAt,
    agentCount: game.agents.length,
    leaderboard: standings(game),
    objects: game.objects.map((o) => ({ id: o.id, value: o.value, version: o.version, salience: salience(netMap(o)) })),
    startedAt: game.createdAt,
    endedAt: game.endedAt ?? null,
    endReason: game.endReason ?? null,
    recoveryReason: game.recoveryReason ?? null,
    settings: game.settings,
    roster: game.roster.map(rosterEntry),
    objectInstance: objectInstance(game.settings)
  };
}
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
    scoring: SCORING
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
function gameChat(chat, game) {
  const end = game.endedAt ?? (game.phase === "ended" ? Infinity : Date.now());
  return chat.filter((m) => m.timestamp >= game.createdAt && m.timestamp <= end).slice(-100);
}
function publicGameView(game, room) {
  const record2 = gameRecord(room?.id ?? "", game);
  return {
    ...publicGame(game),
    roomId: room?.id ?? null,
    roomShortCode: room?.shortCode ?? null,
    ownerId: room?.ownerId ?? null,
    status: game.phase === "ended" ? "ended" : "active",
    winners: game.phase === "ended" ? record2.winners : [],
    chat: room ? gameChat(room.chat, game) : [],
    roomActiveGame: room ? activeGameRef(room) : null,
    utilityCatalog: catalogFor(game.settings),
    serverTime: Date.now()
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
var rooms = /* @__PURE__ */ new Map();
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
    const targetIndex = original.game.objects.findIndex((object2) => object2.id === objectId);
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
    if (!added || added.id === original.game.events.at(-1)?.id || added.type === "object.spawned" || added.type === "object.transformed" && !draft.game.objects.some((object2) => object2.id === added.object.id) || agentId !== void 0 && added.agent?.id !== agentId) throw new Error("Invalid interaction mutation");
    draft.seq++;
    const buffer = interactionBuffers.get(id) ?? { latest: draft, events: [] };
    buffer.latest = draft;
    buffer.events.push(added);
    interactionBuffers.set(id, buffer);
    bufferedInteractions++;
    rooms.set(id, draft);
    scheduleInteractionFlush(buffer.events.length >= 32 || bufferedInteractions >= 128 ? 0 : 100);
  });
}
function rehydrateInteractions(checkpoint, batches) {
  const room = structuredClone(checkpoint);
  const game = room.game;
  if (!game) return room;
  game.events ??= [];
  game.agents ??= [];
  const byId = new Map(game.objects.map((object2, index) => [object2.id, index]));
  for (const batch of [...batches].sort((a, b) => Number(a.end_seq) - Number(b.end_seq))) {
    if (batch.room_id !== room.id || batch.game_id !== game.id) continue;
    const end = Number(batch.end_seq);
    if (!Number.isSafeInteger(end) || !Array.isArray(batch.events) || !batch.events.length)
      throw new Error("Invalid durable interaction batch");
    if (end <= room.seq) continue;
    const start = end - batch.events.length;
    if (start > room.seq) throw new Error("Durable interaction sequence gap");
    for (const event of batch.events.slice(room.seq - start)) {
      if (event.gameId !== game.id || event.type !== "object.transformed" && event.type !== "agent.failed")
        throw new Error("Invalid durable interaction event");
      if (event.type === "object.transformed") {
        const index = byId.get(event.object.id);
        if (index === void 0 || event.object.version !== game.objects[index].version + 1 || event.before !== game.objects[index].value)
          throw new Error("Invalid durable interaction object transition");
        game.objects[index] = structuredClone(event.object);
      }
      if (event.agent) {
        const agent = game.agents.findIndex((a) => a.id === event.agent.id);
        if (agent < 0) throw new Error("Invalid durable interaction agent");
        const { account, acts, spent } = structuredClone(event.agent);
        game.agents[agent] = { ...game.agents[agent], account, acts, spent };
      }
      game.events.push(structuredClone(event));
      room.seq++;
    }
    if (room.seq !== end) throw new Error("Invalid durable interaction end sequence");
  }
  if (game.events.length > 5e3) game.events = game.events.slice(-5e3);
  return room;
}
async function closeStore() {
  closing = true;
  if (flushTimer) clearTimeout(flushTimer);
  await Promise.allSettled([...tails.values()]);
  await flushInteractions();
}
var listeners = /* @__PURE__ */ new Set();
var allRooms = () => [...rooms.values()];
function resolveRoom(id) {
  try {
    return rooms.get(resolveIdentifier(id, [...rooms.keys()]));
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
        const prior2 = existing.rows.find((row) => row.id === alias.id);
        if (prior2 && prior2.prefix_length !== alias.prefixLength) {
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
      for (const live of rooms.values()) if (live.game?.id === alias.id) live.game.shortCode = alias.shortCode;
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
  const prior2 = tails.get(id) ?? Promise.resolve();
  const next = prior2.catch(() => {
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
    rooms.set(draft.id, draft);
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
async function roomHistory(roomId, limit = 100) {
  const rows = await pool.query(`SELECT id,prefix_length,summary FROM cg_games WHERE room_id=$1 AND summary->>'scoring'='${SCORING}'
    ORDER BY started_at DESC NULLS LAST LIMIT $2`, [roomId, limit]);
  return rows.rows.map((row) => ({ ...row.summary, shortCode: encodeUuid(row.id).slice(0, row.prefix_length) }));
}
async function findGame(code) {
  const normalized = code.trim().toUpperCase();
  for (const room of rooms.values()) {
    const game2 = room.game;
    if (game2 && (game2.shortCode.toUpperCase() === normalized || game2.id.toUpperCase() === normalized)) return { game: game2, roomId: room.id, live: true };
  }
  const all = await pool.query("SELECT id,room_id,prefix_length FROM cg_games");
  let id;
  try {
    id = resolveIdentifier(code, all.rows.map((row2) => row2.id));
  } catch (error) {
    throw Object.assign(error, { status: 404 });
  }
  const roomId = all.rows.find((row2) => row2.id === id).room_id;
  const live = rooms.get(roomId)?.game;
  if (live?.id === id) return { game: live, roomId, live: true };
  const row = await pool.query("SELECT state,prefix_length FROM cg_games WHERE id=$1", [id]);
  const game = row.rows[0]?.state;
  if (!game || !readableGame(game)) throw Object.assign(new Error("Game not found"), { status: 404 });
  game.shortCode = encodeUuid(id).slice(0, row.rows[0].prefix_length);
  return { game, roomId, live: false };
}
var isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
function readableGame(game) {
  try {
    if (!isObject(game) || game.scoring !== SCORING || typeof game.id !== "string") return false;
    validateSettings(game.settings);
    return Array.isArray(game.roster) && Array.isArray(game.deities) && Array.isArray(game.events) && Array.isArray(game.objects) && game.objects.every((o) => isObject(o) && isObject(o.scores)) && Array.isArray(game.agents) && game.agents.every((a) => isObject(a) && isObject(a.account) && typeof a.expectedActCost === "number");
  } catch {
    return false;
  }
}
function readableRoom(room) {
  try {
    if (!isObject(room) || typeof room.id !== "string" || typeof room.ownerId !== "string" || !Array.isArray(room.members) || !Array.isArray(room.chat) || !isObject(room.receipts) || !isObject(room.aiDaily) || !Number.isSafeInteger(room.seq) || !Number.isSafeInteger(room.revision) || typeof room.aiBudget !== "number" || typeof room.aiUsed !== "number" || typeof room.aiReservedUsd !== "number") return false;
    validateSettings(room.settings);
    return room.game === null || readableGame(room.game);
  } catch {
    return false;
  }
}
function resetRoom(raw, afterSeq) {
  const stored = isObject(raw) ? raw : {};
  return {
    id: String(stored.id),
    shortCode: typeof stored.shortCode === "string" ? stored.shortCode : "",
    ownerId: String(stored.ownerId),
    createdAt: typeof stored.createdAt === "number" ? stored.createdAt : null,
    revision: (Number.isSafeInteger(stored.revision) ? stored.revision : 0) + 1,
    settings: defaultSettingsFor(DEFAULT_SETTINGS.objectType),
    members: Array.isArray(stored.members) ? stored.members.map((m) => ({ ...m, ready: false })) : [],
    chat: Array.isArray(stored.chat) ? stored.chat : [],
    game: null,
    aiBudget: 0,
    aiUsed: 0,
    aiReservedUsd: 0,
    aiDaily: { day: "", usd: 0, calls: [] },
    receipts: {},
    seq: afterSeq + 1
  };
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
    const nextRooms = [...rooms.values()].map((r) => structuredClone(r)).concat(room);
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
      for (const next of nextRooms) rooms.set(next.id, next);
      return room;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
async function initializeStore() {
  const data = await pool.query("SELECT id,state FROM cg_rooms");
  for (const row of data.rows) {
    const checkpoint = row.state;
    const batches = await pool.query(
      "SELECT room_id,game_id,end_seq,events FROM cg_interaction_batches WHERE room_id=$1 AND end_seq > $2 ORDER BY end_seq",
      [row.id, Number.isSafeInteger(checkpoint?.seq) ? checkpoint.seq : -1]
    );
    if (!readableRoom(checkpoint)) {
      const lastSeq = Math.max(Number.isSafeInteger(checkpoint?.seq) ? checkpoint.seq : 0, ...batches.rows.map((b) => Number(b.end_seq)));
      const room2 = resetRoom({ ...checkpoint, id: row.id }, lastSeq);
      await persist(room2);
      rooms.set(room2.id, room2);
      continue;
    }
    const room = rehydrateInteractions(checkpoint, batches.rows);
    if (room.game && room.game.phase !== "ended") {
      room.game.phase = "recovery";
      room.game.recoveryReason = "Server restarted. The game resumes when a player returns.";
      room.game.autoResume = true;
      room.seq++;
      await persist(room);
    }
    rooms.set(room.id, room);
  }
}

// src/game/engine.ts
import { randomBytes as randomBytes2, randomUUID as randomUUID2 } from "node:crypto";
import {
  chargeAct,
  instantiationOf as instantiationOf3,
  lifetimeSeconds,
  newAgentAccount,
  poissonIntervalSeconds,
  uniquePrefixes as uniquePrefixes2,
  validateSettings as validateSettings3
} from "@workspace/game-core";
import {
  applyCalls,
  MIN_FAILED_ACT_BITS,
  objectType as objectType3,
  seededRng as seededRng2
} from "@workspace/game-types";

// src/game/adapters.ts
import { codecOf, instantiationOf as instantiationOf2, netBits, softHinge as softHinge2, validateSettings as validateSettings2 } from "@workspace/game-core";
import { RuntimeError } from "@workspace/game-runtime";
import { objectType as objectType2 } from "@workspace/game-types";
import { divineLottery, evaluator as evaluator2, selector } from "@workspace/game-utilities";
import { randomBytes } from "node:crypto";
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
      const n = BigInt(`0x${randomBytes(bytes).toString("hex")}`);
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
  const cacheKey = `${inst.key}\0${settings.interactionComputeMs}`;
  let cached = actSettingsCache.get(cacheKey);
  if (!cached) {
    const parts = objectType2(inst.objectType).prelude(inst);
    cached = Object.freeze({
      objectType: inst.objectType,
      wireMaxLength: codecOf(settings).maxLength,
      interactionComputeMs: settings.interactionComputeMs,
      prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts }
    });
    if (actSettingsCache.size >= 64) actSettingsCache.delete(actSettingsCache.keys().next().value);
    actSettingsCache.set(cacheKey, cached);
  }
  return cached;
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
    async act(source, input, settings) {
      const selected = pool2(settings);
      return guarded(() => admitted(() => selected.act(source, input, actSettings(settings))));
    },
    async validate(source, samples, settings) {
      const selected = pool2(settings);
      return guarded(() => admitted(() => selected.validate(source, samples, actSettings(settings))));
    }
  };
}
function createUtilitiesAdapter() {
  const table = (draw, settings) => {
    const found = tableFor(draw, instantiationOf2(settings));
    if (!found) throw new Error(`No calibration table for ${draw.familyId} in ${instantiationOf2(settings).key}`);
    return found;
  };
  return {
    deal(settings, count) {
      validateSettings2(settings);
      const inst = instantiationOf2(settings);
      return selector(settings.utilitySelectorId ?? divineLottery.id).select(inst, count, cryptoRng, {
        defenceRate: settings.defenceRate,
        hasTable: (draw) => hasTable(draw, inst)
      });
    },
    score(settings, descriptor, value) {
      const inst = instantiationOf2(settings);
      const ordinal = evaluator2(descriptor, inst)(value);
      const rewardBits = surprisal(table(descriptor, settings), ordinal);
      if (!descriptor.penalty) return { ordinal, rewardBits, netBits: netBits({ rewardBits }, settings.penaltyWeight) };
      const penaltyTable = table(descriptor.penalty, settings);
      const penaltyOrdinal = evaluator2(descriptor.penalty, inst)(value);
      const penaltyBits = softHinge2(surprisal(penaltyTable, penaltyOrdinal));
      return {
        ordinal,
        rewardBits,
        penaltyOrdinal,
        penaltyBits,
        netBits: netBits({ rewardBits, penaltyBits, penaltyMeanBits: penaltyMeanBits(penaltyTable) }, settings.penaltyWeight)
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
function aiFundingStatus() {
  return {
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    billing: "direct",
    configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()),
    live: true
  };
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
    const rooms2 = this.candidates();
    const start = (rooms2.indexOf(this.cursor) + 1) % (rooms2.length || 1);
    const live = new Set(rooms2);
    for (const roomId of this.deadlines.keys()) if (!live.has(roomId)) this.deadlines.delete(roomId);
    for (let i = 0; i < rooms2.length && this.flights.size < 4; i++) {
      const roomId = rooms2[(start + i) % rooms2.length];
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
var openUniform = () => (randomBytes2(6).readUIntBE(0, 6) + 0.5) / 281474976710656;
var below = (bound) => cryptoRng.int(bound);
function scoresOf(game, value) {
  const { utilities: utilities2 } = requireAdapters();
  return Object.fromEntries(game.deities.map((d) => [d.id, utilities2.score(game.settings, d.utility, value)]));
}
var occupied = (game, value) => game.objects.some((o) => o.value === value);
function spawnValue(settings) {
  const inst = instantiationOf3(settings), T = objectType3(inst.objectType);
  return T.codec(inst).encode(T.spawn(inst, cryptoRng));
}
function spawn(game) {
  let value = spawnValue(game.settings);
  for (let attempt = 0; occupied(game, value); attempt++) {
    if (attempt >= 100) return;
    value = spawnValue(game.settings);
  }
  const object2 = { id: randomUUID2(), value, version: 0, scores: scoresOf(game, value) };
  game.objects.push(object2);
  recordEvent(game, { id: randomUUID2(), gameId: game.id, type: "object.spawned", object: structuredClone(object2), timestamp: Date.now() });
}
function recordEvent(game, event) {
  game.events.push(event);
  if (game.events.length > 5e3) game.events.splice(0, game.events.length - 5e3);
}
var REFERENCE_SPAWNS = 16;
var referenceCache = /* @__PURE__ */ new Map();
function referenceSpawns(settings) {
  const inst = instantiationOf3(settings);
  let values = referenceCache.get(inst.key);
  if (!values) {
    const T = objectType3(inst.objectType), codec = T.codec(inst), rng = seededRng2(`code-gods:reference-spawns:${inst.key}`);
    values = Array.from({ length: REFERENCE_SPAWNS }, () => codec.encode(T.spawn(inst, rng)));
    if (referenceCache.size >= 64) referenceCache.delete(referenceCache.keys().next().value);
    referenceCache.set(inst.key, values);
  }
  return values;
}
function actOutcome(settings, before, result) {
  if ("error" in result) {
    const cost = { decision: MIN_FAILED_ACT_BITS, erasure: 0, motion: 0, total: MIN_FAILED_ACT_BITS };
    return { ok: false, reason: result.error, cost };
  }
  const inst = instantiationOf3(settings);
  return applyCalls(objectType3(inst.objectType), inst, before, result.calls);
}
var describeOutcome = (label, outcome) => outcome.ok ? `${label}: ${outcome.calls.length} mutator call${outcome.calls.length === 1 ? "" : "s"} (${outcome.calls.map((c) => c[0]).join(", ")}), ${outcome.cost.total.toFixed(2)} bits` : `${label}: the act would fail (${outcome.reason}) and still cost ${outcome.cost.total.toFixed(2)} bits`;
async function examineAgent(settings, source, live) {
  const { runtime: runtime2 } = requireAdapters();
  const references = referenceSpawns(settings);
  const measuring = { ...settings, interactionComputeMs: Math.min(1e3, Math.max(settings.interactionComputeMs, 50)) };
  let validated;
  try {
    validated = await runtime2.validate(source, [...references, ...live], measuring);
  } catch (error) {
    if (!isAgentFault(error)) throw error;
    throw Object.assign(new Error(error.message.slice(0, 1e3)), { agentFault: true });
  }
  if (!Number.isSafeInteger(validated.cost) || validated.cost < 0) throw new Error("Invalid runtime cost");
  const costs = references.map((value, i) => actOutcome(settings, value, { calls: validated.outputs[i] }).cost.total);
  const expectedActCost = costs.reduce((a, b) => a + b, 0) / costs.length;
  const diagnostics = (live.length ? live : references.slice(0, 1)).map((value, i) => describeOutcome(
    live.length ? `On object ${i + 1}` : "On a sample object",
    actOutcome(settings, value, { calls: validated.outputs[live.length ? references.length + i : 0] })
  ));
  diagnostics.push(`Expected cost per act ${expectedActCost.toFixed(2)} bits (mean over ${REFERENCE_SPAWNS} reference objects); summon price ${validated.cost} bits.`);
  return { cost: validated.cost, expectedActCost, diagnostics };
}
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
  const id = randomUUID2(), now = Date.now();
  const gameIds = (await pool.query("SELECT id FROM cg_games")).rows.map((row) => row.id);
  const aliases = uniquePrefixes2([...gameIds, id]);
  const game = {
    id,
    shortCode: aliases.find((a) => a.id === id).shortCode,
    phase: "planning",
    scoring: "information-v1",
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
function endGame(room, actor) {
  owner(room, actor);
  const game = room.game;
  if (!game || game.phase === "ended") throw new Error("There is no active game to end");
  game.executionEpoch = (game.executionEpoch ?? 0) + 1;
  game.phase = "ended";
  game.endReason = "owner";
  delete game.autoResume;
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
    const message = { id: randomUUID2(), authorId: actor.id, authorName: room.members.find((m) => m.id === actor.id).name, kind: actor.kind, text, timestamp: Date.now() };
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
      const examined = await examineAgent(game.settings, source, game.objects.slice(0, 3).map((o) => o.value));
      if (input.command === "agent.validate") {
        result = { valid: true, cost: examined.cost, expectedActCost: examined.expectedActCost, diagnostics: examined.diagnostics };
        room.receipts[key] = { hash: digest, result };
        return result;
      }
      if (godEnergy(game, deity) < examined.cost) throw new Error("Insufficient energy");
      if (game.agents.filter((a) => a.ownerId === actor.id).length >= game.settings.maxAgentsPerGod)
        throw new Error(`This god has reached the ${game.settings.maxAgentsPerGod}-agent resource limit`);
      const agent = {
        id: randomUUID2(),
        ownerId: actor.id,
        source,
        createdAt: Date.now(),
        summonCost: examined.cost,
        expectedActCost: examined.expectedActCost,
        account: newAgentAccount(worldNow(game)),
        acts: 0,
        spent: 0
      };
      deity.spent += examined.cost;
      game.agents.push(agent);
      result = { id: agent.id, summonCost: agent.summonCost, expectedActCost: agent.expectedActCost };
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
  const cost = outcome.ok && !duplicate ? outcome.cost : (() => {
    const decision = Math.max(MIN_FAILED_ACT_BITS, outcome.cost.decision);
    return { decision, erasure: 0, motion: 0, total: decision };
  })();
  const account = chargeAct(settledAccount(g.settings, agent, worldNow(g, nowMs)), cost.total);
  const state = { id: agent.id, account, acts: agent.acts + 1, spent: agent.spent + cost.total };
  g.agents[agentIndex] = { ...agent, account, acts: state.acts, spent: state.spent };
  const common = { id: randomUUID2(), gameId: g.id, timestamp: nowMs, agentId: agent.id, ownerId: agent.ownerId };
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
      const object2 = objects[below(objects.length)];
      const agent = agents[below(agents.length)];
      const settings = structuredClone(game.settings);
      const snapshot = {
        gameId: game.id,
        objectId: object2.id,
        version: object2.version,
        before: object2.value,
        agentId: agent.id,
        ownerId: agent.ownerId,
        pauseEndsAt: game.pauseEndsAt,
        epoch: game.executionEpoch ?? 0
      };
      const source = agent.source;
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
        objectId: object2.id,
        rate: game.settings.interactionRateHz,
        execute: async () => {
          try {
            return { calls: (await requireAdapters().runtime.act(source, snapshot.before, settings)).calls };
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

// src/game/agent-library.ts
import { z } from "zod";
var agentInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().min(1),
  prompt: z.string().max(1e4)
}).strict();
var agentUpdateSchema = agentInputSchema.extend({ revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
var agentRevisionSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
function definition(row) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    revision: row.revision,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}
async function getAgentDefinition(id) {
  const result = await pool.query("SELECT * FROM cg_ai_agents WHERE id=$1", [id]);
  return result.rows[0] ? definition(result.rows[0]) : void 0;
}

// src/routes/rooms.ts
var router = Router();
var objectTypes;
function objectTypesManifest() {
  return objectTypes ??= OBJECT_TYPES.map((T) => ({
    id: T.id,
    label: T.label,
    emoji: T.emoji,
    kid: T.kid,
    params: T.params,
    defaults: T.defaults,
    classes: T.classes.map((c) => ({ id: c.id, slot: c.slot, superclasses: c.superclasses, badge: c.badge })),
    offered: offeredInstantiations(T.id).map((inst) => {
      const info = instanceInfo2(inst);
      return { key: inst.key, args: inst.args, label: info.label, badges: info.badges, classes: inst.classes };
    })
  }));
}
function assertOffered(settings) {
  const inst = instantiationOf4(settings);
  if (!offeredInstantiations(settings.objectType).some((offered) => offered.key === inst.key))
    throw new Error(`${inst.key} is not offered: choose one of the listed ${settings.objectType} settings`);
}
router.get("/manifest", (_req, res) => res.json({
  protocolVersion: 1,
  playerProtocol: PLAYER_PROTOCOL,
  minimumPlayers: 3,
  defaults: DEFAULT_SETTINGS2,
  runtimes: runtime?.languages ?? [],
  options: SETTINGS_OPTIONS,
  aiFunding: aiFundingStatus(),
  objectTypes: objectTypesManifest()
}));
router.get("/rooms", (req, res) => {
  const actor = requireIdentity(req);
  res.json(allRooms().filter((r) => (actor.scope === "browser" || actor.roomId === r.id) && r.members.some((m) => m.id === actor.id)).map((r) => ({
    id: r.id,
    shortCode: r.shortCode,
    ownerId: r.ownerId,
    ownerName: r.members.find((m) => m.id === r.ownerId)?.name ?? r.ownerId,
    createdAt: r.createdAt,
    memberCount: r.members.length,
    // A room is a lobby between games; "phase" is its active game's phase while one runs.
    phase: r.game && r.game.phase !== "ended" ? r.game.phase : "lobby",
    activeGameShortCode: r.game && r.game.phase !== "ended" ? r.game.shortCode : null
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
  await mutate(id, async (room) => {
    requireAct(actor);
    if (input.action === "join") {
      if (actor.scope !== "browser") throw new Error("Browser login required to join");
      if (!room.members.some((m) => m.id === actor.id)) {
        if (room.members.length >= 8) throw new Error("This room has reached its eight-player limit");
        room.members.push({ id: actor.id, name: actor.name, kind: "human", ready: false });
      }
      return;
    }
    member(room, actor);
    if (input.action === "leave") {
      if (room.ownerId === actor.id) throw new Error("The owner cannot leave their room");
      if (room.game && room.game.phase !== "ended" && room.game.roster.some((m) => m.id === actor.id))
        throw new Error("You are seated in the active game; leave after it ends");
      room.members = room.members.filter((m) => m.id !== actor.id);
      return;
    }
    if (input.action === "chat" || input.action === "ready") {
      await playerCommand(room, actor, {
        command: input.action === "chat" ? "chat.send" : "ready.set",
        requestId: input.requestId,
        payload: input.action === "chat" ? { text: input.text } : { ready: input.ready }
      });
      return;
    }
    owner(room, actor);
    if (input.action === "start") {
      const key = `start:${actor.id}:${input.requestId}`;
      if (room.receipts[key]) return;
      await startGame(room, actor);
      room.receipts[key] = { hash: "start", result: { gameId: room.game.id } };
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
      const settings = input.settings;
      validateSettings4(settings);
      assertOffered(settings);
      if (settings.startingObjectCount > 1e3 || settings.interactionRateHz > 1e3 || settings.spawnRateHz > 10 || settings.planningSeconds > 3600 || settings.pauseSeconds > 3600) throw new Error("Settings exceed server resource limits");
      room.settings = settings;
      if (input.aiBudget !== void 0) room.aiBudget = input.aiBudget;
      room.revision++;
    } else if (input.action === "addAi") {
      if (room.members.length >= 8) throw new Error("Maximum eight gods");
      if (!input.aiAgentId) throw new Error("Choose an agent from the library");
      const definition2 = await getAgentDefinition(input.aiAgentId);
      if (!definition2) throw Object.assign(new Error("AI agent not found"), { status: 404 });
      const { id: id2, name, provider, model, prompt, revision } = definition2;
      room.members.push({
        id: `ai:${randomUUID3()}`,
        name,
        kind: "ai",
        ready: true,
        aiAgent: { id: id2, name, provider, model, prompt, revision },
        status: "Ready; awaiting game start"
      });
    } else if (input.action === "removeAi") {
      const target = room.members.find((m) => m.id === input.deityId);
      if (!target || target.kind !== "ai") throw new Error("AI seat not found");
      room.members = room.members.filter((m) => m.id !== target.id);
    }
  });
  res.json(publicRoom(resolveRoom(id)));
});
router.get("/rooms/:roomId/games", async (req, res) => {
  const actor = requireIdentity(req), room = resolveRoom(String(req.params.roomId));
  if (actor.scope !== "browser" && actor.roomId !== room.id) throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  res.set("Cache-Control", "no-store").json(await roomHistory(room.id));
});
router.get("/rooms/:roomId/chat", (req, res) => {
  const room = resolveRoom(String(req.params.roomId));
  member(room, requireIdentity(req));
  const before = Number(req.query.before ?? Infinity);
  res.json(room.chat.filter((m) => m.timestamp < before).slice(-100));
});
var rooms_default = router;

// src/routes/player.ts
import { Router as Router2 } from "express";

// src/game/player-api.ts
import { GAME_COMMANDS, VERSION, envelopeSchema, observationSchema } from "@workspace/player-client";
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
async function executePlayerEnvelope(roomId, actor, raw) {
  requireAct(actor);
  const envelope = envelopeSchema.parse(raw);
  return mutate(resolveRoom(roomId).id, async (room) => {
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
        payload: command
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

// src/routes/games.ts
import { Router as Router3 } from "express";

// src/game/game-links.ts
import { encodeUuid as encodeUuid2, resolveIdentifier as resolveIdentifier2 } from "@workspace/game-core";
function resolveGameLink(code, games, rooms2, actor) {
  let id;
  try {
    id = resolveIdentifier2(code, games.map((game2) => game2.id));
  } catch (error) {
    throw Object.assign(error, { status: 404 });
  }
  const game = games.find((candidate) => candidate.id === id);
  if (actor.scope !== "browser" && actor.roomId !== game.room_id) {
    throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  }
  const room = rooms2.find((candidate) => candidate.id === game.room_id);
  return {
    id,
    shortCode: encodeUuid2(id).slice(0, game.prefix_length),
    roomShortCode: room?.shortCode ?? null,
    status: !room ? "unavailable" : room.game?.id === id ? "current" : "historical"
  };
}

// src/routes/games.ts
var router3 = Router3();
router3.get("/games/:code", async (req, res) => {
  const actor = requireIdentity(req);
  const games = await pool.query("SELECT id,room_id,prefix_length FROM cg_games");
  res.set("Cache-Control", "no-store").json(resolveGameLink(String(req.params.code), games.rows, allRooms(), actor));
});
router3.get("/games/:code/state", async (req, res) => {
  const actor = requireIdentity(req);
  const { game, roomId } = await findGame(String(req.params.code));
  if (actor.scope !== "browser" && actor.roomId !== roomId) throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  const room = allRooms().find((r) => r.id === roomId) ?? null;
  res.set("Cache-Control", "no-store").json(publicGameView(game, room));
});
var games_default = router3;

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

// test/game-integration.test.ts
import { codecOf as codecOf2 } from "@workspace/game-core";

// src/game/runtime-setup.ts
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS3 } from "@workspace/game-core";
import { OBJECT_TYPES as OBJECT_TYPES2 } from "@workspace/game-types";
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
      const pool2 = createRuntime({ language, workers: 4, queueLimit: 32 });
      candidates[language] = pool2;
      const probe = async () => {
        for (const type of OBJECT_TYPES2) {
          const settings = {
            ...DEFAULT_SETTINGS3,
            language,
            grammarId: `${language}-agent-v1`,
            objectType: type.id,
            typeArgs: type.defaults,
            interactionComputeMs: 1e3
          };
          const source = language === "python" ? "def agent(x):\n    return []" : "function agent(x) { return []; }";
          const act = actSettings(settings);
          const { cost } = await pool2.inspect(source, act);
          const input = referenceSpawns(settings)[0];
          const { calls } = await pool2.act(source, input, act);
          if (!Number.isSafeInteger(cost) || cost <= 0 || calls !== "[]") {
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

// src/game/ai-service.ts
import { AIController } from "@workspace/ai-player";
var DAILY_HOST_USD = 5;
var GAME_USD = 2;
var CALLS_PER_MINUTE = 6;
async function reserveAI(roomId, gameId, tokens, usd, checkActive) {
  return mutate(roomId, async (room) => {
    checkActive?.();
    if (!room.game || room.game.id !== gameId || ["ended", "recovery"].includes(room.game.phase)) throw new Error("AI game inactive");
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    const daily = allRooms().reduce((sum, r) => sum + (r.aiDaily.day === day ? r.aiDaily.usd : 0), 0);
    const calls = room.aiDaily.calls.filter((t) => now - t < 6e4);
    if (!Number.isSafeInteger(tokens) || tokens < 1 || !Number.isFinite(usd) || usd <= 0 || room.aiUsed + tokens > room.aiBudget || room.aiReservedUsd + usd > GAME_USD || daily + usd > DAILY_HOST_USD || calls.length >= CALLS_PER_MINUTE) throw new Error("AI budget or rate limit reached");
    room.aiUsed += tokens;
    room.aiReservedUsd += usd;
    room.aiDaily = { day, usd: (room.aiDaily.day === day ? room.aiDaily.usd : 0) + usd, calls: [...calls, now] };
    let settled = false;
    return {
      reservedTokens: tokens,
      reservedUsd: usd,
      settle: async (actualTokens, usage) => {
        if (!Number.isSafeInteger(actualTokens) || actualTokens < 0 || actualTokens > tokens) throw new Error("Invalid AI usage");
        if (![usage.inputTokens, usage.outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0) || usage.inputTokens + usage.outputTokens !== actualTokens) throw new Error("Invalid AI usage breakdown");
        await mutate(roomId, async (current) => {
          if (settled) return;
          settled = true;
          if (current.game?.id !== gameId) return;
          current.aiUsed -= tokens - actualTokens;
          current.aiInputTokens = (current.aiInputTokens ?? 0) + usage.inputTokens;
          current.aiOutputTokens = (current.aiOutputTokens ?? 0) + usage.outputTokens;
        });
      }
    };
  });
}

// test/game-integration.test.ts
import { AIController as AIController2, SYSTEM } from "@workspace/ai-player";
import { VERSION as VERSION3 } from "@workspace/player-client";
var EMPTY_TS = "function agent(x) { return []; }";
var ADD_TS = "function agent(x) { return [add(1)]; }";
var ADD_PY = "def agent(x):\n    return [add(1)]";
var richAgent = (ownerId, source, world = 0) => ({
  id: randomUUID4(),
  ownerId,
  source,
  createdAt: Date.now(),
  summonCost: 0,
  expectedActCost: 1,
  account: { balance: 1e3, settledWorldSeconds: world },
  acts: 0,
  spent: 0
});
test("bounded queued interactions preserve command durability and retry failed writes", async () => {
  const host = { id: randomUUID4(), name: "Queue test", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  await mutate(room.id, async (draft) => {
    draft.game = { id: randomUUID4(), shortCode: "fixture", phase: "ended", objects: [
      { id: "object", value: 0, version: 0, scores: {} }
    ], events: [], deities: [{ id: host.id, spent: 0 }] };
  });
  const beforeInteractions = resolveRoom(room.id);
  const transform = () => mutateInteraction(room.id, "object", (draft) => {
    const g = draft.game, object2 = g.objects[0];
    const before = object2.value;
    object2.version++;
    object2.value = object2.version;
    g.events.push({ id: randomUUID4(), gameId: g.id, type: "object.transformed", timestamp: Date.now(), before, object: { ...object2 } });
    return true;
  });
  const writes = fixtureControl.interactionWrites;
  for (let i = 0; i < 64; i++) await transform();
  assert.equal(resolveRoom(room.id).game.objects[0].version, 64);
  assert.equal(beforeInteractions.game.objects[0].version, 0, "copy-on-write preserves prior snapshots");
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 0, "queued state is explicitly not yet durable");
  assert.equal(interactionCapacity(room.id), false);
  await transform();
  assert.equal(resolveRoom(room.id).game.objects[0].version, 64, "saturation applies backpressure");
  fixtureControl.failCommit = true;
  await assert.rejects(mutate(room.id, async (draft) => {
    draft.receipts.spend = { hash: "hash", result: true };
  }), /fixture commit failure/);
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 0, "failed transaction rolls back");
  assert.equal(resolveRoom(room.id).receipts.spend, void 0, "no command acknowledgement before durability");
  fixtureControl.failCommit = false;
  await mutate(room.id, async (draft) => {
    draft.game.deities[0].spent = 9;
    draft.receipts.spend = { hash: "hash", result: true };
  });
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 64);
  assert.equal(fixtureRooms.get(room.id).game.events.length, 64);
  assert.equal(fixtureRooms.get(room.id).game.deities[0].spent, 9);
  assert.equal(fixtureRooms.get(room.id).receipts.spend.result, true);
  assert.equal(fixtureControl.interactionWrites - writes, 2, "one failed attempt plus one coalesced commit");
  assert.equal([...fixtureBatches.values()].filter((b) => b.room_id === room.id).length, 0, "checkpoint compacts covered batches");
  await transform();
  fixtureControl.loseAppendAck = true;
  await assert.rejects(mutate(room.id, async () => {
  }), /lost append acknowledgement/);
  assert.equal(interactionCapacity(room.id), false, "uncertain append freezes its exact idempotency key");
  await transform();
  assert.equal(resolveRoom(room.id).game.objects[0].version, 65);
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 64);
  assert.equal(
    rehydrateInteractions(fixtureDurableRoom(room.id), fixtureDurableBatches()).game.objects[0].version,
    65,
    "a committed append survives loss of its network acknowledgement"
  );
  fixtureControl.failCheckpoint = true;
  await assert.rejects(mutate(room.id, async (draft) => {
    draft.receipts.failedSpend = { hash: "hash", result: true };
  }), /checkpoint failure/);
  assert.equal(resolveRoom(room.id).receipts.failedSpend, void 0);
  assert.equal(
    [...fixtureBatches.values()].filter((b) => b.room_id === room.id).length,
    1,
    "retry does not duplicate the batch; failed compaction retains it"
  );
  assert.equal(rehydrateInteractions(fixtureDurableRoom(room.id), fixtureDurableBatches()).game.objects[0].version, 65);
  fixtureControl.failCheckpoint = false;
  await mutate(room.id, async () => {
  });
  assert.equal(fixtureRooms.get(room.id).game.objects[0].version, 65);
  assert.equal([...fixtureBatches.values()].filter((b) => b.room_id === room.id).length, 0);
});
test("replay survives 1000 committed interactions, duplicate batches, partial checkpoints and rejects gaps", () => {
  const checkpoint = {
    id: "room",
    seq: 8,
    game: { id: "game", objects: [{ id: "object", value: 0, version: 0, scores: {} }], agents: [], events: [] }
  };
  const events = Array.from({ length: 1e3 }, (_, i) => ({
    id: `event-${i}`,
    gameId: "game",
    type: "object.transformed",
    timestamp: i,
    before: i,
    object: { id: "object", value: i + 1, version: i + 1, scores: {} }
  }));
  const batches = Array.from({ length: 20 }, (_, i) => ({
    room_id: "room",
    game_id: "game",
    end_seq: 8 + (i + 1) * 50,
    events: events.slice(i * 50, (i + 1) * 50)
  }));
  const recovered = rehydrateInteractions(checkpoint, [...batches, batches[0]]);
  assert.equal(recovered.seq, 1008);
  assert.equal(recovered.game.objects[0].version, 1e3);
  assert.equal(recovered.game.events.length, 1e3);
  assert.equal(checkpoint.game.objects[0].version, 0);
  const partial = rehydrateInteractions(checkpoint, [{ ...batches[0], end_seq: 33, events: events.slice(0, 25) }]);
  assert.deepEqual(rehydrateInteractions(partial, batches), recovered);
  assert.deepEqual(rehydrateInteractions(recovered, batches), recovered);
  assert.throws(() => rehydrateInteractions(checkpoint, batches.slice(1)), /sequence gap/);
  assert.throws(() => rehydrateInteractions(checkpoint, [{ ...batches[0], events: batches[0].events.map((e, i) => i ? e : { ...e, before: -1 }) }]), /object transition/);
  assert.deepEqual(rehydrateInteractions(checkpoint, [{ ...batches[0], game_id: "old-game" }]), checkpoint);
});
test("three-player authority: exact costs, receipts, pause energy, privacy and persistent AI reservations", { timeout: 3e5 }, async (t) => {
  const host = { id: randomUUID4(), name: "Test Host", kind: "human", scope: "browser" };
  let stopTicker;
  let releaseExecutions;
  try {
    await initializeRuntimeAdapters();
    await recordHumanActivity();
    const created = await createRoom(host), id = created.id;
    const second = { id: randomUUID4(), name: "Second", kind: "human", scope: "browser" };
    const bot = { id: `ai:${randomUUID4()}`, name: "Negotiator", kind: "ai", scope: "player", roomId: id };
    await mutate(id, async (room2) => {
      room2.settings.language = "typescript";
      room2.settings.grammarId = "typescript-agent-v1";
      room2.settings.objectType = "Int";
      room2.settings.startingEnergy = 100;
      room2.settings.energyPerSecond = 2;
      room2.settings.startingObjectCount = 3;
      room2.members.push({ ...second, ready: false }, {
        ...bot,
        ready: true,
        aiAgent: { id: randomUUID4(), name: bot.name, provider: "openai", model: "gpt-4.1-mini", prompt: "Negotiate honestly.", revision: 1 }
      });
      room2.aiBudget = 1e6;
      const prior2 = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "test-not-a-real-key";
      try {
        await startGame(room2, host);
      } finally {
        if (prior2 === void 0) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = prior2;
      }
    });
    let room = resolveRoom(id);
    assert.equal(room.game.roster.length, 3);
    assert.equal(room.game.objects.length, 3);
    assert.equal(fixtureGames.get(room.game.id).roster[2].aiAgent.prompt, "Negotiate honestly.");
    await mutate(id, async (draft) => {
      draft.members[2].aiAgent.prompt = "Changed lobby metadata";
    });
    assert.equal(resolveRoom(id).game.roster[2].aiAgent.prompt, "Negotiate honestly.");
    const envelope = (command) => ({ version: VERSION3, commandId: randomUUID4(), gameId: resolveRoom(id).game.id, command });
    const validate = await executePlayerEnvelope(id, host, envelope({ type: "validate", language: "typescript", source: EMPTY_TS }));
    assert.equal(validate.validation.valid, true);
    assert.equal(validate.validation.cost, 8, "ast-bytes-v1 price of function agent(x) { return []; }");
    assert.equal(validate.validation.expectedActCost, 1, "an empty act fails and pays the 1-bit minimum");
    assert.match(validate.validation.diagnostics[0], /would fail \(no change\)/);
    assert.equal(resolveRoom(id).game.deities[0].spent, 0);
    const summon = envelope({ type: "summon", language: "typescript", source: ADD_TS });
    const receipt = await executePlayerEnvelope(id, host, summon);
    assert.equal(receipt.accepted, true, receipt.message);
    assert.equal(resolveRoom(id).game.deities[0].spent, 11);
    assert.deepEqual(await executePlayerEnvelope(id, host, summon), receipt);
    assert.equal(resolveRoom(id).game.agents.length, 1);
    const summoned = resolveRoom(id).game.agents[0];
    assert.equal(summoned.summonCost, 11);
    assert.ok(summoned.expectedActCost > 1, "add(1) prices its decision and motion");
    assert.deepEqual([summoned.account.balance, summoned.acts, summoned.spent], [0, 0, 0], "a new agent starts with no energy");
    await assert.rejects(executePlayerEnvelope(id, host, { ...summon, command: { ...summon.command, source: EMPTY_TS } }), /reused/);
    const saved = fixtureRooms.get(id);
    assert.deepEqual(saved.receipts[`client:${host.id}:${summon.commandId}`].result, receipt);
    assert.equal(saved.game.deities[0].spent, 11);
    const invalid = await executePlayerEnvelope(id, host, envelope({ type: "validate", language: "typescript", source: "(x: number) => x" }));
    assert.equal(invalid.accepted, false, "a bare callable is not an agent: agent(x) must be declared");
    assert.equal(invalid.validation.valid, false);
    await mutate(id, async (draft) => {
      draft.game.phase = "running";
      draft.game.lastTick = Date.now() - 250;
      draft.game.endAtWorld = 3600;
      draft.game.createdAt = Date.now() - 1e4;
    });
    assert.equal((await executePlayerEnvelope(id, host, envelope({ type: "pause" }))).accepted, true);
    assert.equal((await executePlayerEnvelope(id, host, envelope({ type: "pause" }))).accepted, false);
    room = resolveRoom(id);
    assert.equal(room.game.phase, "paused");
    assert.ok(room.game.worldSeconds >= 0.25, "pausing accounts for elapsed running time before freezing");
    const pausedWorldSeconds = room.game.worldSeconds;
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(resolveRoom(id).game.worldSeconds, pausedWorldSeconds, "paused world time stays frozen");
    assert.ok(observation(room, host).self.energy >= 109, "god energy accrues on wall clock even while paused");
    await executePlayerEnvelope(id, host, envelope({ type: "chat", text: "Public negotiation only" }));
    assert.equal(observation(resolveRoom(id), second).chat.at(-1).text, "Public negotiation only");
    const pub = JSON.stringify(publicRoom(resolveRoom(id)));
    assert.ok(!pub.includes("Negotiate honestly") && !pub.includes("Changed lobby metadata"));
    assert.ok(!pub.includes("descriptor") && !pub.includes("scores") && !pub.includes("return [add(1)]"));
    const other = observation(resolveRoom(id), second);
    assert.equal(other.agents.length, 0);
    assert.ok(!JSON.stringify(other).includes("return [add(1)]"));
    await assert.rejects(playerCommand(resolveRoom(id), host, { command: "chat.private", requestId: randomUUID4(), gameId: room.game.id }), /Unknown command/);
    let calls = 0;
    const controller = new AIController2({
      roomId: id,
      godId: bot.id,
      customPrompt: room.game.roster[2].aiAgent.prompt,
      transport: { observe: async () => observation(resolveRoom(id), bot), send: async (command) => executePlayerEnvelope(id, bot, command) },
      budget: { reserve: (tokens, usd) => reserveAI(id, room.game.id, tokens, usd) },
      provider: { estimateMaxUsd: () => 0.2, complete: async (request) => {
        calls++;
        assert.ok(request.system.startsWith(SYSTEM));
        assert.ok(request.system.endsWith("Negotiate honestly."));
        return { text: JSON.stringify({ actions: [{ type: "summon", language: "typescript", source: EMPTY_TS }] }), inputTokens: 100, outputTokens: 10 };
      } },
      onEvent: () => {
      }
    });
    await controller.step();
    assert.equal(calls, 1);
    assert.equal(resolveRoom(id).game.agents.filter((a) => a.ownerId === bot.id).length, 1, "AI uses game-scoped validation and summon commands");
    assert.equal(resolveRoom(id).game.deities.find((d) => d.id === bot.id).spent, 8);
    assert.equal(fixtureRooms.get(id).aiReservedUsd, 0.2);
    assert.ok(fixtureRooms.get(id).aiUsed > 8192);
    await mutate(id, async (draft) => {
      draft.aiBudget = draft.aiUsed;
    });
    await assert.rejects(controller.step(), /budget/);
    assert.equal(calls, 1, "budget refusal must precede provider call");
    await mutate(id, async (draft) => {
      draft.aiBudget = 1e6;
    });
    const failure = new AIController2({
      roomId: id,
      godId: bot.id,
      transport: { observe: async () => observation(resolveRoom(id), bot), send: async (command) => executePlayerEnvelope(id, bot, command) },
      budget: { reserve: (tokens, usd) => reserveAI(id, room.game.id, tokens, usd) },
      provider: { estimateMaxUsd: () => 0.2, complete: async () => {
        throw new Error("Ambiguous provider failure");
      } },
      onEvent: () => {
      }
    });
    await assert.rejects(failure.step(), /Ambiguous/);
    assert.equal(fixtureRooms.get(id).aiReservedUsd, 0.4, "failed calls retain persistent reservations");
    await assert.rejects(reserveAI(id, room.game.id, 100, 1.81), /budget/);
    await reserveAI(id, room.game.id, 100, 1.6);
    assert.equal(fixtureRooms.get(id).aiReservedUsd, 2);
    await assert.rejects(reserveAI(id, room.game.id, 1, 1e-3), /budget/);
    const otherRoom = await createRoom(second);
    await mutate(otherRoom.id, async (draft) => {
      draft.aiDaily = { day: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), usd: 3, calls: [] };
    });
    await mutate(id, async (draft) => {
      draft.aiReservedUsd = 0;
    });
    await assert.rejects(reserveAI(id, room.game.id, 1, 1e-3), /budget/);
    fixtureActors.set("host", host);
    fixtureActors.set("player", { ...second, scope: "player", roomId: id });
    fixtureActors.set("other", { ...second, scope: "player", roomId: otherRoom.id });
    const app = express();
    app.use(express.json(), rooms_default, player_default);
    app.use((error, _req, res, _next) => res.status(error.status ?? 400).json({ error: error.message }));
    const server = createServer(app);
    attachSockets(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;
    let ws;
    try {
      const get = (path, token = "host") => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
      const post = (path, body, token = "host") => fetch(`${base}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      assert.equal((await get(`/rooms/${id}`)).status, 200);
      const projected = await (await get(`/player/v1/rooms/${id}/observation`, "player")).json();
      assert.equal(projected.self.godId, second.id);
      assert.equal(projected.agents.length, 0);
      assert.equal((await get(`/player/v1/rooms/${id}/observation`, "other")).status, 403);
      assert.equal((await get(`/rooms/${id}`, "missing")).status, 401);
      const validated = await (await post(`/player/v1/rooms/${id}/commands`, envelope({ type: "validate", source: EMPTY_TS, language: "typescript" }), "player")).json();
      assert.equal(validated.validation.cost, 8);
      assert.equal(validated.accepted, true);
      const noGame = await (await post(`/player/v1/rooms/${id}/commands`, { version: VERSION3, commandId: randomUUID4(), command: { type: "pause" } }, "player")).json();
      assert.equal(noGame.accepted, false);
      const definition2 = { id: "test-library", name: "Library agent", provider: "openai", model: "gpt-4.1-mini", prompt: "Private admin strategy", revision: 3, created_at: /* @__PURE__ */ new Date(), updated_at: /* @__PURE__ */ new Date() };
      fixtureAgents.set(definition2.id, definition2);
      const added = await post(`/rooms/${otherRoom.id}/actions`, { action: "addAi", requestId: randomUUID4(), aiAgentId: definition2.id }, "player");
      assert.equal(added.status, 403, "player tokens cannot edit seats");
      fixtureActors.set("second-browser", second);
      const selected = await post(`/rooms/${otherRoom.id}/actions`, { action: "addAi", requestId: randomUUID4(), aiAgentId: definition2.id }, "second-browser");
      assert.equal(selected.status, 200);
      const publicSeat = (await selected.json()).members.find((m) => m.kind === "ai");
      assert.equal(publicSeat.name, "Library agent");
      assert.equal(publicSeat.aiAgentId, definition2.id);
      assert.equal(publicSeat.aiAgent, void 0);
      assert.equal(resolveRoom(otherRoom.id).members[1].aiAgent.prompt, definition2.prompt);
      definition2.prompt = "Edited after selection";
      assert.equal(resolveRoom(otherRoom.id).members[1].aiAgent.prompt, "Private admin strategy");
      ws = new WebSocket2(`ws://127.0.0.1:${port}/api/rooms/${id}/ws`, { headers: { authorization: "Bearer player" } });
      const snapshot = once(ws, "message", { signal: t.signal }).then(([raw]) => JSON.parse(raw.toString()));
      const message = await snapshot;
      assert.equal(message.type, "room.snapshot");
      assert.ok(!JSON.stringify(message).includes("Negotiate honestly."));
      const command = envelope({ type: "ready", ready: true });
      const received = new Promise((resolve, reject) => {
        const aborted = () => reject(new Error("Integration test deadline exceeded"));
        t.signal.addEventListener("abort", aborted, { once: true });
        ws.on("message", (raw) => {
          const data = JSON.parse(raw.toString());
          if (data.type === "command.receipt") {
            t.signal.removeEventListener("abort", aborted);
            resolve(data);
          }
        });
        ws.once("error", reject);
      });
      ws.send(JSON.stringify(command));
      const response = await received;
      assert.equal(response.payload.accepted, true);
    } finally {
      if (ws) {
        ws.terminate();
        await once(ws, "close");
      }
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    const waitUntil = async (check, label) => {
      const deadline = Date.now() + 1e4;
      while (!check()) {
        t.signal.throwIfAborted();
        if (Date.now() >= deadline) assert.fail(`Timed out: ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    await mutate(id, async (draft) => {
      const g = draft.game;
      g.phase = "running";
      g.lastTick = Date.now();
      g.endAtWorld = g.worldSeconds + 3600;
      g.nextSpawn = Number.MAX_VALUE;
      g.settings.interactionRateHz = 100;
      g.settings.pauseSeconds = 60;
      g.settings.agentEnergyPerSecond = 1e3;
      g.settings.agentBatteryActs = 1e3;
      g.agents.forEach((agent) => {
        agent.source = ADD_TS;
        agent.expectedActCost = 1;
        agent.account = { balance: 10, settledWorldSeconds: g.worldSeconds };
      });
    });
    const adapters = requireAdapters();
    let hold = false, held = 0, released = 0;
    const gate = new Promise((resolve) => {
      releaseExecutions = resolve;
    });
    registerAdapters({
      utilities: adapters.utilities,
      runtime: {
        ...adapters.runtime,
        async act(source, value, settings) {
          const result = await adapters.runtime.act(source, value, settings);
          if (hold) {
            held++;
            await gate;
            released++;
          }
          return result;
        }
      }
    });
    await recordHumanActivity();
    stopTicker = startTicker();
    await waitUntil(
      () => fixtureGames.get(resolveRoom(id).game.id).events.some((e) => e.type === "object.transformed"),
      "real ticker persists a Wasm transformation"
    );
    const persisted = fixtureGames.get(resolveRoom(id).game.id);
    const transformation = persisted.events.find((e) => e.type === "object.transformed");
    assert.ok(persisted.objects.find((o) => o.id === transformation.object.id).version >= 1);
    assert.equal(Math.abs(transformation.object.value - transformation.before), 1, "runtime result is persisted faithfully");
    assert.deepEqual(transformation.calls, [["add", { k: 1 }]]);
    assert.ok(transformation.cost.total > 0 && transformation.agent.acts >= 1, "the event carries the calls, the cost and the agent's account");
    hold = true;
    await waitUntil(() => held > 0, "runtime result deliberately held in flight");
    assert.equal((await executePlayerEnvelope(id, second, envelope({ type: "pause" }))).accepted, true);
    const paused = structuredClone(fixtureGames.get(resolveRoom(id).game.id));
    releaseExecutions();
    await waitUntil(() => released === held, "held runtime work drains");
    await new Promise((resolve) => setTimeout(resolve, 200));
    const after = fixtureGames.get(paused.id);
    assert.equal(after.phase, "paused");
    assert.equal(after.worldSeconds, paused.worldSeconds, "ticker does not advance paused clock");
    assert.deepEqual(after.objects, paused.objects, "in-flight pre-pause completions cannot overwrite persisted objects");
    assert.equal(after.events.length, paused.events.length, "stale completions do not append transformation events");
    await stopTicker();
    stopTicker = void 0;
    registerAdapters(adapters);
  } finally {
    releaseExecutions?.();
    await stopTicker?.();
    shutdownRuntimeAdapters();
  }
});
test("opt-in interaction pipeline benchmark: runtime, authority, events and fsynced fixture", {
  skip: process.env.RUN_INTERACTION_BENCHMARK !== "1",
  timeout: 3e4
}, async (t) => {
  await initializeRuntimeAdapters();
  const adapters = requireAdapters();
  const host = { id: randomUUID4(), name: "Benchmark", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  let stop;
  try {
    for (const mode of ["wasm", "cheap-synthetic"]) {
      registerAdapters(mode === "wasm" ? adapters : {
        ...adapters,
        runtime: { ...adapters.runtime, act: async () => ({ calls: '[["add",{"k":1}]]' }) }
      });
      for (const count of [10, 100, 2e3]) {
        await mutate(room.id, async (draft) => {
          draft.members = [host, { ...host, id: randomUUID4() }, { ...host, id: randomUUID4() }].map((m) => ({ ...m, ready: true }));
          draft.settings = {
            ...draft.settings,
            language: "typescript",
            grammarId: "typescript-agent-v1",
            startingObjectCount: count,
            spawnRateHz: 0,
            interactionRateHz: 1e3,
            agentEnergyPerSecond: 1e3,
            agentBatteryActs: 1e3
          };
          await startGame(draft, host);
          const g = draft.game;
          g.phase = "running";
          g.lastTick = Date.now();
          g.endAtWorld = 3600;
          if (mode === "cheap-synthetic") g.settings.interactionRateHz = 4e3;
          g.agents.push(richAgent(host.id, ADD_TS, g.worldSeconds));
        });
        await recordHumanActivity();
        const writes = fixtureControl.interactionWrites;
        const started = performance.now();
        stop = startTicker();
        await new Promise((resolve) => setTimeout(resolve, 1e3));
        await stop();
        stop = void 0;
        await mutate(room.id, async (draft) => {
          draft.game.phase = "ended";
        });
        const elapsed = performance.now() - started;
        const persisted = fixtureDurableRoom(room.id);
        const countCommitted = persisted.game.objects.reduce((sum, object2) => sum + object2.version, 0);
        assert.equal(countCommitted, resolveRoom(room.id).game.objects.reduce((sum, object2) => sum + object2.version, 0));
        assert.ok(countCommitted > 0);
        t.diagnostic(`${mode}: objects=${count}, durable transformations=${countCommitted}, elapsedMs=${elapsed.toFixed(1)}, transformations/sec=${(countCommitted * 1e3 / elapsed).toFixed(1)}, incremental transactions=${fixtureControl.interactionWrites - writes}. Temporary fsync SQL fixture, NOT PostgreSQL.`);
      }
    }
  } finally {
    await stop?.();
    registerAdapters(adapters);
    shutdownRuntimeAdapters();
  }
});
test("objects stay unique: spawns never duplicate; duplicate results fail but still pay their decision bits", { timeout: 6e4 }, async () => {
  await initializeRuntimeAdapters();
  const host = { id: randomUUID4(), name: "Unique", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  const adapters = requireAdapters();
  registerAdapters({ ...adapters, utilities: {
    ...adapters.utilities,
    deal: (_settings, count) => Array.from({ length: count }, (_, d) => ({ familyId: "digit-devotee", params: { d } }))
  } });
  let stop;
  try {
    await mutate(room.id, async (draft) => {
      draft.members = [host, { ...host, id: randomUUID4() }, { ...host, id: randomUUID4() }].map((m) => ({ ...m, ready: true }));
      draft.settings = {
        ...draft.settings,
        language: "typescript",
        grammarId: "typescript-agent-v1",
        objectType: "Int",
        typeArgs: { min: 0, max: 5 },
        startingObjectCount: 6,
        spawnRateHz: 0,
        agentEnergyPerSecond: 1e3,
        agentBatteryActs: 1e3
      };
      await startGame(draft, host);
      const g = draft.game;
      assert.deepEqual(g.objects.map((o) => o.value).sort(), [0, 1, 2, 3, 4, 5], "a full tiny domain spawns every value exactly once");
      g.objects = g.objects.filter((o) => o.value < 3);
      g.phase = "running";
      g.lastTick = Date.now();
      g.endAtWorld = 3600;
      g.agents.push(richAgent(host.id, "function agent(x) { return [setTo(5)]; }", g.worldSeconds));
    });
    await recordHumanActivity();
    stop = startTicker();
    const deadline = Date.now() + 2e4;
    while (resolveRoom(room.id).game.events.filter((e) => e.type === "agent.failed").length < 2) {
      assert.ok(Date.now() < deadline, "a first constant transformation commits, later ones collide");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await stop();
    stop = void 0;
    const game = resolveRoom(room.id).game;
    const values = game.objects.map((o) => o.value);
    assert.equal(new Set(values).size, values.length);
    assert.equal(values.filter((v) => v === 5).length, 1, "only the first constant transformation can succeed");
    assert.equal(game.events.filter((e) => e.type === "object.transformed").length, 1);
    const failed = game.events.filter((e) => e.type === "agent.failed");
    assert.ok(failed.every((e) => e.type === "agent.failed" && /already has this value/.test(e.reason) && e.cost.erasure === 0 && e.cost.motion === 0 && e.cost.total === e.cost.decision));
    const agent = game.agents[0];
    assert.equal(agent.acts, game.events.filter((e) => e.type !== "object.spawned").length, "every act is charged, successful or not");
    const transformed = game.events.find((e) => e.type === "object.transformed");
    assert.ok(transformed.type === "object.transformed" && agent.spent > transformed.cost.total, "duplicates paid as well");
  } finally {
    await stop?.();
    registerAdapters(adapters);
    shutdownRuntimeAdapters();
  }
});
test("games frozen by a restart or idling resume once a human is active; safety stops do not", { timeout: 6e4 }, async () => {
  await initializeRuntimeAdapters();
  const host = { id: randomUUID4(), name: "Resume", kind: "human", scope: "browser" };
  const rooms2 = [await createRoom(host), await createRoom(host)];
  let stop;
  try {
    for (const [index, room] of rooms2.entries()) {
      await mutate(room.id, async (draft) => {
        draft.members = [host, { ...host, id: randomUUID4() }, { ...host, id: randomUUID4() }].map((m) => ({ ...m, ready: true }));
        await startGame(draft, host);
        const g = draft.game;
        g.phase = "recovery";
        g.worldSeconds = 12;
        g.endAtWorld = 3600;
        g.lastTick = Date.now() - 6e4;
        if (index === 0) g.autoResume = true;
      });
    }
    await recordHumanActivity();
    stop = startTicker();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const resumed = resolveRoom(rooms2[0].id).game;
    assert.equal(resumed.phase, "running");
    assert.ok(resumed.worldSeconds < 13, "downtime is not simulated");
    assert.equal(resolveRoom(rooms2[1].id).game.phase, "recovery", "only restart/idle recoveries resume themselves");
  } finally {
    await stop?.();
    shutdownRuntimeAdapters();
  }
});
test("room lobby lifecycle: launch, end, history recorded, second game launched in the same room", { timeout: 12e4 }, async (t) => {
  await initializeRuntimeAdapters();
  await recordHumanActivity();
  const actors = ["Lobby Host", "Ada Seated", "Bo Seated", "Cy Latecomer"].map((name) => ({ id: randomUUID4(), name, kind: "human", scope: "browser" }));
  const [host, ada, bo, cy] = actors;
  for (const actor of actors) fixtureActors.set(`lobby:${actor.name}`, actor);
  const app = express();
  app.use(express.json(), rooms_default, player_default, games_default);
  app.use((error, _req, res, _next) => res.status(error.status ?? 400).json({ error: error.message }));
  const server = createServer(app);
  attachSockets(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (actor) => `lobby:${actor.name}`;
  const get = (path, actor = host) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token(actor)}` } });
  const act = (id, body, actor = host) => fetch(`${base}/rooms/${id}/actions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token(actor)}`, "content-type": "application/json" },
    body: JSON.stringify({ requestId: randomUUID4(), ...body })
  });
  const json = async (response) => {
    const r = await response;
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify(body));
    return body;
  };
  const refused = async (response, pattern) => {
    const r = await response;
    assert.notEqual(r.status, 200);
    assert.match((await r.json()).error, pattern);
  };
  let stop;
  let ws;
  const expireSoon = (id) => mutate(id, async (draft) => {
    const g = draft.game;
    g.planningEndsAt = Date.now() - 1;
    g.endAtWorld = 0.2;
    g.nextSpawn = Number.MAX_VALUE;
  });
  const waitForEnd = async (id) => {
    const deadline = Date.now() + 2e4;
    while (resolveRoom(id).game.phase !== "ended") {
      assert.ok(Date.now() < deadline, "the ticker ends the game when its lifetime elapses");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  try {
    const { id } = await createRoom(host);
    await json(act(id, { action: "join" }, ada));
    await json(act(id, { action: "join" }, bo));
    let room = await json(get(`/rooms/${id}`));
    assert.equal(room.activeGame, null, "a new room is a lobby");
    assert.equal(room.ownerName, "Lobby Host");
    assert.equal(typeof room.createdAt, "number");
    const firstSettings = { ...room.settings, language: "typescript", grammarId: "typescript-agent-v1", objectType: "Int", startingObjectCount: 4, spawnRateHz: 0 };
    room = await json(act(id, { action: "settings", revision: room.revision, settings: firstSettings }));
    await refused(act(id, { action: "start" }, ada), /owner/);
    room = await json(act(id, { action: "start" }));
    const first = room.activeGame;
    assert.ok(first, "the launched game is the room's active game");
    assert.deepEqual(first.roster.map((m) => m.id).sort(), [host.id, ada.id, bo.id].sort());
    assert.equal(fixtureGameRows.get(first.id).summary, null, "no result is recorded while the game runs");
    let view = await json(get(`/games/${first.shortCode}/state`));
    assert.equal(view.status, "active");
    assert.equal(view.roomShortCode, room.shortCode);
    assert.equal(view.objects.length, 4);
    assert.deepEqual(view.winners, []);
    await refused(act(id, { action: "start" }), /already a live game/);
    await refused(act(id, { action: "settings", revision: room.revision, settings: firstSettings }), /frozen/);
    await json(act(id, { action: "join" }, cy));
    const spectator = await json(get(`/player/v1/rooms/${id}/observation`, cy));
    assert.equal(spectator.seated, false);
    assert.equal(spectator.gameShortCode, first.shortCode);
    assert.equal(spectator.self.utility, void 0);
    assert.deepEqual(spectator.objects, []);
    const seated = await json(get(`/player/v1/rooms/${id}/observation`, ada));
    assert.equal(seated.seated, true);
    await refused(act(id, { action: "leave" }, ada), /seated in the active game/);
    await refused(act(id, { action: "leave" }), /owner cannot leave/);
    const chat = await json(act(id, { action: "chat", text: "Treaty proposal during game one" }, bo));
    assert.ok(chat.chat.some((m) => m.text === "Treaty proposal during game one"));
    stop = startTicker();
    await expireSoon(id);
    await waitForEnd(id);
    room = await json(get(`/rooms/${id}`));
    assert.equal(room.activeGame, null, "an ended game is no longer active");
    const listed = (await json(get(`/rooms`))).find((r) => r.id === id);
    assert.equal(listed.phase, "lobby");
    assert.equal(listed.activeGameShortCode, null);
    let history = await json(get(`/rooms/${id}/games`));
    assert.equal(history.length, 1);
    const [record2] = history;
    assert.equal(record2.id, first.id);
    assert.equal(record2.shortCode, first.shortCode);
    assert.equal(record2.endReason, "lifetime");
    assert.ok(record2.endedAt >= record2.startedAt);
    assert.equal(record2.settings.startingObjectCount, 4, "history keeps the settings the game was played with");
    assert.equal(record2.leaderboard.length, 3);
    assert.ok(record2.winners.length >= 1 && record2.winners.every((w) => record2.leaderboard.some((s) => s.deityId === w.deityId && s.rank === 1)));
    assert.deepEqual(record2.roster.map((m) => Object.keys(m).sort()), [0, 1, 2].map(() => ["id", "kind", "name"]));
    assert.equal(record2.scoring, "information-v1");
    assert.ok(record2.leaderboard.every((row) => typeof row.totalPayoff === "number"));
    for (const leak of ["scores", "netBits", "utility", "deities", "aiAgent", "endAtWorld", "source", "prompt"]) {
      assert.ok(!JSON.stringify(history).includes(`"${leak}"`), `history never discloses ${leak}`);
    }
    view = await json(get(`/games/${first.shortCode}/state`));
    assert.equal(view.status, "ended");
    assert.deepEqual(view.winners, record2.winners);
    assert.ok(view.chat.some((m) => m.text === "Treaty proposal during game one"), "the game page shows chat sent during play");
    assert.ok(!JSON.stringify(view).includes('"scores"'));
    await json(act(id, { action: "leave" }, cy));
    await json(act(id, { action: "join" }, cy));
    room = await json(get(`/rooms/${id}`));
    await json(act(id, { action: "settings", revision: room.revision, settings: { ...firstSettings, startingObjectCount: 2 } }));
    await json(act(id, { action: "chat", text: "Lobby talk after game one" }, cy));
    room = await json(act(id, { action: "start" }));
    const second = room.activeGame;
    assert.notEqual(second.id, first.id);
    assert.equal(second.roster.length, 4, "the latecomer is dealt into the next game");
    assert.equal((await json(get(`/player/v1/rooms/${id}/observation`, cy))).seated, true);
    view = await json(get(`/games/${second.shortCode}/state`));
    assert.equal(view.objects.length, 2);
    assert.ok(!view.chat.some((m) => m.text === "Treaty proposal during game one"), "each game page shows only its own chat");
    const old = await json(get(`/games/${first.id}/state`));
    assert.equal(old.status, "ended", "a previous game stays viewable as its final state");
    assert.equal(old.settings.startingObjectCount, 4);
    assert.equal(old.roomActiveGame.id, second.id, "an old game's page can point to the room's newer game");
    assert.equal(old.objects.length, 4);
    ws = new WebSocket2(`ws://127.0.0.1:${server.address().port}/api/rooms/${id}/ws`, { headers: { authorization: `Bearer ${token(ada)}` } });
    const ended = new Promise((resolve, reject) => {
      ws.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === "game.ended") resolve(message.payload);
      });
      ws.on("error", reject);
      t.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
    await once(ws, "open");
    await refused(act(id, { action: "endGame" }, ada), /owner/);
    await json(act(id, { action: "endGame" }));
    const endedEvent = await ended;
    assert.equal(endedEvent.id, second.id);
    assert.equal(endedEvent.endReason, "owner");
    history = await json(get(`/rooms/${id}/games`));
    assert.deepEqual(history.map((g) => g.id), [second.id, first.id], "history is newest first");
    assert.equal(history[0].settings.startingObjectCount, 2);
    assert.equal(history[0].roster.length, 4);
    await refused(act(id, { action: "endGame" }), /no active game/);
    assert.equal((await json(get(`/rooms/${id}`))).activeGame, null);
  } finally {
    ws?.close();
    await stop?.();
    server.close();
    shutdownRuntimeAdapters();
  }
});
var FULL_GAMES = [
  {
    objectType: "Int",
    typeArgs: { min: -2147483648, max: 2147483647 },
    unoffered: { min: 0, max: 5 },
    agents: { python: ADD_PY, typescript: ADD_TS }
  },
  {
    objectType: "string",
    typeArgs: { maxLength: 128 },
    unoffered: { maxLength: 3 },
    agents: { python: "def agent(s):\n    return [rotate(1)]", typescript: "function agent(s) { return [rotate(1)]; }" }
  },
  {
    objectType: "Grid",
    typeArgs: { size: 5, symbols: "base10", colours: "rgby" },
    unoffered: { size: 7, symbols: "base16", colours: "rgb" },
    agents: { python: "def agent(grid):\n    return [slide(row(0), 1)]", typescript: "function agent(grid) { return [slide(row(0), 1)]; }" }
  }
];
var BROKEN = { python: "def agent(x):\n    return [", typescript: "function agent(x) { return [; }" };
for (const spec of FULL_GAMES) {
  test(`full ${spec.objectType} games through the real routes: scores, agents in both languages, energy, destroy, history`, { timeout: 3e5 }, async (t) => {
    await initializeRuntimeAdapters();
    await recordHumanActivity();
    const actors = ["Host", "Ada", "Bo"].map((name) => ({ id: randomUUID4(), name: `${spec.objectType} ${name}`, kind: "human", scope: "browser" }));
    const [host, ada, bo] = actors;
    for (const actor of actors) fixtureActors.set(`full:${actor.name}`, actor);
    const app = express();
    app.use(express.json(), rooms_default, player_default, games_default);
    app.use((error, _req, res, _next) => res.status(error.status ?? 400).json({ error: error.message }));
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = (actor) => ({ authorization: `Bearer full:${actor.name}`, "content-type": "application/json" });
    const get = (path, actor = host) => fetch(`${base}${path}`, { headers: headers(actor) });
    const post = (path, body, actor = host) => fetch(`${base}${path}`, { method: "POST", headers: headers(actor), body: JSON.stringify(body) });
    const json = async (response) => {
      const r = await response, body = await r.json();
      assert.equal(r.status, 200, JSON.stringify(body));
      return body;
    };
    const act = (id, body, actor = host) => json(post(`/rooms/${id}/actions`, { requestId: randomUUID4(), ...body }, actor));
    const command = (id, gameId, cmd, actor = host) => json(post(`/player/v1/rooms/${id}/commands`, { version: VERSION3, commandId: randomUUID4(), gameId, command: cmd }, actor));
    const waitUntil = async (check, label, ms = 9e4) => {
      const deadline = Date.now() + ms;
      while (!await check()) {
        t.signal.throwIfAborted();
        if (Date.now() >= deadline) assert.fail(`Timed out: ${label}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    const near = (a, b, label) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), `${label}: ${a} vs ${b}`);
    let stop;
    try {
      const manifest = await json(get("/manifest"));
      assert.equal(manifest.playerProtocol, VERSION3);
      const typeInfo = manifest.objectTypes.find((x) => x.id === spec.objectType);
      assert.ok(typeInfo.params.length > 0 && Array.isArray(typeInfo.classes));
      const offered = typeInfo.offered.find((o) => JSON.stringify(o.args) === JSON.stringify(spec.typeArgs));
      assert.ok(offered, `${spec.objectType}${JSON.stringify(spec.typeArgs)} is offered`);
      assert.ok(typeInfo.offered.every((o) => typeof o.key === "string" && Array.isArray(o.badges)));
      const { id } = await createRoom(host);
      await act(id, { action: "join" }, ada);
      await act(id, { action: "join" }, bo);
      let room = await json(get(`/rooms/${id}`));
      assert.equal("game" in room, false, "the room carries no game: games have their own pages");
      if (!typeInfo.offered.some((o) => JSON.stringify(o.args) === JSON.stringify(spec.unoffered))) {
        const r = await post(`/rooms/${id}/actions`, {
          requestId: randomUUID4(),
          action: "settings",
          revision: room.revision,
          settings: { ...room.settings, objectType: spec.objectType, typeArgs: spec.unoffered }
        });
        assert.equal(r.status, 400);
        assert.match((await r.json()).error, /not offered/);
      }
      for (const language of ["python", "typescript"]) {
        const other = language === "python" ? "typescript" : "python";
        const source = spec.agents[language];
        room = await json(get(`/rooms/${id}`));
        const settings = {
          ...room.settings,
          objectType: spec.objectType,
          typeArgs: spec.typeArgs,
          language,
          grammarId: `${language}-agent-v1`,
          startingObjectCount: 5,
          spawnRateHz: 0,
          planningSeconds: 3600,
          interactionComputeMs: 200,
          agentEnergyPerSecond: 100,
          agentBatteryActs: 2
        };
        room = await act(id, { action: "settings", revision: room.revision, settings });
        assert.equal(room.objectInstance.key, offered.key);
        assert.ok(room.objectInstance.mutators.length > 0);
        assert.ok(room.utilityCatalog.length > 0 && room.utilityCatalog.every((f) => typeof f.available === "boolean" && Array.isArray(f.badges) && (f.available || typeof f.locked.reason === "string")));
        room = await act(id, { action: "start" });
        const game = room.activeGame;
        let view = await json(get(`/games/${game.shortCode}/state`));
        assert.equal(view.objects.length, 5);
        const codec = codecOf2(settings);
        assert.ok(view.objects.every((o) => codec.isValid(o.value) && typeof o.salience === "number"));
        assert.equal(view.objectInstance.key, offered.key);
        for (const leak of ["scores", "netBits", "rewardBits", "ordinal", "deities", "utility"]) assert.ok(!JSON.stringify(view).includes(`"${leak}"`), `public view hides ${leak}`);
        let obs = await json(get(`/player/v1/rooms/${id}/observation`, ada));
        assert.equal(obs.version, VERSION3);
        assert.equal(obs.instance.key, offered.key);
        assert.ok(obs.instance.helpers.some((h) => h.group === "mutator"));
        assert.equal(obs.economy.agentEnergyPerSecond, 100);
        assert.ok(obs.self.utility.familyId && obs.self.utility.emoji && obs.self.utility.summary);
        assert.match(obs.self.utility.source, language === "python" ? /def utility\(/ : /function utility\(/);
        const g0 = resolveRoom(id).game;
        assert.equal(obs.objects.length, 5);
        for (const o of obs.objects) {
          const stored = g0.objects.find((x) => x.id === o.id);
          assert.deepEqual(Object.keys(o).sort(), ["id", "own", "payoff", "peerCare", "peerNetBits", "value"]);
          assert.equal(o.own.netBits, stored.scores[ada.id].netBits);
          assert.deepEqual(o.own.ordinal, stored.scores[ada.id].ordinal);
          near(o.peerNetBits, stored.scores[host.id].netBits + stored.scores[bo.id].netBits, "peerNetBits is the sum over the other gods");
          assert.equal(o.peerCare, Math.max(0, o.peerNetBits));
          near(o.payoff, o.peerCare === 0 ? 0 : o.own.netBits * o.peerCare, "payoff");
          near(view.objects.find((x) => x.id === o.id).salience, o.own.netBits + o.peerNetBits, "salience is \u03A3 net bits");
        }
        assert.ok(!JSON.stringify(obs.objects).includes(bo.id) && !JSON.stringify(obs.objects).includes(host.id), "no per-opponent scores");
        const validation = await command(id, game.id, { type: "validate", language, source }, ada);
        assert.equal(validation.accepted, true, validation.message);
        assert.ok(validation.validation.valid && Number.isSafeInteger(validation.validation.cost) && validation.validation.cost > 0);
        assert.ok(validation.validation.expectedActCost > 0);
        assert.ok(validation.validation.diagnostics.some((d) => /mutator call/.test(d)), validation.validation.diagnostics.join(" | "));
        const broken = await command(id, game.id, { type: "validate", language, source: BROKEN[language] }, ada);
        assert.equal(broken.accepted, false);
        assert.equal(broken.validation.valid, false);
        assert.equal((await command(id, game.id, { type: "validate", language: other, source: spec.agents[other] }, ada)).accepted, false);
        const before = (await json(get(`/player/v1/rooms/${id}/observation`, ada))).self.energy;
        assert.equal((await command(id, game.id, { type: "summon", language, source }, ada)).accepted, true);
        assert.equal((await command(id, game.id, { type: "summon", language, source }, bo)).accepted, true);
        obs = await json(get(`/player/v1/rooms/${id}/observation`, ada));
        assert.equal(obs.agents.length, 1, "own agents only");
        const [mine] = obs.agents;
        assert.equal(mine.summonCost, validation.validation.cost);
        near(mine.expectedActCost, validation.validation.expectedActCost, "the expected act cost is deterministic per source");
        assert.deepEqual([mine.energy, mine.eligible, mine.acts, mine.spent], [0, false, 0, 0]);
        assert.ok(obs.self.energy <= before - mine.summonCost + 1, "summoning is paid from god energy");
        const bos = (await json(get(`/player/v1/rooms/${id}/observation`, bo))).agents;
        near(bos[0].expectedActCost, mine.expectedActCost, "same source, same expected cost");
        await mutate(id, async (draft) => {
          draft.game.planningEndsAt = Date.now() - 1;
          draft.game.endAtWorld = 3600;
        });
        stop = startTicker();
        await waitUntil(async () => (await json(get(`/player/v1/rooms/${id}/observation`, ada))).transformations.length >= 2, "Ada's agent transforms objects");
        obs = await json(get(`/player/v1/rooms/${id}/observation`, ada));
        const mutatorIds = obs.instance.mutators.map((m) => m.id);
        for (const tr of obs.transformations) {
          assert.ok(tr.calls.length >= 1 && tr.calls.every((c) => mutatorIds.includes(c[0])) && tr.cost > 0);
          assert.notEqual(tr.before, tr.after);
        }
        const acted = obs.agents[0];
        assert.ok(acted.acts >= 2 && acted.spent > 0, "acts are charged to the agent's own account");
        assert.equal(acted.eligible, acted.energy >= acted.expectedActCost);
        await stop();
        stop = void 0;
        await waitUntil(() => interactionCapacity(id) && fixtureControl.interactionWrites > 0, "batches flushed", 5e3);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const agentState = (r) => r.game.agents.map((a) => [a.id, a.acts, a.spent, a.account]);
        assert.deepEqual(agentState(rehydrateInteractions(fixtureDurableRoom(id), fixtureDurableBatches())), agentState(resolveRoom(id)));
        assert.equal((await command(id, game.id, { type: "destroy", agentId: acted.id }, bo)).accepted, false);
        const energyBefore = obs.self.energy;
        assert.equal((await command(id, game.id, { type: "destroy", agentId: acted.id }, ada)).accepted, true);
        obs = await json(get(`/player/v1/rooms/${id}/observation`, ada));
        assert.equal(obs.agents.length, 0);
        assert.ok(obs.self.energy >= energyBefore, "destroying costs nothing");
        assert.equal(resolveRoom(id).game.agents.length, 1, "Bo's agent lives on");
        await act(id, { action: "endGame" });
        const history = await json(get(`/rooms/${id}/games`));
        const record2 = history.find((h) => h.id === game.id);
        assert.equal(record2.scoring, "information-v1");
        assert.equal(record2.endReason, "owner");
        assert.equal(record2.leaderboard.length, 3);
        assert.ok(record2.leaderboard.every((row) => typeof row.totalPayoff === "number" && row.rank >= 1));
        view = await json(get(`/games/${game.shortCode}/state`));
        assert.equal(view.status, "ended");
        for (const leak of ["scores", "netBits", "source", "deities", "account"]) {
          assert.ok(!JSON.stringify(history).includes(`"${leak}"`) && !JSON.stringify(view).includes(`"${leak}"`), `history hides ${leak}`);
        }
      }
      assert.equal((await json(get(`/rooms/${id}/games`))).length, 2, "one game per language");
    } finally {
      await stop?.();
      server.close();
      shutdownRuntimeAdapters();
    }
  });
}
test("replay restores agent accounts from failed and successful acts, and fails closed on unknown agents", () => {
  const account = (balance, world) => ({ balance, settledWorldSeconds: world });
  const agent = { ...richAgent("god", ADD_TS), id: "agent", account: account(0, 0) };
  const checkpoint = { id: "room", seq: 3, game: { id: "game", objects: [{ id: "object", value: 0, version: 0, scores: {} }], agents: [agent], events: [] } };
  const cost = (total) => ({ decision: total, erasure: 0, motion: 0, total });
  const events = [
    {
      id: "e1",
      gameId: "game",
      type: "agent.failed",
      timestamp: 1,
      objectId: "object",
      agentId: "agent",
      ownerId: "god",
      reason: "no change",
      cost: cost(1),
      agent: { id: "agent", account: account(4, 2), acts: 1, spent: 1 }
    },
    {
      id: "e2",
      gameId: "game",
      type: "object.transformed",
      timestamp: 2,
      before: 0,
      agentId: "agent",
      ownerId: "god",
      object: { id: "object", value: 1, version: 1, scores: {} },
      calls: [["add", { k: 1 }]],
      cost: cost(5),
      agent: { id: "agent", account: account(-1, 3), acts: 2, spent: 6 }
    }
  ];
  const recovered = rehydrateInteractions(checkpoint, [{ room_id: "room", game_id: "game", end_seq: 5, events }]);
  assert.equal(recovered.seq, 5);
  assert.equal(recovered.game.objects[0].value, 1);
  assert.deepEqual(recovered.game.agents[0].account, account(-1, 3), "a negative balance (cooldown) survives replay");
  assert.deepEqual([recovered.game.agents[0].acts, recovered.game.agents[0].spent], [2, 6]);
  assert.equal(checkpoint.game.agents[0].acts, 0, "the checkpoint itself is not mutated");
  assert.throws(() => rehydrateInteractions(checkpoint, [{
    room_id: "room",
    game_id: "game",
    end_seq: 4,
    events: [{ ...events[0], agent: { ...events[0].agent, id: "ghost" } }]
  }]), /agent/);
});
test("startup guard: a stored room of the old design is reset; its games leave history", { timeout: 6e4 }, async () => {
  const host = { id: randomUUID4(), name: "Old Host", kind: "human", scope: "browser" };
  fixtureActors.set("old:host", host);
  const roomId = randomUUID4(), oldGameId = randomUUID4();
  const oldGame = {
    id: oldGameId,
    shortCode: "OLD",
    phase: "running",
    settings: {
      language: "python",
      objectType: "Int",
      intMin: 0,
      intMax: 9,
      grammarId: "python-standard-v1"
    },
    roster: [],
    deities: [],
    objects: [{ id: "o", value: 3, version: 0, utilities: { [host.id]: 0.5 } }],
    agents: [{ id: "a", ownerId: host.id, source: "lambda x: x", cost: 6, createdAt: 1 }],
    events: [],
    createdAt: 1
  };
  fixtureRooms.set(roomId, {
    id: roomId,
    shortCode: "OLDR",
    ownerId: host.id,
    createdAt: 5,
    revision: 3,
    seq: 7,
    settings: oldGame.settings,
    members: [{ id: host.id, name: host.name, kind: "human", ready: true }],
    chat: [{ id: "c", authorId: host.id, authorName: host.name, kind: "human", text: "kept", timestamp: 1 }],
    game: oldGame,
    aiBudget: 0,
    aiUsed: 0,
    receipts: {}
  });
  fixtureGames.set(oldGameId, oldGame);
  fixtureGameRows.set(oldGameId, {
    id: oldGameId,
    room_id: roomId,
    prefix_length: 3,
    started_at: 1,
    ended_at: 2,
    summary: { id: oldGameId, leaderboard: [{ deityId: host.id, totalScore: 1, rank: 1 }] }
  });
  fixtureBatches.set(`${roomId}:9`, { room_id: roomId, game_id: oldGameId, end_seq: 9, events: [{ type: "object.transformed" }] });
  await initializeStore();
  const reset = resolveRoom(roomId);
  assert.equal(reset.game, null);
  assert.deepEqual(reset.members.map((m) => m.id), [host.id]);
  assert.deepEqual(reset.chat.map((m) => m.text), ["kept"]);
  assert.equal(reset.settings.grammarId, "python-agent-v1");
  assert.ok(reset.seq > 9, "the reset checkpoint covers (and deletes) the old batches");
  assert.equal([...fixtureBatches.values()].filter((b) => b.room_id === roomId).length, 0);
  assert.equal(fixtureRooms.get(roomId).game, null);
  const app = express();
  app.use(express.json(), rooms_default, games_default);
  app.use((error, _req, res, _next) => res.status(error.status ?? 400).json({ error: error.message }));
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = (path) => fetch(`${base}${path}`, { headers: { authorization: "Bearer old:host" } });
    assert.deepEqual(await (await get(`/rooms/${roomId}/games`)).json(), [], "old-design games are not history");
    assert.equal((await get(`/games/${oldGameId}/state`)).status, 404);
    const room = await (await get(`/rooms/${roomId}`)).json();
    assert.equal(room.objectInstance.key, "Int(-2147483648,2147483647)");
  } finally {
    server.close();
  }
});
test("graceful store shutdown flushes the bounded interaction window to disk", async () => {
  const host = { id: randomUUID4(), name: "Shutdown", kind: "human", scope: "browser" };
  const room = await createRoom(host);
  await mutate(room.id, async (draft) => {
    draft.game = {
      id: randomUUID4(),
      shortCode: "shutdown",
      phase: "ended",
      objects: [{ id: "object", value: 0, version: 0, utilities: {} }],
      events: []
    };
  });
  await mutateInteraction(room.id, "object", (draft) => {
    const g = draft.game, object2 = g.objects[0];
    object2.version++;
    g.events.push({ id: randomUUID4(), gameId: g.id, type: "object.transformed", timestamp: Date.now(), before: object2.value, object: { ...object2 } });
    return true;
  });
  assert.equal(fixtureDurableRoom(room.id).game.objects[0].version, 0);
  await closeStore();
  assert.equal(fixtureDurableRoom(room.id).game.objects[0].version, 0, "shutdown need not rewrite checkpoints");
  assert.equal(
    rehydrateInteractions(fixtureDurableRoom(room.id), fixtureDurableBatches()).game.objects[0].version,
    1,
    "committed log reconstructs the latest state after abrupt process loss"
  );
  assert.equal(interactionCapacity(room.id), false);
  await assert.rejects(mutate(room.id, async () => {
  }), /shutting down/);
});
