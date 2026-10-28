/**
 * Stub API fixtures for the Playwright smoke tests, shaped by lib/api-spec/openapi.yaml and built
 * from the real product libraries (object types, catalog, kid cards, settings presets), so they stay
 * in step with what the server sends without a database or login.
 */
import {
  DEFAULT_SETTINGS, SETTINGS_OPTIONS, SETTINGS_PRESETS, presetSettings, typeDefaults,
} from "../../../lib/game-core/src/index.ts";
import { OBJECT_TYPES, instantiate, instanceInfo, objectType, seededRng, type Instantiation, type TypeArgs } from "../../../lib/game-types/src/index.ts";
import { card, context, familiesFor, publicCatalog } from "../../../lib/game-utilities/src/index.ts";

export const ROOM_ID = "0f6b8c1e-3a4d-4e5f-9a7b-1c2d3e4f5a6b";
export const ROOM_CODE = "K7QX";
export const GAME_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
export const GAME_CODE = "GZ4P";
export const OWNER = { id: "u-ada", name: "Ada Lovelace", isAdmin: false };
const CREATED = Date.UTC(2026, 9, 21, 14, 30);
const NOW = Date.UTC(2026, 9, 28, 12, 0);

const OFFERED: Record<string, TypeArgs[]> = {
  Int: [{ min: -2147483648, max: 2147483647 }, { min: 0, max: 9999 }],
  string: [{ maxLength: 128 }, { maxLength: 16 }],
  Grid: [{ size: 4, symbols: "base10", colours: "rgb" }, { size: 5, symbols: "base10", colours: "rgby" },
    { size: 6, symbols: "base16", colours: "rainbow6" }, { size: 7, symbols: "cards", colours: "rainbow6" }],
};

function isOffered(objectTypeId: string, args: TypeArgs) {
  const key = instantiate(objectTypeId, args).key;
  return (OFFERED[objectTypeId] ?? []).some(a => instantiate(objectTypeId, a).key === key);
}

export function manifest() {
  return {
    protocolVersion: 1, playerProtocol: "code-gods.player.v3", minimumPlayers: 3, defaults: DEFAULT_SETTINGS,
    runtimes: ["python", "typescript"], options: SETTINGS_OPTIONS,
    aiFunding: { provider: "anthropic", model: "claude-sonnet-5-5", billing: "direct", inputUsdPerMillion: 3, outputUsdPerMillion: 15, configured: true, live: true },
    objectTypes: OBJECT_TYPES.map(T => ({
      id: T.id, label: T.label, emoji: T.emoji, kid: T.kid, params: T.params, defaults: T.defaults,
      settingsDefaults: typeDefaults(T.id),
      classes: T.classes.map(c => ({ id: c.id, slot: c.slot, superclasses: c.superclasses, badge: c.badge })),
      offered: (OFFERED[T.id] ?? []).map(args => {
        const inst = T.instantiate(args), info = instanceInfo(inst);
        return { key: inst.key, args: inst.args, label: info.label, badges: info.badges, classes: inst.classes, settingsDefaults: typeDefaults(T.id, inst.args) };
      }),
    })),
    presets: SETTINGS_PRESETS.map(p => {
      const settings = presetSettings(p.id);
      return { id: p.id, label: p.label, kid: p.kid, objectType: p.objectType, typeArgs: p.typeArgs, settings, offered: isOffered(p.objectType, p.typeArgs) };
    }),
  };
}

const GRID_ARGS = { size: 5, symbols: "base10", colours: "rgby" };
export const gridInst: Instantiation = instantiate("Grid", GRID_ARGS);
export const settings = { ...presetSettings("grid-classic"), excludedFamilies: ["seed2_patchwork"] };

export function catalog(inst = gridInst, excluded: readonly string[] = settings.excludedFamilies) {
  return publicCatalog(inst).map(e => ({ ...e, excluded: excluded.includes(e.id) }));
}

const members = [
  { id: OWNER.id, name: OWNER.name, kind: "human", ready: true },
  { id: "u-grace", name: "Grace Hopper", kind: "human", ready: false },
  { id: "ai-1", name: "Sonnet Oracle", kind: "ai", ready: true },
];

export function roomState(active = false) {
  return {
    id: ROOM_ID, shortCode: ROOM_CODE, ownerId: OWNER.id, ownerName: OWNER.name, createdAt: CREATED, revision: 7,
    settings, members, chat: [{ id: "c1", authorId: "u-grace", authorName: "Grace Hopper", kind: "human", text: "Anyone else like green ones?", timestamp: NOW - 60000 }],
    activeGame: active ? { id: GAME_ID, shortCode: GAME_CODE, phase: "running", startedAt: NOW - 120000, roster: members.map(({ id, name, kind }) => ({ id, name, kind })) } : null,
    serverTime: NOW, objectInstance: instanceInfo(gridInst), utilityCatalog: catalog(), aiBudget: 200000, aiUsed: 1200, aiInputTokens: 900, aiOutputTokens: 300,
  };
}

/** Deterministic grids of the room's instantiation. */
export function grids(n: number, inst = gridInst, seed = 7): string[] {
  const T = objectType(inst.objectType), rng = seededRng(seed), codec = T.codec(inst), out = new Set<string>();
  while (out.size < n) out.add(String(codec.encode(T.spawn(inst, rng))));
  return [...out];
}

/** The same grid with two cells changed (for before/after views). */
export function mutate(wire: string): string {
  const rows = wire.split("/").map(r => r.split(","));
  const swap = (r: number, c: number) => { const v = rows[r][c]; rows[r][c] = v[0] === "9" ? `0${v.slice(1)}` : `${Number(v[0]) + 1}${v.slice(1)}`; };
  swap(0, 0); swap(2, 3);
  return rows.map(r => r.join(",")).join("/");
}

const standings = [
  { deityId: OWNER.id, name: OWNER.name, kind: "human", totalPayoff: 412.6, rank: 1 },
  { deityId: "ai-1", name: "Sonnet Oracle", kind: "ai", totalPayoff: 233.1, rank: 2 },
  { deityId: "u-grace", name: "Grace Hopper", kind: "human", totalPayoff: 18.4, rank: 3 },
];

export function gameView() {
  const values = grids(12);
  return {
    id: GAME_ID, shortCode: GAME_CODE, phase: "running", worldSeconds: 84.2, planningEndsAt: NOW - 60000, pauseEndsAt: 0,
    objects: values.map((value, i) => ({ id: `o${i + 1}`, value, version: 1 + (i % 3), salience: Math.round((24 - i * 1.7) * 10) / 10 })),
    leaderboard: standings, agentCount: 9, startedAt: NOW - 120000, endedAt: null, endReason: null, recoveryReason: null,
    settings, roster: members.map(({ id, name, kind }) => ({ id, name, kind })), objectInstance: instanceInfo(gridInst),
    roomId: ROOM_ID, roomShortCode: ROOM_CODE, ownerId: OWNER.id, status: "active", winners: [], chat: roomState().chat,
    roomActiveGame: roomState(true).activeGame, utilityCatalog: catalog(), serverTime: NOW,
  };
}

export function history() {
  return [{
    id: "g-old", shortCode: "B2HD", roomId: ROOM_ID, startedAt: NOW - 86400000, endedAt: NOW - 86000000, endReason: "lifetime",
    settings, roster: members.map(({ id, name, kind }) => ({ id, name, kind })), leaderboard: standings,
    winners: [{ deityId: OWNER.id, name: OWNER.name, kind: "human" }], worldSeconds: 320, objectCount: 40, agentCount: 14, scoring: "information-v1",
  }];
}

export function roomList() {
  return [{ id: ROOM_ID, shortCode: ROOM_CODE, ownerId: OWNER.id, ownerName: OWNER.name, createdAt: CREATED, memberCount: 3, phase: "lobby", activeGameShortCode: null }];
}

/** The owner's private v3 observation of the running game. */
export function observation(revision = 3) {
  const ctx = context(gridInst);
  const reward = familiesFor("Grid", "reward").find(f => f.id === "seed3_green_ones") ?? familiesFor("Grid", "reward")[0];
  const penalty = familiesFor("Grid", "penalty")[0];
  const rng = seededRng(3);
  const dealt = card({ familyId: reward.id, params: reward.sample(rng, ctx), penalty: { familyId: penalty.id, params: penalty.sample(rng, ctx) } }, ctx);
  const values = grids(6, gridInst, 11);
  const bits: [number, number | undefined, number][] = [[7.18, 0.1, 9.4], [12.4, 3.2, 4.1], [0.4, undefined, 6.2], [3.8, 0.3, -2.5], [1.3, undefined, 5], [20.2, 0.2, 14.8]];
  const objects = values.map((value, i) => {
    const [rewardBits, penaltyBits, peerNetBits] = bits[i];
    const netBits = rewardBits - (penaltyBits === undefined ? 0 : penaltyBits - 0.5);
    const peerCare = Math.max(0, peerNetBits);
    return { id: `o${i + 1}`, value, own: { ordinal: Math.round(rewardBits), rewardBits, ...(penaltyBits === undefined ? {} : { penaltyBits }), netBits }, peerNetBits, peerCare, payoff: netBits * peerCare };
  });
  return {
    version: "code-gods.player.v3", roomId: ROOM_ID, revision, gameId: GAME_ID, roomShortCode: ROOM_CODE, gameShortCode: GAME_CODE, seated: true,
    planningEndsAt: NOW - 60000, pauseEndsAt: 0, phase: "running", language: "python",
    instance: instanceInfo(gridInst),
    economy: { energyPerSecond: settings.energyPerSecond, agentEnergyPerSecond: 2, agentBatteryActs: 2, maxAgentsPerGod: 200, penaltyWeight: 1, worldSeconds: 84.2 },
    self: { godId: OWNER.id, label: OWNER.name, isAI: false, energy: 120.5, ready: true, pauseUsed: false,
      utility: { familyId: dealt.familyId, emoji: dealt.emoji, name: dealt.name, theme: dealt.theme, summary: dealt.summary, language: "python", source: dealt.source.python,
        ...(dealt.penalty ? { penalty: { familyId: dealt.penalty.familyId, emoji: dealt.penalty.emoji, name: dealt.penalty.name, summary: dealt.penalty.summary, comparative: dealt.penalty.comparative, source: dealt.penalty.source.python } } : {}) } },
    objects,
    agents: [
      { id: "agent-1", source: "def agent(grid):\n    return [swap(grid.cells[0], grid.cells[1])]\n", language: "python", summonCost: 38, decisionBits: 1.2, expectedActCost: 3.5, breakdown: { decision: 1.2, erasure: 0, motion: 0.3, floor: 2 }, randomized: false, energy: 5.2, eligible: true, acts: 14, spent: 47.3 },
      { id: "agent-2", source: "def agent(grid):\n    return [paint(row(0), \"green\")]\n", language: "python", summonCost: 41, decisionBits: 0, expectedActCost: 9.1, breakdown: { decision: 0, erasure: 6.4, motion: 0.7, floor: 2 }, randomized: false, energy: -4.6, eligible: false, acts: 3, spent: 31.8 },
    ],
    transformations: [
      { id: "t1", agentId: "agent-1", before: values[0], after: mutate(values[0]), calls: [["swap", { a: 0, b: 1 }]], cost: 3.2 },
    ],
    leaderboard: standings.map(s => ({ godId: s.deityId, label: s.name, isAI: s.kind === "ai", totalPayoff: s.totalPayoff })),
    chat: [{ id: "c1", godId: "u-grace", label: "Grace Hopper", isAI: false, text: "Anyone else like green ones?" }],
  };
}

export const validation = { valid: true, cost: 42, decisionBits: 1.2, expectedActCost: 3.5,
  breakdown: { decision: 1.2, erasure: 0, motion: 0.3, floor: 2 }, randomized: false, diagnostics: [] as string[] };
