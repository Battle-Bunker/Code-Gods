// test/device-security.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID as randomUUID6, createHash as createHash4 } from "node:crypto";
import { WebSocket as WebSocket2 } from "ws";

// src/app.ts
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";

// src/routes/index.ts
import { Router as Router2 } from "express";

// src/routes/health.ts
import { Router } from "express";

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
var createRoomResponseSettingsOneUtilitySelectorIdDefault = `fair-aligned`;
var createRoomResponseSettingsOneInteractionRateHzDefault = 100;
var createRoomResponseSettingsOneInteractionRateHzMin = 0;
var createRoomResponseSettingsOneInteractionRateHzMax = 1e3;
var createRoomResponseSettingsOneInteractionComputeMsDefault = 1e3;
var createRoomResponseSettingsOneInteractionComputeMsMax = 1e3;
var createRoomResponseSettingsOneStepBudgetDefault = 5e5;
var createRoomResponseSettingsOneStepBudgetMax = 1e7;
var createRoomResponseSettingsOnePerActFloorBitsDefault = 2;
var createRoomResponseSettingsOnePerActFloorBitsMin = 0;
var createRoomResponseSettingsOnePriorIdDefault = `uniform`;
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
var createRoomResponseSettingsOneExcludedFamiliesDefault = [];
var createRoomResponseSettingsOneExcludedFamiliesMax = 200;
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
    "utilitySelectorId": zod.string().default(createRoomResponseSettingsOneUtilitySelectorIdDefault).describe("fair-aligned (default) or divine-lottery."),
    "complexityFunctionId": zod.enum(["ast-bits-v1", "ts-ast-bits-v1-uniform"]).describe("The summon price: ast-bits-v1 (Python) or ts-ast-bits-v1-uniform (TypeScript). One per language."),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(createRoomResponseSettingsOneInteractionRateHzMin).max(createRoomResponseSettingsOneInteractionRateHzMax).default(createRoomResponseSettingsOneInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(createRoomResponseSettingsOneInteractionComputeMsMax).default(createRoomResponseSettingsOneInteractionComputeMsDefault).describe("CPU backstop per act in milliseconds (excludes compilation and worker startup). The deterministic stepBudget is what binds."),
    "stepBudget": zod.number().int().min(1).max(createRoomResponseSettingsOneStepBudgetMax).default(createRoomResponseSettingsOneStepBudgetDefault).describe("Deterministic step budget per act."),
    "perActFloorBits": zod.number().min(createRoomResponseSettingsOnePerActFloorBitsMin).default(createRoomResponseSettingsOnePerActFloorBitsDefault).describe("Bits added to every attempted act's charge, valid or not (the Margolus\u2013Levitin floor)."),
    "priorId": zod.string().default(createRoomResponseSettingsOnePriorIdDefault).describe("The rarity prior (Manifest.priors); uniform for now."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(createRoomResponseSettingsOneAgentEnergyPerSecondMin).max(createRoomResponseSettingsOneAgentEnergyPerSecondMax).default(createRoomResponseSettingsOneAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(createRoomResponseSettingsOneAgentBatteryActsMax).default(createRoomResponseSettingsOneAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(createRoomResponseSettingsOneMaxAgentsPerGodMax).default(createRoomResponseSettingsOneMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(createRoomResponseSettingsOnePenaltyWeightMin).default(createRoomResponseSettingsOnePenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(createRoomResponseSettingsOneDefenceRateMin).max(createRoomResponseSettingsOneDefenceRateMax).default(createRoomResponseSettingsOneDefenceRateDefault).describe("Probability that a god is also dealt a defence goal."),
    "excludedFamilies": zod.array(zod.string()).max(createRoomResponseSettingsOneExcludedFamiliesMax).default(createRoomResponseSettingsOneExcludedFamiliesDefault).describe("Utility families never dealt in this game (ids from the catalog of this object type).")
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
    "excluded": zod.boolean().describe("Taken out of the lottery by settings.excludedFamilies."),
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
var getRoomResponseSettingsOneUtilitySelectorIdDefault = `fair-aligned`;
var getRoomResponseSettingsOneInteractionRateHzDefault = 100;
var getRoomResponseSettingsOneInteractionRateHzMin = 0;
var getRoomResponseSettingsOneInteractionRateHzMax = 1e3;
var getRoomResponseSettingsOneInteractionComputeMsDefault = 1e3;
var getRoomResponseSettingsOneInteractionComputeMsMax = 1e3;
var getRoomResponseSettingsOneStepBudgetDefault = 5e5;
var getRoomResponseSettingsOneStepBudgetMax = 1e7;
var getRoomResponseSettingsOnePerActFloorBitsDefault = 2;
var getRoomResponseSettingsOnePerActFloorBitsMin = 0;
var getRoomResponseSettingsOnePriorIdDefault = `uniform`;
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
var getRoomResponseSettingsOneExcludedFamiliesDefault = [];
var getRoomResponseSettingsOneExcludedFamiliesMax = 200;
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
    "utilitySelectorId": zod.string().default(getRoomResponseSettingsOneUtilitySelectorIdDefault).describe("fair-aligned (default) or divine-lottery."),
    "complexityFunctionId": zod.enum(["ast-bits-v1", "ts-ast-bits-v1-uniform"]).describe("The summon price: ast-bits-v1 (Python) or ts-ast-bits-v1-uniform (TypeScript). One per language."),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(getRoomResponseSettingsOneInteractionRateHzMin).max(getRoomResponseSettingsOneInteractionRateHzMax).default(getRoomResponseSettingsOneInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(getRoomResponseSettingsOneInteractionComputeMsMax).default(getRoomResponseSettingsOneInteractionComputeMsDefault).describe("CPU backstop per act in milliseconds (excludes compilation and worker startup). The deterministic stepBudget is what binds."),
    "stepBudget": zod.number().int().min(1).max(getRoomResponseSettingsOneStepBudgetMax).default(getRoomResponseSettingsOneStepBudgetDefault).describe("Deterministic step budget per act."),
    "perActFloorBits": zod.number().min(getRoomResponseSettingsOnePerActFloorBitsMin).default(getRoomResponseSettingsOnePerActFloorBitsDefault).describe("Bits added to every attempted act's charge, valid or not (the Margolus\u2013Levitin floor)."),
    "priorId": zod.string().default(getRoomResponseSettingsOnePriorIdDefault).describe("The rarity prior (Manifest.priors); uniform for now."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(getRoomResponseSettingsOneAgentEnergyPerSecondMin).max(getRoomResponseSettingsOneAgentEnergyPerSecondMax).default(getRoomResponseSettingsOneAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(getRoomResponseSettingsOneAgentBatteryActsMax).default(getRoomResponseSettingsOneAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(getRoomResponseSettingsOneMaxAgentsPerGodMax).default(getRoomResponseSettingsOneMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(getRoomResponseSettingsOnePenaltyWeightMin).default(getRoomResponseSettingsOnePenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(getRoomResponseSettingsOneDefenceRateMin).max(getRoomResponseSettingsOneDefenceRateMax).default(getRoomResponseSettingsOneDefenceRateDefault).describe("Probability that a god is also dealt a defence goal."),
    "excludedFamilies": zod.array(zod.string()).max(getRoomResponseSettingsOneExcludedFamiliesMax).default(getRoomResponseSettingsOneExcludedFamiliesDefault).describe("Utility families never dealt in this game (ids from the catalog of this object type).")
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
    "excluded": zod.boolean().describe("Taken out of the lottery by settings.excludedFamilies."),
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
var listRoomGamesResponseSettingsUtilitySelectorIdDefault = `fair-aligned`;
var listRoomGamesResponseSettingsInteractionRateHzDefault = 100;
var listRoomGamesResponseSettingsInteractionRateHzMin = 0;
var listRoomGamesResponseSettingsInteractionRateHzMax = 1e3;
var listRoomGamesResponseSettingsInteractionComputeMsDefault = 1e3;
var listRoomGamesResponseSettingsInteractionComputeMsMax = 1e3;
var listRoomGamesResponseSettingsStepBudgetDefault = 5e5;
var listRoomGamesResponseSettingsStepBudgetMax = 1e7;
var listRoomGamesResponseSettingsPerActFloorBitsDefault = 2;
var listRoomGamesResponseSettingsPerActFloorBitsMin = 0;
var listRoomGamesResponseSettingsPriorIdDefault = `uniform`;
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
var listRoomGamesResponseSettingsExcludedFamiliesDefault = [];
var listRoomGamesResponseSettingsExcludedFamiliesMax = 200;
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
    "utilitySelectorId": zod.string().default(listRoomGamesResponseSettingsUtilitySelectorIdDefault).describe("fair-aligned (default) or divine-lottery."),
    "complexityFunctionId": zod.enum(["ast-bits-v1", "ts-ast-bits-v1-uniform"]).describe("The summon price: ast-bits-v1 (Python) or ts-ast-bits-v1-uniform (TypeScript). One per language."),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(listRoomGamesResponseSettingsInteractionRateHzMin).max(listRoomGamesResponseSettingsInteractionRateHzMax).default(listRoomGamesResponseSettingsInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(listRoomGamesResponseSettingsInteractionComputeMsMax).default(listRoomGamesResponseSettingsInteractionComputeMsDefault).describe("CPU backstop per act in milliseconds (excludes compilation and worker startup). The deterministic stepBudget is what binds."),
    "stepBudget": zod.number().int().min(1).max(listRoomGamesResponseSettingsStepBudgetMax).default(listRoomGamesResponseSettingsStepBudgetDefault).describe("Deterministic step budget per act."),
    "perActFloorBits": zod.number().min(listRoomGamesResponseSettingsPerActFloorBitsMin).default(listRoomGamesResponseSettingsPerActFloorBitsDefault).describe("Bits added to every attempted act's charge, valid or not (the Margolus\u2013Levitin floor)."),
    "priorId": zod.string().default(listRoomGamesResponseSettingsPriorIdDefault).describe("The rarity prior (Manifest.priors); uniform for now."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(listRoomGamesResponseSettingsAgentEnergyPerSecondMin).max(listRoomGamesResponseSettingsAgentEnergyPerSecondMax).default(listRoomGamesResponseSettingsAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(listRoomGamesResponseSettingsAgentBatteryActsMax).default(listRoomGamesResponseSettingsAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(listRoomGamesResponseSettingsMaxAgentsPerGodMax).default(listRoomGamesResponseSettingsMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(listRoomGamesResponseSettingsPenaltyWeightMin).default(listRoomGamesResponseSettingsPenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(listRoomGamesResponseSettingsDefenceRateMin).max(listRoomGamesResponseSettingsDefenceRateMax).default(listRoomGamesResponseSettingsDefenceRateDefault).describe("Probability that a god is also dealt a defence goal."),
    "excludedFamilies": zod.array(zod.string()).max(listRoomGamesResponseSettingsExcludedFamiliesMax).default(listRoomGamesResponseSettingsExcludedFamiliesDefault).describe("Utility families never dealt in this game (ids from the catalog of this object type).")
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
  "scoring": zod.enum(["information-v1"]).describe("Information scoring: payoffs in bits\xB2."),
  "seasonCommitment": zod.string().describe("sha256 (hex) of the season salt behind this game's seeds; the salt is revealed after the season.")
}).describe("Public result of one finished game, kept in its room's history.");
var ListRoomGamesResponse = zod.array(ListRoomGamesResponseItem);
var GetGameStateParams = zod.object({
  "code": zod.coerce.string().describe("Game short code or UUID")
});
var getGameStateResponseOneSettingsUtilitySelectorIdDefault = `fair-aligned`;
var getGameStateResponseOneSettingsInteractionRateHzDefault = 100;
var getGameStateResponseOneSettingsInteractionRateHzMin = 0;
var getGameStateResponseOneSettingsInteractionRateHzMax = 1e3;
var getGameStateResponseOneSettingsInteractionComputeMsDefault = 1e3;
var getGameStateResponseOneSettingsInteractionComputeMsMax = 1e3;
var getGameStateResponseOneSettingsStepBudgetDefault = 5e5;
var getGameStateResponseOneSettingsStepBudgetMax = 1e7;
var getGameStateResponseOneSettingsPerActFloorBitsDefault = 2;
var getGameStateResponseOneSettingsPerActFloorBitsMin = 0;
var getGameStateResponseOneSettingsPriorIdDefault = `uniform`;
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
var getGameStateResponseOneSettingsExcludedFamiliesDefault = [];
var getGameStateResponseOneSettingsExcludedFamiliesMax = 200;
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
    "utilitySelectorId": zod.string().default(getGameStateResponseOneSettingsUtilitySelectorIdDefault).describe("fair-aligned (default) or divine-lottery."),
    "complexityFunctionId": zod.enum(["ast-bits-v1", "ts-ast-bits-v1-uniform"]).describe("The summon price: ast-bits-v1 (Python) or ts-ast-bits-v1-uniform (TypeScript). One per language."),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(getGameStateResponseOneSettingsInteractionRateHzMin).max(getGameStateResponseOneSettingsInteractionRateHzMax).default(getGameStateResponseOneSettingsInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(getGameStateResponseOneSettingsInteractionComputeMsMax).default(getGameStateResponseOneSettingsInteractionComputeMsDefault).describe("CPU backstop per act in milliseconds (excludes compilation and worker startup). The deterministic stepBudget is what binds."),
    "stepBudget": zod.number().int().min(1).max(getGameStateResponseOneSettingsStepBudgetMax).default(getGameStateResponseOneSettingsStepBudgetDefault).describe("Deterministic step budget per act."),
    "perActFloorBits": zod.number().min(getGameStateResponseOneSettingsPerActFloorBitsMin).default(getGameStateResponseOneSettingsPerActFloorBitsDefault).describe("Bits added to every attempted act's charge, valid or not (the Margolus\u2013Levitin floor)."),
    "priorId": zod.string().default(getGameStateResponseOneSettingsPriorIdDefault).describe("The rarity prior (Manifest.priors); uniform for now."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(getGameStateResponseOneSettingsAgentEnergyPerSecondMin).max(getGameStateResponseOneSettingsAgentEnergyPerSecondMax).default(getGameStateResponseOneSettingsAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(getGameStateResponseOneSettingsAgentBatteryActsMax).default(getGameStateResponseOneSettingsAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(getGameStateResponseOneSettingsMaxAgentsPerGodMax).default(getGameStateResponseOneSettingsMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(getGameStateResponseOneSettingsPenaltyWeightMin).default(getGameStateResponseOneSettingsPenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(getGameStateResponseOneSettingsDefenceRateMin).max(getGameStateResponseOneSettingsDefenceRateMax).default(getGameStateResponseOneSettingsDefenceRateDefault).describe("Probability that a god is also dealt a defence goal."),
    "excludedFamilies": zod.array(zod.string()).max(getGameStateResponseOneSettingsExcludedFamiliesMax).default(getGameStateResponseOneSettingsExcludedFamiliesDefault).describe("Utility families never dealt in this game (ids from the catalog of this object type).")
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
    "excluded": zod.boolean().describe("Taken out of the lottery by settings.excludedFamilies."),
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
var roomActionBodySettingsUtilitySelectorIdDefault = `fair-aligned`;
var roomActionBodySettingsInteractionRateHzDefault = 100;
var roomActionBodySettingsInteractionRateHzMin = 0;
var roomActionBodySettingsInteractionRateHzMax = 1e3;
var roomActionBodySettingsInteractionComputeMsDefault = 1e3;
var roomActionBodySettingsInteractionComputeMsMax = 1e3;
var roomActionBodySettingsStepBudgetDefault = 5e5;
var roomActionBodySettingsStepBudgetMax = 1e7;
var roomActionBodySettingsPerActFloorBitsDefault = 2;
var roomActionBodySettingsPerActFloorBitsMin = 0;
var roomActionBodySettingsPriorIdDefault = `uniform`;
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
var roomActionBodySettingsExcludedFamiliesDefault = [];
var roomActionBodySettingsExcludedFamiliesMax = 200;
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
    "utilitySelectorId": zod.string().default(roomActionBodySettingsUtilitySelectorIdDefault).describe("fair-aligned (default) or divine-lottery."),
    "complexityFunctionId": zod.enum(["ast-bits-v1", "ts-ast-bits-v1-uniform"]).describe("The summon price: ast-bits-v1 (Python) or ts-ast-bits-v1-uniform (TypeScript). One per language."),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(roomActionBodySettingsInteractionRateHzMin).max(roomActionBodySettingsInteractionRateHzMax).default(roomActionBodySettingsInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(roomActionBodySettingsInteractionComputeMsMax).default(roomActionBodySettingsInteractionComputeMsDefault).describe("CPU backstop per act in milliseconds (excludes compilation and worker startup). The deterministic stepBudget is what binds."),
    "stepBudget": zod.number().int().min(1).max(roomActionBodySettingsStepBudgetMax).default(roomActionBodySettingsStepBudgetDefault).describe("Deterministic step budget per act."),
    "perActFloorBits": zod.number().min(roomActionBodySettingsPerActFloorBitsMin).default(roomActionBodySettingsPerActFloorBitsDefault).describe("Bits added to every attempted act's charge, valid or not (the Margolus\u2013Levitin floor)."),
    "priorId": zod.string().default(roomActionBodySettingsPriorIdDefault).describe("The rarity prior (Manifest.priors); uniform for now."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(roomActionBodySettingsAgentEnergyPerSecondMin).max(roomActionBodySettingsAgentEnergyPerSecondMax).default(roomActionBodySettingsAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(roomActionBodySettingsAgentBatteryActsMax).default(roomActionBodySettingsAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(roomActionBodySettingsMaxAgentsPerGodMax).default(roomActionBodySettingsMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(roomActionBodySettingsPenaltyWeightMin).default(roomActionBodySettingsPenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(roomActionBodySettingsDefenceRateMin).max(roomActionBodySettingsDefenceRateMax).default(roomActionBodySettingsDefenceRateDefault).describe("Probability that a god is also dealt a defence goal."),
    "excludedFamilies": zod.array(zod.string()).max(roomActionBodySettingsExcludedFamiliesMax).default(roomActionBodySettingsExcludedFamiliesDefault).describe("Utility families never dealt in this game (ids from the catalog of this object type).")
  }).optional(),
  "ready": zod.boolean().optional(),
  "text": zod.string().max(roomActionBodyTextMax).optional(),
  "deityId": zod.string().optional(),
  "aiBudget": zod.number().int().min(roomActionBodyAiBudgetMin).max(roomActionBodyAiBudgetMax).optional(),
  "aiAgentId": zod.string().optional(),
  "preset": zod.string().optional().describe("settings only: apply a Manifest.presets entry instead of `settings` (keeps the room's language unless settings.language is sent).")
});
var roomActionResponseSettingsOneUtilitySelectorIdDefault = `fair-aligned`;
var roomActionResponseSettingsOneInteractionRateHzDefault = 100;
var roomActionResponseSettingsOneInteractionRateHzMin = 0;
var roomActionResponseSettingsOneInteractionRateHzMax = 1e3;
var roomActionResponseSettingsOneInteractionComputeMsDefault = 1e3;
var roomActionResponseSettingsOneInteractionComputeMsMax = 1e3;
var roomActionResponseSettingsOneStepBudgetDefault = 5e5;
var roomActionResponseSettingsOneStepBudgetMax = 1e7;
var roomActionResponseSettingsOnePerActFloorBitsDefault = 2;
var roomActionResponseSettingsOnePerActFloorBitsMin = 0;
var roomActionResponseSettingsOnePriorIdDefault = `uniform`;
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
var roomActionResponseSettingsOneExcludedFamiliesDefault = [];
var roomActionResponseSettingsOneExcludedFamiliesMax = 200;
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
    "utilitySelectorId": zod.string().default(roomActionResponseSettingsOneUtilitySelectorIdDefault).describe("fair-aligned (default) or divine-lottery."),
    "complexityFunctionId": zod.enum(["ast-bits-v1", "ts-ast-bits-v1-uniform"]).describe("The summon price: ast-bits-v1 (Python) or ts-ast-bits-v1-uniform (TypeScript). One per language."),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(roomActionResponseSettingsOneInteractionRateHzMin).max(roomActionResponseSettingsOneInteractionRateHzMax).default(roomActionResponseSettingsOneInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(roomActionResponseSettingsOneInteractionComputeMsMax).default(roomActionResponseSettingsOneInteractionComputeMsDefault).describe("CPU backstop per act in milliseconds (excludes compilation and worker startup). The deterministic stepBudget is what binds."),
    "stepBudget": zod.number().int().min(1).max(roomActionResponseSettingsOneStepBudgetMax).default(roomActionResponseSettingsOneStepBudgetDefault).describe("Deterministic step budget per act."),
    "perActFloorBits": zod.number().min(roomActionResponseSettingsOnePerActFloorBitsMin).default(roomActionResponseSettingsOnePerActFloorBitsDefault).describe("Bits added to every attempted act's charge, valid or not (the Margolus\u2013Levitin floor)."),
    "priorId": zod.string().default(roomActionResponseSettingsOnePriorIdDefault).describe("The rarity prior (Manifest.priors); uniform for now."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(roomActionResponseSettingsOneAgentEnergyPerSecondMin).max(roomActionResponseSettingsOneAgentEnergyPerSecondMax).default(roomActionResponseSettingsOneAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(roomActionResponseSettingsOneAgentBatteryActsMax).default(roomActionResponseSettingsOneAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(roomActionResponseSettingsOneMaxAgentsPerGodMax).default(roomActionResponseSettingsOneMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(roomActionResponseSettingsOnePenaltyWeightMin).default(roomActionResponseSettingsOnePenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(roomActionResponseSettingsOneDefenceRateMin).max(roomActionResponseSettingsOneDefenceRateMax).default(roomActionResponseSettingsOneDefenceRateDefault).describe("Probability that a god is also dealt a defence goal."),
    "excludedFamilies": zod.array(zod.string()).max(roomActionResponseSettingsOneExcludedFamiliesMax).default(roomActionResponseSettingsOneExcludedFamiliesDefault).describe("Utility families never dealt in this game (ids from the catalog of this object type).")
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
    "excluded": zod.boolean().describe("Taken out of the lottery by settings.excludedFamilies."),
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
var getManifestResponseDefaultsUtilitySelectorIdDefault = `fair-aligned`;
var getManifestResponseDefaultsInteractionRateHzDefault = 100;
var getManifestResponseDefaultsInteractionRateHzMin = 0;
var getManifestResponseDefaultsInteractionRateHzMax = 1e3;
var getManifestResponseDefaultsInteractionComputeMsDefault = 1e3;
var getManifestResponseDefaultsInteractionComputeMsMax = 1e3;
var getManifestResponseDefaultsStepBudgetDefault = 5e5;
var getManifestResponseDefaultsStepBudgetMax = 1e7;
var getManifestResponseDefaultsPerActFloorBitsDefault = 2;
var getManifestResponseDefaultsPerActFloorBitsMin = 0;
var getManifestResponseDefaultsPriorIdDefault = `uniform`;
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
var getManifestResponseDefaultsExcludedFamiliesDefault = [];
var getManifestResponseDefaultsExcludedFamiliesMax = 200;
var getManifestResponsePresetsItemSettingsUtilitySelectorIdDefault = `fair-aligned`;
var getManifestResponsePresetsItemSettingsInteractionRateHzDefault = 100;
var getManifestResponsePresetsItemSettingsInteractionRateHzMin = 0;
var getManifestResponsePresetsItemSettingsInteractionRateHzMax = 1e3;
var getManifestResponsePresetsItemSettingsInteractionComputeMsDefault = 1e3;
var getManifestResponsePresetsItemSettingsInteractionComputeMsMax = 1e3;
var getManifestResponsePresetsItemSettingsStepBudgetDefault = 5e5;
var getManifestResponsePresetsItemSettingsStepBudgetMax = 1e7;
var getManifestResponsePresetsItemSettingsPerActFloorBitsDefault = 2;
var getManifestResponsePresetsItemSettingsPerActFloorBitsMin = 0;
var getManifestResponsePresetsItemSettingsPriorIdDefault = `uniform`;
var getManifestResponsePresetsItemSettingsAgentEnergyPerSecondDefault = 2;
var getManifestResponsePresetsItemSettingsAgentEnergyPerSecondMin = 0;
var getManifestResponsePresetsItemSettingsAgentEnergyPerSecondMax = 1e3;
var getManifestResponsePresetsItemSettingsAgentBatteryActsDefault = 2;
var getManifestResponsePresetsItemSettingsAgentBatteryActsMax = 1e3;
var getManifestResponsePresetsItemSettingsMaxAgentsPerGodDefault = 200;
var getManifestResponsePresetsItemSettingsMaxAgentsPerGodMax = 200;
var getManifestResponsePresetsItemSettingsPenaltyWeightDefault = 1;
var getManifestResponsePresetsItemSettingsPenaltyWeightMin = 0;
var getManifestResponsePresetsItemSettingsDefenceRateDefault = 0;
var getManifestResponsePresetsItemSettingsDefenceRateMin = 0;
var getManifestResponsePresetsItemSettingsDefenceRateMax = 1;
var getManifestResponsePresetsItemSettingsExcludedFamiliesDefault = [];
var getManifestResponsePresetsItemSettingsExcludedFamiliesMax = 200;
var GetManifestResponse = zod.object({
  "protocolVersion": zod.number().int(),
  "playerProtocol": zod.string().describe("Player protocol version accepted at /player/v1 (code-gods.player.v3)."),
  "minimumPlayers": zod.number().int(),
  "defaults": zod.object({
    "language": zod.enum(["python", "typescript"]),
    "objectType": zod.enum(["Int", "string", "Grid"]).describe("The object type constructor."),
    "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.").describe("Its arguments. Only instantiations listed in Manifest.objectTypes[].offered are accepted."),
    "grammarId": zod.enum(["python-agent-v1", "typescript-agent-v1"]),
    "utilitySelectorId": zod.string().default(getManifestResponseDefaultsUtilitySelectorIdDefault).describe("fair-aligned (default) or divine-lottery."),
    "complexityFunctionId": zod.enum(["ast-bits-v1", "ts-ast-bits-v1-uniform"]).describe("The summon price: ast-bits-v1 (Python) or ts-ast-bits-v1-uniform (TypeScript). One per language."),
    "spawnFunctionId": zod.enum(["uniform"]),
    "planningSeconds": zod.number(),
    "halfLifeSeconds": zod.number(),
    "startingObjectCount": zod.number().int(),
    "spawnRateHz": zod.number(),
    "interactionRateHz": zod.number().min(getManifestResponseDefaultsInteractionRateHzMin).max(getManifestResponseDefaultsInteractionRateHzMax).default(getManifestResponseDefaultsInteractionRateHzDefault),
    "interactionComputeMs": zod.number().int().min(1).max(getManifestResponseDefaultsInteractionComputeMsMax).default(getManifestResponseDefaultsInteractionComputeMsDefault).describe("CPU backstop per act in milliseconds (excludes compilation and worker startup). The deterministic stepBudget is what binds."),
    "stepBudget": zod.number().int().min(1).max(getManifestResponseDefaultsStepBudgetMax).default(getManifestResponseDefaultsStepBudgetDefault).describe("Deterministic step budget per act."),
    "perActFloorBits": zod.number().min(getManifestResponseDefaultsPerActFloorBitsMin).default(getManifestResponseDefaultsPerActFloorBitsDefault).describe("Bits added to every attempted act's charge, valid or not (the Margolus\u2013Levitin floor)."),
    "priorId": zod.string().default(getManifestResponseDefaultsPriorIdDefault).describe("The rarity prior (Manifest.priors); uniform for now."),
    "pauseSeconds": zod.number(),
    "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
    "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
    "agentEnergyPerSecond": zod.number().min(getManifestResponseDefaultsAgentEnergyPerSecondMin).max(getManifestResponseDefaultsAgentEnergyPerSecondMax).default(getManifestResponseDefaultsAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
    "agentBatteryActs": zod.number().min(1).max(getManifestResponseDefaultsAgentBatteryActsMax).default(getManifestResponseDefaultsAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
    "maxAgentsPerGod": zod.number().int().min(1).max(getManifestResponseDefaultsMaxAgentsPerGodMax).default(getManifestResponseDefaultsMaxAgentsPerGodDefault),
    "penaltyWeight": zod.number().min(getManifestResponseDefaultsPenaltyWeightMin).default(getManifestResponseDefaultsPenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
    "defenceRate": zod.number().min(getManifestResponseDefaultsDefenceRateMin).max(getManifestResponseDefaultsDefenceRateMax).default(getManifestResponseDefaultsDefenceRateDefault).describe("Probability that a god is also dealt a defence goal."),
    "excludedFamilies": zod.array(zod.string()).max(getManifestResponseDefaultsExcludedFamiliesMax).default(getManifestResponseDefaultsExcludedFamiliesDefault).describe("Utility families never dealt in this game (ids from the catalog of this object type).")
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
    "settingsDefaults": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Tuned settings for this type or instantiation (e.g. Grid: startingObjectCount 80, spawnRateHz 0.5). The server applies them when the owner switches to it, unless the request changes those fields."),
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
      "classes": zod.array(zod.string()),
      "settingsDefaults": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Tuned settings for this type or instantiation (e.g. Grid: startingObjectCount 80, spawnRateHz 0.5). The server applies them when the owner switches to it, unless the request changes those fields.")
    }).describe("An instantiation the server offers (every utility function dealable in it has a calibration table)."))
  })).describe("Object types for the settings pickers. Settings may choose only an instantiation listed in `offered`."),
  "priors": zod.array(zod.string()).describe("Rarity priors the calibration tables know."),
  "presets": zod.array(zod.object({
    "id": zod.string(),
    "label": zod.string(),
    "kid": zod.string(),
    "objectType": zod.string(),
    "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}."),
    "settings": zod.object({
      "language": zod.enum(["python", "typescript"]),
      "objectType": zod.enum(["Int", "string", "Grid"]).describe("The object type constructor."),
      "typeArgs": zod.record(zod.string(), zod.union([zod.number(), zod.string()])).describe("Arguments of the object type constructor, e.g. Int {min, max}, string {maxLength}, Grid {size, symbols, colours}.").describe("Its arguments. Only instantiations listed in Manifest.objectTypes[].offered are accepted."),
      "grammarId": zod.enum(["python-agent-v1", "typescript-agent-v1"]),
      "utilitySelectorId": zod.string().default(getManifestResponsePresetsItemSettingsUtilitySelectorIdDefault).describe("fair-aligned (default) or divine-lottery."),
      "complexityFunctionId": zod.enum(["ast-bits-v1", "ts-ast-bits-v1-uniform"]).describe("The summon price: ast-bits-v1 (Python) or ts-ast-bits-v1-uniform (TypeScript). One per language."),
      "spawnFunctionId": zod.enum(["uniform"]),
      "planningSeconds": zod.number(),
      "halfLifeSeconds": zod.number(),
      "startingObjectCount": zod.number().int(),
      "spawnRateHz": zod.number(),
      "interactionRateHz": zod.number().min(getManifestResponsePresetsItemSettingsInteractionRateHzMin).max(getManifestResponsePresetsItemSettingsInteractionRateHzMax).default(getManifestResponsePresetsItemSettingsInteractionRateHzDefault),
      "interactionComputeMs": zod.number().int().min(1).max(getManifestResponsePresetsItemSettingsInteractionComputeMsMax).default(getManifestResponsePresetsItemSettingsInteractionComputeMsDefault).describe("CPU backstop per act in milliseconds (excludes compilation and worker startup). The deterministic stepBudget is what binds."),
      "stepBudget": zod.number().int().min(1).max(getManifestResponsePresetsItemSettingsStepBudgetMax).default(getManifestResponsePresetsItemSettingsStepBudgetDefault).describe("Deterministic step budget per act."),
      "perActFloorBits": zod.number().min(getManifestResponsePresetsItemSettingsPerActFloorBitsMin).default(getManifestResponsePresetsItemSettingsPerActFloorBitsDefault).describe("Bits added to every attempted act's charge, valid or not (the Margolus\u2013Levitin floor)."),
      "priorId": zod.string().default(getManifestResponsePresetsItemSettingsPriorIdDefault).describe("The rarity prior (Manifest.priors); uniform for now."),
      "pauseSeconds": zod.number(),
      "startingEnergy": zod.number().describe("God energy (bits) at the start; pays summon prices."),
      "energyPerSecond": zod.number().describe("God income, bits per real-time second."),
      "agentEnergyPerSecond": zod.number().min(getManifestResponsePresetsItemSettingsAgentEnergyPerSecondMin).max(getManifestResponsePresetsItemSettingsAgentEnergyPerSecondMax).default(getManifestResponsePresetsItemSettingsAgentEnergyPerSecondDefault).describe("Each agent's income, bits per second of world time."),
      "agentBatteryActs": zod.number().min(1).max(getManifestResponsePresetsItemSettingsAgentBatteryActsMax).default(getManifestResponsePresetsItemSettingsAgentBatteryActsDefault).describe("An agent's energy is capped at this many expected acts."),
      "maxAgentsPerGod": zod.number().int().min(1).max(getManifestResponsePresetsItemSettingsMaxAgentsPerGodMax).default(getManifestResponsePresetsItemSettingsMaxAgentsPerGodDefault),
      "penaltyWeight": zod.number().min(getManifestResponsePresetsItemSettingsPenaltyWeightMin).default(getManifestResponsePresetsItemSettingsPenaltyWeightDefault).describe("w in n = s\u207A \u2212 w(h \u2212 E h): the weight of a defence-goal bit."),
      "defenceRate": zod.number().min(getManifestResponsePresetsItemSettingsDefenceRateMin).max(getManifestResponsePresetsItemSettingsDefenceRateMax).default(getManifestResponsePresetsItemSettingsDefenceRateDefault).describe("Probability that a god is also dealt a defence goal."),
      "excludedFamilies": zod.array(zod.string()).max(getManifestResponsePresetsItemSettingsExcludedFamiliesMax).default(getManifestResponsePresetsItemSettingsExcludedFamiliesDefault).describe("Utility families never dealt in this game (ids from the catalog of this object type).")
    }),
    "offered": zod.boolean().describe("Whether its instantiation is currently offered.")
  })).describe("Named starting points, in display order.")
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
    "summonCost": zod.number().describe("Description bits paid once from god energy (ast-bits-v1 / ts-ast-bits-v1-uniform)."),
    "decisionBits": zod.number().describe("Measured decision information, charged on every act."),
    "expectedActCost": zod.number().describe("Expected charge per act over the season's reference mixture."),
    "breakdown": zod.object({
      "decision": zod.number().describe("Measured decision information I(X; A), charged on every act."),
      "erasure": zod.number(),
      "motion": zod.number(),
      "floor": zod.number()
    }).describe("Expected bits per act, by term."),
    "randomized": zod.boolean().describe("The agent uses random (measured over several seeds)."),
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
    "cost": zod.number().describe("Summon price in bits."),
    "parts": zod.object({
      "structure": zod.number(),
      "names": zod.number(),
      "literals": zod.number(),
      "moveFlags": zod.number(),
      "literalMoves": zod.number()
    }).optional(),
    "decisionBits": zod.number().optional(),
    "expectedActCost": zod.number().describe("Expected charge per act."),
    "breakdown": zod.object({
      "decision": zod.number().describe("Measured decision information I(X; A), charged on every act."),
      "erasure": zod.number(),
      "motion": zod.number(),
      "floor": zod.number()
    }).optional().describe("Expected bits per act, by term."),
    "randomized": zod.boolean().optional(),
    "diagnostics": zod.array(zod.string())
  }).optional()
});

// src/routes/health.ts
var router = Router();
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});
var health_default = router;

// src/routes/index.ts
var router2 = Router2();
router2.use(health_default);
var routes_default = router2;

// src/app.ts
import cookieParser from "cookie-parser";

// src/lib/identity.ts
import { createHash, randomBytes } from "node:crypto";

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
import * as oidc from "openid-client";
var hash = (value) => createHash("sha256").update(value).digest("hex");
var opaque = () => randomBytes(32).toString("base64url");
var cookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/" };
var config;
var getOidc = () => config ??= oidc.discovery(new URL("https://replit.com/oidc"), process.env.REPL_ID);
function origin(req) {
  const host = req.get("host");
  if (!host || /[\\/\s]/.test(host)) throw new Error("Invalid host");
  return `https://${host}`;
}
function safeReturn(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/";
  return value;
}
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
function isAdmin(identity) {
  if (!identity || identity.scope !== "browser" || identity.issuer !== "https://replit.com/oidc" || identity.emailVerified !== true || typeof identity.email !== "string") return false;
  const allowed = (process.env.CODE_GODS_ADMIN_EMAILS ?? "").split(/[,;\s]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(identity.email.trim().toLowerCase());
}
function requireAdmin(req) {
  const identity = requireIdentity(req);
  if (!isAdmin(identity)) throw Object.assign(new Error("Administrator access required"), { status: 403 });
  return identity;
}
function sameOrigin(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.headers.authorization?.startsWith("Bearer ")) return next();
  if (req.get("origin") !== origin(req)) return next(Object.assign(new Error("Origin check failed"), { status: 403 }));
  next();
}

// src/routes/auth.ts
import { Router as Router3 } from "express";
import * as oidc2 from "openid-client";

// src/lib/profile-name.ts
function profileName(claims) {
  const text = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const first = text(claims.first_name) || text(claims.given_name);
  const last = text(claims.last_name) || text(claims.family_name);
  const full = first && last ? `${first} ${last}` : text(claims.name);
  return (full || first || last || text(claims.preferred_username) || `Deity ${text(claims.sub)}`).slice(0, 160);
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
var rooms2 = /* @__PURE__ */ new Map();
var tails = /* @__PURE__ */ new Map();
var closing = false;
var interactionBuffers = /* @__PURE__ */ new Map();
var bufferedInteractions = 0;
var flushFailure;
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
async function roomHistory(roomId, limit = 100) {
  const rows = await pool.query(`SELECT id,prefix_length,summary FROM cg_games WHERE room_id=$1 AND summary->>'scoring'='${SCORING}'
    ORDER BY started_at DESC NULLS LAST LIMIT $2`, [roomId, limit]);
  return rows.rows.map((row) => ({ ...row.summary, shortCode: encodeUuid(row.id).slice(0, row.prefix_length) }));
}
async function findGame(code) {
  const normalized = code.trim().toUpperCase();
  for (const room of rooms2.values()) {
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
  const live = rooms2.get(roomId)?.game;
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
    return Array.isArray(game.roster) && Array.isArray(game.deities) && Array.isArray(game.events) && Array.isArray(game.objects) && game.objects.every((o) => isObject(o) && isObject(o.scores)) && typeof game.seasonCommitment === "string" && Array.isArray(game.agents) && game.agents.every((a) => isObject(a) && isObject(a.account) && typeof a.expectedActCost === "number" && typeof a.decisionBits === "number" && isObject(a.breakdown));
  } catch {
    return false;
  }
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
async function synchronizePlayerName(id, name) {
  for (const room of allRooms()) {
    if (!room.members.some((m) => m.id === id) && !room.chat.some((m) => m.authorId === id) && !room.game?.roster.some((m) => m.id === id)) continue;
    await mutate(room.id, async (draft) => {
      for (const member2 of draft.members) if (member2.id === id) member2.name = name;
      for (const member2 of draft.game?.roster ?? []) if (member2.id === id) member2.name = name;
      for (const message of draft.chat) if (message.authorId === id) message.authorName = name;
    });
  }
}

// src/routes/auth.ts
var router3 = Router3();
router3.get("/auth/user", (req, res) => {
  const user = req.identity?.scope === "browser" ? { id: req.identity.id, name: req.identity.name, isAdmin: isAdmin(req.identity) } : null;
  res.json({ user });
});
router3.get("/login", async (req, res) => {
  const config2 = await getOidc();
  const verifier = oidc2.randomPKCECodeVerifier(), state = oidc2.randomState(), nonce = oidc2.randomNonce();
  const key = opaque();
  await pool.query(
    "INSERT INTO cg_sessions(hash,data,expires) VALUES($1,$2,$3)",
    [hash(key), JSON.stringify({ verifier, state, nonce, returnTo: safeReturn(req.query.returnTo), flow: "oidc" }), new Date(Date.now() + 6e5)]
  );
  res.cookie("cg_oidc", key, { ...cookieOptions, maxAge: 6e5 });
  res.redirect(oidc2.buildAuthorizationUrl(config2, {
    redirect_uri: `${origin(req)}/api/callback`,
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: await oidc2.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256"
  }).href);
});
router3.get("/callback", async (req, res) => {
  const key = req.cookies?.cg_oidc;
  if (typeof key !== "string") {
    res.status(400).send("Login expired; please try again.");
    return;
  }
  const result = await pool.query("DELETE FROM cg_sessions WHERE hash=$1 AND expires>now() RETURNING data", [hash(key)]);
  res.clearCookie("cg_oidc", cookieOptions);
  const flow = result.rows[0]?.data;
  if (flow?.flow !== "oidc") {
    res.status(400).send("Login expired; please try again.");
    return;
  }
  const tokens = await oidc2.authorizationCodeGrant(await getOidc(), new URL(req.originalUrl, origin(req)), {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new Error("Identity provider returned no subject");
  const name = profileName(claims);
  await synchronizePlayerName(claims.sub, name);
  await pool.query("UPDATE cg_sessions SET data=jsonb_set(data,'{name}',to_jsonb($2::text)) WHERE data->>'id'=$1", [claims.sub, name]);
  await pool.query("UPDATE cg_devices SET user_name=$2 WHERE user_id=$1", [claims.sub, name]);
  const token = await issueSession({
    id: claims.sub,
    name,
    kind: "human",
    scope: "browser",
    email: typeof claims.email === "string" ? claims.email : void 0,
    emailVerified: claims.email_verified === true,
    issuer: claims.iss
  }, 864e5);
  res.cookie("cg_session", token, { ...cookieOptions, maxAge: 864e5 });
  res.redirect(safeReturn(flow.returnTo));
});
router3.get("/logout", async (req, res) => {
  if (typeof req.cookies?.cg_session === "string") {
    await pool.query("DELETE FROM cg_sessions WHERE hash=$1", [hash(req.cookies.cg_session)]);
    invalidateSession(hash(req.cookies.cg_session), req.identity?.expiresAt);
  }
  res.clearCookie("cg_session", cookieOptions);
  res.redirect("/");
});
var auth_default = router3;

// src/routes/rooms.ts
import { Router as Router4 } from "express";
import { randomUUID as randomUUID4 } from "node:crypto";
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS2, SETTINGS_OPTIONS, SETTINGS_PRESETS, instantiationOf as instantiationOf5, presetSettings, typeDefaults, validateSettings as validateSettings4 } from "@workspace/game-core";
import { familiesFor } from "@workspace/game-utilities";
import { OBJECT_TYPES, instanceInfo as instanceInfo2 } from "@workspace/game-types";
import { VERSION as PLAYER_PROTOCOL } from "@workspace/player-client";

// src/game/calibration.ts
import { UNIFORM_PRIOR } from "@workspace/game-utilities";
import { tableFor, hasTable, surprisal, penaltyMeanBits, offeredInstantiations } from "@workspace/game-utilities";
var PRIORS = Object.freeze({ [UNIFORM_PRIOR.id]: UNIFORM_PRIOR });
function priorOf(priorId) {
  const prior = PRIORS[priorId];
  if (!prior) throw Object.assign(new Error(`Unknown prior ${priorId}: choose one of ${Object.keys(PRIORS).join(", ")}`), { status: 400 });
  return prior;
}

// src/game/engine.ts
import { randomBytes as randomBytes4, randomUUID as randomUUID2 } from "node:crypto";
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
import { randomBytes as randomBytes2 } from "node:crypto";
var runtime;
var utilities;
var AGENT_FAULTS = /* @__PURE__ */ new Set(["COMPILE", "DOMAIN", "EXECUTION", "LIMIT"]);
var isAgentFault = (error) => !!error && typeof error === "object" && AGENT_FAULTS.has(String(error.code));
var cryptoRng = {
  big(bound) {
    if (bound <= 0n) throw new Error("Random bound must be positive");
    const bytes = Math.ceil(bound.toString(2).length / 8);
    const range = 1n << BigInt(bytes * 8), limit = range - range % bound;
    for (; ; ) {
      const n = BigInt(`0x${randomBytes2(bytes).toString("hex")}`);
      if (n < limit) return n % bound;
    }
  },
  int(bound) {
    if (!Number.isSafeInteger(bound) || bound <= 0) throw new Error("Random bound must be a positive safe integer");
    return Number(cryptoRng.big(BigInt(bound)));
  }
};
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
import { createHash as createHash2, randomBytes as randomBytes3 } from "node:crypto";
var salt;
var commitment;
function load() {
  if (salt !== void 0) return salt;
  const configured = process.env.CODE_GODS_SEASON_SALT;
  if (configured && configured.length >= 16) salt = configured;
  else if (process.env.NODE_ENV === "production") {
    throw new Error("CODE_GODS_SEASON_SALT must be set (at least 16 characters) in production");
  } else {
    salt = randomBytes3(32).toString("hex");
    console.warn("CODE_GODS_SEASON_SALT is not set: using a random per-process season salt (development and tests only)");
  }
  commitment = createHash2("sha256").update(salt, "utf8").digest("hex");
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
    let bits = inspection.literalMoveFallbackBits[i];
    if (m) {
      try {
        bits = MOVE_FLAG_BITS + lg(avail.length) + m.describeBits(m.parse(raw, inst), inst);
      } catch {
      }
    }
    literalMoves += bits;
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
  const config2 = AI_MODEL_CATALOG.find((item) => item.provider === provider && item.id === model);
  if (!config2) throw Object.assign(new Error("Select an available model for the chosen provider"), { status: 400 });
  return config2;
}
function getAIProvider(selection) {
  const config2 = getAIModel(selection.provider, selection.model);
  const key = config2.provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw Object.assign(new Error(`AI players require a server-side ${config2.provider} API key`), { status: 503 });
  return config2.provider === "anthropic" ? createDirectAnthropicProvider(key, { ...config2, model: config2.id }) : createDirectOpenAIProvider(key, config2.id, config2);
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
var openUniform = () => (randomBytes4(6).readUIntBE(0, 6) + 0.5) / 281474976710656;
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
  const object2 = { id: randomUUID2(), value, version: 0, scores: scoresOf(game, value) };
  game.objects.push(object2);
  recordEvent(game, { id: randomUUID2(), gameId: game.id, type: "object.spawned", object: structuredClone(object2), timestamp: Date.now() });
}
function recordEvent(game, event) {
  game.events.push(event);
  if (game.events.length > 5e3) game.events.splice(0, game.events.length - 5e3);
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
        id: randomUUID2(),
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

// src/game/agent-library.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { z } from "zod";
function listAgentModels() {
  return AI_MODEL_CATALOG.map((model) => ({
    ...model,
    configured: Boolean((model.provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY)?.trim())
  }));
}
var agentInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().min(1),
  prompt: z.string().max(1e4)
}).strict();
var agentUpdateSchema = agentInputSchema.extend({ revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
var agentRevisionSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
function validateModel(input) {
  getAIModel(input.provider, input.model);
}
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
async function listAgentDefinitions() {
  const result = await pool.query("SELECT * FROM cg_ai_agents ORDER BY created_at,id");
  return result.rows.map(definition);
}
async function getAgentDefinition(id) {
  const result = await pool.query("SELECT * FROM cg_ai_agents WHERE id=$1", [id]);
  return result.rows[0] ? definition(result.rows[0]) : void 0;
}
async function listPublicAgents() {
  const result = await pool.query("SELECT id,name,provider,model FROM cg_ai_agents ORDER BY created_at,id");
  return result.rows;
}
async function createAgent(input) {
  input = agentInputSchema.parse(input);
  validateModel(input);
  const result = await pool.query(
    "INSERT INTO cg_ai_agents(id,name,provider,model,prompt) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [randomUUID3(), input.name, input.provider, input.model, input.prompt]
  );
  return definition(result.rows[0]);
}
async function missingOrConflict(id) {
  if (!await getAgentDefinition(id)) throw Object.assign(new Error("AI agent not found"), { status: 404 });
  throw Object.assign(new Error("AI agent changed; reload before saving"), { status: 409 });
}
async function updateAgent(id, input) {
  input = agentUpdateSchema.parse(input);
  validateModel(input);
  const result = await pool.query(
    "UPDATE cg_ai_agents SET name=$2,provider=$3,model=$4,prompt=$5,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$6 RETURNING *",
    [id, input.name, input.provider, input.model, input.prompt, input.revision]
  );
  return result.rows[0] ? definition(result.rows[0]) : missingOrConflict(id);
}
async function deleteAgent(id, revision) {
  revision = agentRevisionSchema.parse(revision);
  const result = await pool.query("DELETE FROM cg_ai_agents WHERE id=$1 AND revision=$2 RETURNING id", [id, revision]);
  if (!result.rowCount) await missingOrConflict(id);
}

// src/routes/rooms.ts
var router4 = Router4();
var objectTypes;
function objectTypesManifest() {
  return objectTypes ??= OBJECT_TYPES.map((T) => ({
    id: T.id,
    label: T.label,
    emoji: T.emoji,
    kid: T.kid,
    params: T.params,
    defaults: T.defaults,
    // Tuned settings for games of this type (e.g. Grid: more objects, faster spawns).
    settingsDefaults: typeDefaults(T.id),
    classes: T.classes.map((c) => ({ id: c.id, slot: c.slot, superclasses: c.superclasses, badge: c.badge })),
    offered: offeredInstantiations(T.id).map((inst) => {
      const info = instanceInfo2(inst);
      return {
        key: inst.key,
        args: inst.args,
        label: info.label,
        badges: info.badges,
        classes: inst.classes,
        settingsDefaults: typeDefaults(T.id, inst.args)
      };
    })
  }));
}
function retuneSettings(previous, next, sent) {
  const before = instantiationOf5(previous).key, after = instantiationOf5(next).key;
  if (before === after) return next;
  const oldDefaults = typeDefaults(previous.objectType, previous.typeArgs);
  const newDefaults = typeDefaults(next.objectType, next.typeArgs);
  const tuned = /* @__PURE__ */ new Set([...Object.keys(oldDefaults), ...Object.keys(newDefaults)]);
  const out = { ...next };
  for (const key of tuned) {
    if (!(key in sent) || JSON.stringify(sent[key]) === JSON.stringify(previous[key])) out[key] = newDefaults[key] ?? DEFAULT_SETTINGS2[key];
  }
  return out;
}
var isOffered = (settings) => {
  const inst = instantiationOf5(settings);
  return offeredInstantiations(settings.objectType).some((offered) => offered.key === inst.key);
};
function assertOffered(settings) {
  priorOf(settings.priorId);
  if (!isOffered(settings))
    throw new Error(`${instantiationOf5(settings).key} is not offered: choose one of the listed ${settings.objectType} settings`);
  const known = new Set(familiesFor(settings.objectType).map((f) => f.id));
  const unknown2 = settings.excludedFamilies.filter((id) => !known.has(id));
  if (unknown2.length) throw new Error(`Unknown ${settings.objectType} utility families: ${unknown2.join(", ")}`);
}
function presetsManifest() {
  return SETTINGS_PRESETS.map((p) => {
    const settings = presetSettings(p.id);
    return { id: p.id, label: p.label, kid: p.kid, objectType: p.objectType, typeArgs: p.typeArgs, settings, offered: isOffered(settings) };
  });
}
router4.get("/manifest", (_req, res) => res.json({
  protocolVersion: 1,
  playerProtocol: PLAYER_PROTOCOL,
  minimumPlayers: 3,
  defaults: DEFAULT_SETTINGS2,
  runtimes: runtime?.languages ?? [],
  options: SETTINGS_OPTIONS,
  aiFunding: aiFundingStatus(),
  objectTypes: objectTypesManifest(),
  presets: presetsManifest(),
  priors: Object.keys(PRIORS)
}));
router4.get("/rooms", (req, res) => {
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
router4.post("/rooms", async (req, res) => {
  CreateRoomBody.parse(req.body ?? {});
  res.status(201).json(publicRoom(await createRoom(requireIdentity(req))));
});
router4.get("/rooms/:roomId", (req, res) => {
  const actor = requireIdentity(req);
  if (actor.scope !== "browser" && actor.roomId !== resolveRoom(String(req.params.roomId)).id)
    throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  res.json(publicRoom(resolveRoom(String(req.params.roomId))));
});
router4.post("/rooms/:roomId/actions", async (req, res) => {
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
      if (!input.settings && !input.preset) throw new Error("Settings or a preset are required");
      const settings = input.preset ? presetSettings(input.preset, input.settings?.language ?? room.settings.language) : retuneSettings(room.settings, input.settings, req.body?.settings ?? {});
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
        id: `ai:${randomUUID4()}`,
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
router4.get("/rooms/:roomId/games", async (req, res) => {
  const actor = requireIdentity(req), room = resolveRoom(String(req.params.roomId));
  if (actor.scope !== "browser" && actor.roomId !== room.id) throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  res.set("Cache-Control", "no-store").json(await roomHistory(room.id));
});
router4.get("/rooms/:roomId/chat", (req, res) => {
  const room = resolveRoom(String(req.params.roomId));
  member(room, requireIdentity(req));
  const before = Number(req.query.before ?? Infinity);
  res.json(room.chat.filter((m) => m.timestamp < before).slice(-100));
});
var rooms_default = router4;

// src/routes/games.ts
import { Router as Router5 } from "express";

// src/game/game-links.ts
import { encodeUuid as encodeUuid2, resolveIdentifier as resolveIdentifier2 } from "@workspace/game-core";
function resolveGameLink(code, games2, rooms3, actor) {
  let id;
  try {
    id = resolveIdentifier2(code, games2.map((game2) => game2.id));
  } catch (error) {
    throw Object.assign(error, { status: 404 });
  }
  const game = games2.find((candidate) => candidate.id === id);
  if (actor.scope !== "browser" && actor.roomId !== game.room_id) {
    throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  }
  const room = rooms3.find((candidate) => candidate.id === game.room_id);
  return {
    id,
    shortCode: encodeUuid2(id).slice(0, game.prefix_length),
    roomShortCode: room?.shortCode ?? null,
    status: !room ? "unavailable" : room.game?.id === id ? "current" : "historical"
  };
}

// src/routes/games.ts
var router5 = Router5();
router5.get("/games/:code", async (req, res) => {
  const actor = requireIdentity(req);
  const games2 = await pool.query("SELECT id,room_id,prefix_length FROM cg_games");
  res.set("Cache-Control", "no-store").json(resolveGameLink(String(req.params.code), games2.rows, allRooms(), actor));
});
router5.get("/games/:code/state", async (req, res) => {
  const actor = requireIdentity(req);
  const { game, roomId } = await findGame(String(req.params.code));
  if (actor.scope !== "browser" && actor.roomId !== roomId) throw Object.assign(new Error("Wrong room scope"), { status: 403 });
  const room = allRooms().find((r) => r.id === roomId) ?? null;
  res.set("Cache-Control", "no-store").json(publicGameView(game, room));
});
var games_default = router5;

// src/routes/device.ts
import { Router as Router6 } from "express";
import { randomUUID as randomUUID5, randomBytes as randomBytes5, createHash as createHash3 } from "node:crypto";
var router6 = Router6();
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
  return [deviceId, hash(deviceSecret), createHash3("sha256").update(verifier).digest("base64url")];
}
async function invalidateRows(rows) {
  for (const row of rows) invalidateSession(row.hash, row.data.expiresAt);
}
var attempts = /* @__PURE__ */ new Map();
router6.use("/device", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const key = req.ip ?? "unknown", now = Date.now();
  let record2 = attempts.get(key);
  if (!record2 || now - record2.since > 6e4) {
    record2 = { count: 0, since: now };
    attempts.set(key, record2);
  }
  if (++record2.count > 60) {
    res.status(429).json({ error: "Too many device requests" });
    return;
  }
  if (attempts.size > 1e4) {
    for (const [key2, entry] of attempts) if (now - entry.since > 6e4) attempts.delete(key2);
  }
  next();
});
router6.post("/device/request", async (req, res) => {
  if (typeof req.body?.roomId !== "string" || typeof req.body?.challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(req.body.challenge))
    throw fail("roomId and S256 challenge required");
  const permission = req.body.permission ?? "act";
  const clientLabel = req.body.clientLabel ?? "Room assistant";
  if (!["read", "act", "owner"].includes(permission)) throw fail("permission must be read, act or owner");
  if (typeof clientLabel !== "string" || !clientLabel.trim() || clientLabel.length > 120 || /[\u0000-\u001f\u007f]/.test(clientLabel))
    throw fail("clientLabel must be 1\u2013120 printable characters (self-reported)");
  const room = resolveRoom(req.body.roomId), id = randomUUID5(), secret = opaque();
  const code = randomBytes5(5).toString("hex").toUpperCase();
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
router6.get("/device/details", async (req, res) => {
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
for (const decision of ["approve", "deny"]) router6.post(`/device/${decision}`, async (req, res) => {
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
router6.post("/device/poll", async (req, res) => {
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
router6.post("/device/cancel", async (req, res) => {
  const args = proof(req.body);
  const result = await pool.query("DELETE FROM cg_devices WHERE id=$1 AND secret_hash=$2 AND challenge=$3 RETURNING id", args);
  if (!result.rows.length) throw fail("Invalid or already cancelled device request");
  const deleted = await pool.query("DELETE FROM cg_sessions WHERE data->>'delegateId'=$1 RETURNING hash,data", [args[0]]);
  await invalidateRows(deleted.rows);
  res.json({ status: "cancelled" });
});
router6.get("/device/grants", async (req, res) => {
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
router6.post("/device/grants/:delegateId/revoke", async (req, res) => {
  const actor = browser(req);
  const result = await pool.query(`DELETE FROM cg_sessions WHERE data->>'delegateId'=$1 AND data->>'id'=$2
    AND data->>'scope'='player' RETURNING hash,data`, [String(req.params.delegateId), actor.id]);
  if (!result.rows.length) throw fail("Grant not found", 404);
  await invalidateRows(result.rows);
  res.json({ status: "revoked" });
});
router6.post("/device/revoke", async (req, res) => {
  const actor = requireIdentity(req);
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : void 0;
  if (!token || actor.scope !== "player") throw fail("Player bearer required", 403);
  await pool.query("DELETE FROM cg_sessions WHERE hash=$1", [hash(token)]);
  invalidateSession(hash(token), actor.expiresAt);
  res.json({ status: "revoked" });
});
var device_default = router6;

// src/routes/player.ts
import { Router as Router7 } from "express";

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
var router7 = Router7();
router7.get("/player/v1/rooms/:roomId/observation", (req, res) => {
  res.set("Cache-Control", "no-store").json(observation(resolveRoom(String(req.params.roomId)), requireIdentity(req)));
});
router7.post("/player/v1/rooms/:roomId/commands", async (req, res) => {
  res.json(await executePlayerEnvelope(String(req.params.roomId), requireIdentity(req), req.body));
});
var player_default = router7;

// src/routes/admin-agents.ts
import { Router as Router8 } from "express";
var router8 = Router8();
router8.get("/ai-agents", async (req, res) => {
  requireIdentity(req);
  res.json({ agents: await listPublicAgents() });
});
router8.use("/admin/ai-agents", (req, _res, next) => {
  try {
    requireAdmin(req);
    next();
  } catch (error) {
    next(error);
  }
});
router8.get("/admin/ai-agents", async (_req, res) => {
  res.json({ agents: await listAgentDefinitions(), models: listAgentModels() });
});
router8.post("/admin/ai-agents", async (req, res) => {
  res.status(201).json(await createAgent(agentInputSchema.parse(req.body)));
});
router8.patch("/admin/ai-agents/:id", async (req, res) => {
  res.json(await updateAgent(req.params.id, agentUpdateSchema.parse(req.body)));
});
router8.delete("/admin/ai-agents/:id", async (req, res) => {
  await deleteAgent(req.params.id, agentRevisionSchema.parse(req.query.revision));
  res.status(204).end();
});
var admin_agents_default = router8;

// src/app.ts
var app = express();
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0]
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode
        };
      }
    }
  })
);
app.set("trust proxy", 1);
app.use(cors({ origin: false }));
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(authenticate);
app.use("/api", auth_default);
app.use((req, res, next) => {
  if (["/api/device/request", "/api/device/poll", "/api/device/cancel"].includes(req.path)) return next();
  sameOrigin(req, res, next);
});
app.use((req, _res, next) => {
  if (req.identity && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !/^\/api\/device\/(?:cancel|revoke)\/?$/.test(req.path)) requireAct(req.identity);
  next();
});
app.post("/api/activity", async (req, res) => {
  const actor = requireIdentity(req);
  if (actor.kind !== "human") {
    res.status(403).json({ error: "Human identity required" });
    return;
  }
  res.set("Cache-Control", "no-store").json(await recordHumanActivity());
});
app.use(async (req, res, next) => {
  if (req.path === "/api/healthz" || req.path === "/api/health" || req.path === "/api/device/poll" || req.path === "/api/device/revoke") return next();
  const protectedPath = /^\/api\/(?:manifest|games\/[^/]+|rooms(?:\/[^/]+(?:\/(?:actions|chat))?)?|player\/v1\/rooms\/[^/]+\/(?:observation|commands)|ai-agents|admin\/ai-agents(?:\/[^/]+)?|device\/(?:request|approve))\/?$/.test(req.path);
  if (!protectedPath) return next();
  if (req.path !== "/api/device/request" && req.path !== "/api/manifest") requireIdentity(req);
  if (!await isServerActive()) {
    res.set("Cache-Control", "no-store").set("Connection", "close").status(503).json({ error: "Server is idle; wake it with an authenticated POST /api/activity", code: "SERVER_IDLE" });
    return;
  }
  const humanMutation = req.identity?.kind === "human" && ["POST", "PATCH", "DELETE"].includes(req.method) && /^(?:\/api\/rooms(?:\/[^/]+\/actions)?|\/api\/player\/v1\/rooms\/[^/]+\/commands|\/api\/admin\/ai-agents(?:\/[^/]+)?|\/api\/device\/approve)\/?$/.test(req.path);
  if (humanMutation) {
    let accepted = true;
    const json = res.json;
    res.json = function(body) {
      if (body?.accepted === false) accepted = false;
      return json.call(this, body);
    };
    res.once("finish", () => {
      if (accepted && res.statusCode >= 200 && res.statusCode < 300) {
        void recordHumanActivity();
      }
    });
  }
  next();
});
app.use("/api", device_default, rooms_default, games_default, player_default);
app.use("/api", admin_agents_default);
app.use("/api", routes_default);
app.use((error, req, res, _next) => {
  const status = error.status ?? (error.name === "ZodError" ? 400 : 400);
  if (status >= 500) req.log.error({ errorName: error.name }, "Request failed");
  res.status(status).json({ error: error.message ?? "Request failed", code: error.code });
});
var app_default = app;

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

// test/device-security.test.ts
test("delegated authorization lifecycle, permissions and passive invalidation", { timeout: 2e4 }, async () => {
  const host = { id: randomUUID6(), name: "Owner", kind: "human", scope: "browser" };
  const peer = { id: randomUUID6(), name: "Peer", kind: "human", scope: "browser" };
  const outsider = { id: randomUUID6(), name: "Outsider", kind: "human", scope: "browser" };
  const room = await createRoom(host), other = await createRoom(host);
  await mutate(room.id, async (draft) => {
    draft.members.push({ id: peer.id, name: peer.name, kind: "human", ready: false });
  });
  await recordHumanActivity();
  const hostToken = await issueSession(host, 6e4), peerToken = await issueSession(peer, 6e4), outsiderToken = await issueSession(outsider, 6e4);
  const server = createServer(app_default), closeSockets = attachSockets(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  let requestNumber = 0;
  const request = async (path, body, token) => {
    const response = await fetch(`${base}/api${path}`, {
      method: body === void 0 ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `192.0.2.${++requestNumber}`,
        ...token ? { authorization: `Bearer ${token}` } : {}
      },
      ...body === void 0 ? {} : { body: JSON.stringify(body) }
    });
    return { status: response.status, body: await response.json() };
  };
  const initiate = async (permission) => {
    const verifier = "a".repeat(43), challenge = createHash4("sha256").update(verifier).digest("base64url");
    const result = await request("/device/request", { roomId: room.shortCode.toLowerCase(), challenge, clientLabel: "Self-reported assistant", ...permission ? { permission } : {} });
    assert.equal(result.status, 200);
    return { ...result.body, verifier };
  };
  const credentials = (grant2) => ({ deviceId: grant2.deviceId, deviceSecret: grant2.deviceSecret, verifier: grant2.verifier });
  const approve = async (grant2, token = hostToken) => request("/device/approve", { code: grant2.userCode }, token);
  const poll = async (grant2) => request("/device/poll", credentials(grant2));
  const grant = async (permission) => {
    const pending = await initiate(permission);
    assert.equal((await approve(pending)).status, 200);
    const redeemed = await poll(pending);
    assert.equal(redeemed.status, 200);
    return { ...pending, ...redeemed.body };
  };
  const sockets = [];
  const connect = async (token, roomId = room.id) => {
    const ws = new WebSocket2(`${base.replace("http", "ws")}/api/rooms/${roomId}/ws`, { headers: { authorization: `Bearer ${token}` } });
    sockets.push(ws);
    await once(ws, "open");
    return ws;
  };
  const wsCommand = async (ws, input) => {
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.off("message", listener);
        reject(new Error("No command result"));
      }, 2e3);
      const listener = (data) => {
        const event = JSON.parse(String(data));
        if (event.type === "command.receipt" || event.type === "command.error") {
          clearTimeout(timer);
          ws.off("message", listener);
          resolve(event);
        }
      };
      ws.on("message", listener);
    });
    ws.send(JSON.stringify(input));
    return result;
  };
  const envelope = (command = { type: "ready", ready: true }) => ({ version: "1", commandId: randomUUID6(), command });
  const { VERSION: VERSION3 } = await import("@workspace/player-client");
  const ready = () => ({ ...envelope(), version: VERSION3 });
  try {
    const pending = await initiate();
    assert.equal(pending.permission, "act", "legacy requests default to act");
    assert.equal(pending.delegateId, pending.deviceId);
    assert.equal((await request(`/device/details?code=${pending.userCode}`)).status, 401);
    assert.equal((await request(`/device/details?code=${pending.userCode}`, void 0, outsiderToken)).status, 403);
    const details = await request(`/device/details?code=${pending.userCode}`, void 0, hostToken);
    assert.deepEqual(Object.keys(details.body).sort(), ["canApprove", "clientLabel", "expiresAt", "permission", "roomCode", "roomId", "status"].sort());
    assert.equal(details.body.canApprove, true);
    assert.equal(details.body.roomId, room.id);
    assert.equal(details.body.roomCode, room.shortCode);
    assert.equal(details.body.clientLabel, "Self-reported assistant");
    assert.equal(details.body.status, "pending");
    assert.equal((await poll(pending)).status, 202);
    assert.equal((await approve(pending, outsiderToken)).status, 403);
    assert.equal((await approve(pending)).status, 200);
    assert.equal((await request(`/device/details?code=${pending.userCode}`, void 0, peerToken)).status, 403);
    assert.equal((await approve(pending, peerToken)).status, 400, "approval cannot be stolen");
    assert.equal((await request("/device/poll", { ...credentials(pending), verifier: "wrong" })).status, 400);
    assert.equal((await request("/device/poll", { ...credentials(pending), deviceSecret: "wrong" })).status, 400);
    const redeemed = await poll(pending);
    assert.equal(redeemed.status, 200);
    assert.equal((await poll(pending)).status, 400, "PKCE redemption is single-use");
    const persisted = fixtureSessions.get(hash(redeemed.body.token)).data;
    assert.equal(persisted.delegateId, pending.deviceId);
    assert.equal(persisted.permission, "act");
    assert.equal(persisted.scope, "player");
    assert.equal(persisted.clientLabel, details.body.clientLabel);
    assert.equal((await request(`/player/v1/rooms/${other.id}/observation`, void 0, redeemed.body.token)).status, 403);
    assert.deepEqual((await request("/rooms", void 0, redeemed.body.token)).body.map((r) => r.id), [room.id]);
    assert.equal((await request(`/rooms/${room.id}/actions`, { action: "start", requestId: randomUUID6() }, redeemed.body.token)).status, 403, "owner's delegate has no host powers");
    const denied = await initiate("read");
    assert.equal((await request("/device/deny", { code: denied.userCode }, hostToken)).body.status, "denied");
    assert.equal((await poll(denied)).body.status, "denied");
    const cancelled = await initiate("read");
    assert.equal((await request("/device/cancel", { ...credentials(cancelled), verifier: "wrong" })).status, 400);
    assert.equal((await request("/device/cancel", credentials(cancelled))).status, 200);
    assert.equal((await approve(cancelled)).status, 400);
    const expiredRequest = await initiate();
    fixtureDevices.get(expiredRequest.deviceId).expires = new Date(Date.now() - 1);
    assert.equal((await approve(expiredRequest)).status, 400);
    assert.equal((await poll(expiredRequest)).body.status, "expired");
    const read = await grant("read"), act = await grant("act");
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, void 0, read.token)).body.self.godId, host.id);
    for (const [path, body] of [
      [`/player/v1/rooms/${room.id}/commands`, ready()],
      [`/rooms/${room.id}/actions`, { action: "ready", requestId: randomUUID6(), ready: true }],
      ["/rooms", {}],
      ["/activity", {}],
      ["/admin/ai-agents", {}]
    ]) assert.equal((await request(path, body, read.token)).status, 403, path);
    assert.equal((await request("/device/approve", { code: "ignored" }, act.token)).status, 403);
    assert.equal((await request("/device/grants", void 0, act.token)).status, 403);
    const readWs = await connect(read.token), actWs = await connect(act.token), browserWs = await connect(hostToken);
    const sdkCommands = ["ready", "chat", "validate", "summon", "pause", "destroy"].map((type) => ({ version: VERSION3, commandId: randomUUID6(), command: { type } }));
    for (const input of sdkCommands) {
      const receipt = await wsCommand(readWs, input);
      assert.equal(receipt.type, "command.error");
      assert.match(receipt.payload.error, /Read-only/);
    }
    for (const ws of [readWs, actWs]) {
      const receipt = await wsCommand(ws, { protocolVersion: 1, command: "ready.set", requestId: randomUUID6(), payload: { ready: true } });
      assert.equal(receipt.type, "command.error");
      assert.match(receipt.payload.error, /Unsupported protocol/);
    }
    assert.equal(resolveRoom(room.id).members.find((m) => m.id === host.id).ready, false);
    assert.equal((await wsCommand(actWs, ready())).payload.accepted, true);
    assert.equal((await request(`/device/grants/${read.delegateId}/revoke`, {}, peerToken)).status, 404);
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, void 0, read.token)).status, 200);
    const grants = (await request("/device/grants", void 0, hostToken)).body.grants;
    assert.ok(grants.some((g) => g.delegateId === read.delegateId && g.permission === "read"));
    assert.equal((await request("/device/grants", void 0, peerToken)).body.grants.length, 0);
    const reads = fixtureStats.sessionReads;
    for (let i = 0; i < 3; i++) await mutate(room.id, async (draft) => {
      draft.revision++;
    });
    assert.equal(fixtureStats.sessionReads, reads, "private event fanout performs no session SQL lookups");
    await new Promise((resolve) => setTimeout(resolve, 20));
    let afterRevoke = 0;
    readWs.on("message", () => afterRevoke++);
    const closed = once(readWs, "close");
    assert.equal((await request(`/device/grants/${read.delegateId}/revoke`, {}, hostToken)).status, 200);
    assert.equal((await closed)[0], 1008, "passive socket closes immediately on revocation");
    await mutate(room.id, async (draft) => {
      draft.revision++;
    });
    assert.equal(afterRevoke, 0, "no private push after revocation");
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, void 0, read.token)).status, 401);
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, void 0, act.token)).status, 200);
    assert.equal(browserWs.readyState, WebSocket2.OPEN, "unrelated human session survives");
    const actClosed = once(actWs, "close");
    assert.equal((await request("/device/cancel", credentials(act))).status, 200, "cancellation also revokes an already-redeemed session");
    assert.equal((await actClosed)[0], 1008);
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, void 0, act.token)).status, 401);
    const short = await issueSession({ ...host, scope: "player", roomId: room.id, permission: "read", delegateId: randomUUID6() }, 200);
    const shortWs = await connect(short);
    let postExpiry = 0;
    shortWs.on("message", () => {
      if (fixtureSessions.get(hash(short)).expires <= Date.now()) postExpiry++;
    });
    const deadlineClosed = once(shortWs, "close");
    assert.equal((await deadlineClosed)[0], 1008, "passive expiry needs no incoming messages or game event");
    await mutate(room.id, async (draft) => {
      draft.revision++;
    });
    assert.equal(postExpiry, 0);
    assert.equal((await request(`/player/v1/rooms/${room.id}/observation`, void 0, short)).status, 401);
    const selfRevoked = await grant("read");
    const selfWs = await connect(selfRevoked.token), selfClosed = once(selfWs, "close");
    assert.equal((await request("/device/revoke", {}, selfRevoked.token)).status, 200);
    assert.equal((await selfClosed)[0], 1008);
    assert.equal((await request("/device/revoke", {}, hostToken)).status, 403, "bearer revoke cannot revoke browser identity");
    const wrongRoom = new WebSocket2(`${base.replace("http", "ws")}/api/rooms/${other.id}/ws`, { headers: { authorization: `Bearer ${redeemed.body.token}` } });
    wrongRoom.on("error", () => {
    });
    const rejection = new Promise((resolve) => wrongRoom.on("unexpected-response", (_req, res) => {
      res.resume();
      resolve(res.statusCode);
      wrongRoom.terminate();
    }));
    assert.equal(await rejection, 401);
  } finally {
    for (const ws of sockets) ws.terminate();
    await closeSockets();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve()));
  }
});
