/**
 * An in-memory v2 server: one handler for every server affordance, over a small world held in memory, so every
 * generated surface (assistant, MCP, CLI, palette, buttons) is exercised end to end before the Convex server (W3)
 * exists. It is a stand-in, not a model of the rules: objects are lines y = mx + c with integer m and c, energy and
 * prices are flat, and only the "si" and "gen" representations are answered. W3's `defineOp` handlers replace it.
 * `contextFor` shows how a server derives the caller's context from the room and the game header.
 */
import { AFFORDANCES, isAffordanceId, type AffordanceId, type Via } from "./directory.ts";
import { applyView, EMPTY_VIEW, type ViewState } from "./layout.ts";
import { memoryReceipts, OpFailure, runOp, type OpOutcome, type ServerHandlers } from "./server.ts";
import type { AffordanceContext, Grant } from "./types.ts";

type Phase = "planning" | "live" | "paused" | "ended";
interface FakeMember { memberId: string; userId: string | null; name: string; kind: "human" | "practice" | "ai"; spectator: boolean }
interface FakeAgent { agentId: string; ownerId: string; name: string; language: "python" | "typescript"; share: number; energy: number; acts: number; versions: { language: "python" | "typescript"; source: string }[] }
interface FakeGame {
  gameId: string; roomId: string; phase: Phase; worldSeconds: number; seated: string[];
  rules: Record<string, string>; energy: Record<string, number>; ready: Record<string, boolean>; pauseUsed: Record<string, boolean>;
  objects: Record<string, { m: number; c: number }>; agents: FakeAgent[]; endedAt: number | null;
}
interface FakeRoom {
  roomId: string; code: string; name: string; ownerId: string; preset: string; members: FakeMember[];
  chat: { from: string; text: string; at: number }[]; gameId: string | null; games: string[];
}
export interface FakeState {
  users: Record<string, { name: string; admin?: boolean }>;
  rooms: Record<string, FakeRoom>; games: Record<string, FakeGame>;
  connections: Record<string, { userId: string; client: string; roomId: string | null; grant: Grant }>;
  receipts: Record<string, OpOutcome>;
  /** Each human's view state per room (their `v2Layouts` pane params). */
  views: Record<string, ViewState>;
  next: number; now: number;
}

export const FAKE_PRESET = { id: "lines-beginner", minPlayers: 3, startingEnergy: 100, summonPrice: 10 };
const FAMILIES = ["closeGradient", "nearIntercept", "pegCount", "triangleArea"];

/** Who is calling and what they act in: the env every fake handler gets. */
export interface FakeEnv { state: FakeState; userId: string; roomId: string | null; gameId: string | null; grant?: Grant }

export function emptyState(): FakeState {
  return { users: {}, rooms: {}, games: {}, connections: {}, receipts: {}, views: {}, next: 1, now: 1_800_000_000_000 };
}
const newId = (s: FakeState, prefix: string) => `${prefix}${s.next++}`;

/** The caller's context as a server derives it: never from the client's say-so. */
export function contextFor(s: FakeState, userId: string | null, roomId: string | null, gameId: string | null, opts: { replay?: boolean; grant?: Grant } = {}): AffordanceContext {
  const room = roomId ? s.rooms[roomId] : undefined;
  // The game in view: the one named, else the room's current one (cleared when it ends).
  const game = gameId ? s.games[gameId] : room?.gameId ? s.games[room.gameId] : undefined;
  const signedIn = userId !== null && userId in s.users;
  const member = !!room && room.members.some(m => m.userId === userId);
  const ctx: AffordanceContext = {
    context: !signedIn ? "signedOut" : !room ? "home" : opts.replay ? "replay" : game ? game.phase : "room",
    principal: {
      signedIn, member, owner: !!room && room.ownerId === userId, admin: signedIn && !!s.users[userId!]!.admin,
      seated: !!game && userId !== null && game.seated.includes(userId),
    },
    ...(opts.grant ? { grant: opts.grant } : {}),
  };
  if (room) ctx.room = { players: room.members.filter(m => !m.spectator).length, minPlayers: FAKE_PRESET.minPlayers };
  if (game && userId) ctx.game = {
    phase: game.phase, energy: game.energy[userId], pauseUsed: !!game.pauseUsed[userId],
    agents: game.agents.filter(a => a.ownerId === userId).length,
  };
  return ctx;
}

const roomOf = (e: FakeEnv) => {
  const r = e.roomId ? e.state.rooms[e.roomId] : undefined;
  if (!r) throw new OpFailure("No room in view.");
  return r;
};
const gameOf = (e: FakeEnv) => {
  const id = e.gameId ?? roomOf(e).gameId;
  const g = id ? e.state.games[id] : undefined;
  if (!g) throw new OpFailure("No game in view.");
  return g;
};
const objectOf = (e: FakeEnv, objectId: string) => {
  const o = gameOf(e).objects[objectId];
  if (!o) throw new OpFailure(`No object ${objectId} in this game.`);
  return o;
};
const agentOf = (e: FakeEnv, agentId: string) => {
  const a = gameOf(e).agents.find(x => x.agentId === agentId && x.ownerId === e.userId);
  if (!a) throw new OpFailure("That agent is not yours.");
  return a;
};
const spend = (e: FakeEnv, price: number) => {
  const g = gameOf(e);
  if ((g.energy[e.userId] ?? 0) < price) throw new OpFailure(`That costs ${price} energy; you have ${g.energy[e.userId] ?? 0}.`);
  g.energy[e.userId]! -= price;
};
/** Bits to write an integer: sign, then Elias-gamma of |n| + 1 (a stand-in for v2-core's codes). */
const intBits = (n: number) => 1 + 2 * Math.floor(Math.log2(Math.abs(n) + 1)) + 1;
const page = <T>(rows: T[], args: { cursor?: string | null; limit: number }) => {
  const from = args.cursor ? Number(args.cursor) : 0;
  const next = from + args.limit;
  return { page: rows.slice(from, next), nextCursor: next < rows.length ? String(next) : null };
};
const levelOf = (g: FakeGame, userId: string, o: { m: number; c: number }) => {
  const want = (FAMILIES.indexOf(g.rules[userId] ?? "") + 1) || 1;
  return Math.max(0, 6 - Math.min(6, Math.abs(o.m - want)));
};
const ladder = () => [0, 1, 2, 3, 4, 5, 6].map(level => ({ level, label: `d ≤ ${6 - level}`, rarityBits: level * 1.5 }));
const nameOf = (s: FakeState, userId: string) => s.users[userId]?.name ?? userId;
const ok = { ok: true as const };

type El = { kind: "number"; q: string } | { kind: "symbol"; text: string };
function readRep(o: { m: number; c: number }, rep: string): { elements: Record<string, El>; bits: number } {
  const n = (x: number) => ({ kind: "number" as const, q: String(x) });
  if (rep === "si") return { elements: { m: n(o.m), c: n(o.c), sign: { kind: "symbol" as const, text: o.m > 0 ? "rising" : o.m < 0 ? "falling" : "flat" } }, bits: intBits(o.m) + intBits(o.c) };
  // m x − y + c = 0, with the sign rule a > 0, or a = 0 and b > 0.
  if (rep === "gen") {
    const [a, b, c] = o.m > 0 ? [o.m, -1, o.c] : [-o.m, 1, -o.c];
    return { elements: { a: n(a), b: n(b), c: n(c), sum: n(a + b + c) }, bits: intBits(a) + intBits(b) + intBits(c) };
  }
  throw new OpFailure(`The fake server answers only "si" and "gen", not "${rep}".`);
}

export const FAKE_HANDLERS: ServerHandlers<FakeEnv> = {
  "room.list": (e, a) => page(Object.values(e.state.rooms).filter(r => r.members.some(m => m.userId === e.userId)).reverse()
    .map(r => ({ roomId: r.roomId, code: r.code, name: r.name, phase: r.gameId ? e.state.games[r.gameId]!.phase : "lobby" as const })), a),
  "room.create": (e, a) => {
    const roomId = newId(e.state, "r"), code = `C${roomId.toUpperCase()}X`;
    e.state.rooms[roomId] = {
      roomId, code, name: a.name ?? `${nameOf(e.state, e.userId)}'s room`, ownerId: e.userId, preset: a.preset ?? FAKE_PRESET.id,
      members: [{ memberId: newId(e.state, "m"), userId: e.userId, name: nameOf(e.state, e.userId), kind: "human", spectator: false }],
      chat: [], gameId: null, games: [],
    };
    return { roomId, code };
  },
  "room.join": (e, a) => {
    const r = Object.values(e.state.rooms).find(x => x.code === a.code);
    if (!r) throw new OpFailure(`No room has the code ${a.code}.`);
    if (!r.members.some(m => m.userId === e.userId))
      r.members.push({ memberId: newId(e.state, "m"), userId: e.userId, name: nameOf(e.state, e.userId), kind: "human", spectator: !!r.gameId });
    return { roomId: r.roomId };
  },
  "room.get": e => {
    const r = roomOf(e);
    return {
      roomId: r.roomId, code: r.code, name: r.name, preset: r.preset, phase: r.gameId ? e.state.games[r.gameId]!.phase : "lobby",
      members: r.members.map(m => ({ memberId: m.memberId, name: m.name, kind: m.kind, spectator: m.spectator, owner: m.userId === r.ownerId })),
    };
  },
  "room.history": (e, a) => page(roomOf(e).games.map(id => e.state.games[id]!).filter(g => g.phase === "ended")
    .map(g => ({ gameId: g.gameId, endedAt: g.endedAt!, winner: null })), a),
  "room.leave": e => { const r = roomOf(e); r.members = r.members.filter(m => m.userId !== e.userId); return ok; },
  "room.setSpectator": (e, a) => { roomOf(e).members.find(m => m.userId === e.userId)!.spectator = a.spectator; return ok; },
  "chat.send": (e, a) => { roomOf(e).chat.push({ from: nameOf(e.state, e.userId), text: a.text, at: e.state.now++ }); return ok; },
  "chat.list": (e, a) => page([...roomOf(e).chat].reverse(), a),
  "game.rotation": e => ({ seats: roomOf(e).members.filter(m => !m.spectator).map((m, i) => ({ memberId: m.memberId, name: m.name, family: FAMILIES[i % FAMILIES.length]! })) }),
  "room.settings": (e, a) => { if (a.preset) roomOf(e).preset = a.preset; return ok; },
  "seats.fillPracticePartners": e => {
    const r = roomOf(e);
    let added = 0;
    while (r.members.filter(m => !m.spectator).length < FAKE_PRESET.minPlayers) {
      r.members.push({ memberId: newId(e.state, "m"), userId: null, name: `Practice partner ${++added}`, kind: "practice", spectator: false });
    }
    return { added };
  },
  "seats.addAi": (e, a) => {
    const memberId = newId(e.state, "m");
    roomOf(e).members.push({ memberId, userId: null, name: `AI (${a.template ?? "default"})`, kind: "ai", spectator: false });
    return { memberId };
  },
  "seats.removeAi": (e, a) => {
    const r = roomOf(e), m = r.members.find(x => x.memberId === a.memberId);
    if (!m || m.kind === "human") throw new OpFailure("That seat is not an AI player or practice partner.");
    r.members = r.members.filter(x => x !== m);
    return ok;
  },
  "game.start": e => {
    const r = roomOf(e), gameId = newId(e.state, "g");
    const seated = r.members.filter(m => !m.spectator && m.userId).map(m => m.userId!);
    e.state.games[gameId] = {
      gameId, roomId: r.roomId, phase: "planning", worldSeconds: 0, seated,
      rules: Object.fromEntries(seated.map((u, i) => [u, FAMILIES[i % FAMILIES.length]!])),
      energy: Object.fromEntries(seated.map(u => [u, FAKE_PRESET.startingEnergy])),
      ready: {}, pauseUsed: {}, objects: { o1: { m: 2, c: 3 }, o2: { m: -1, c: 0 }, o3: { m: 0, c: 5 } }, agents: [], endedAt: null,
    };
    r.gameId = gameId; r.games.push(gameId);
    return { gameId };
  },
  "game.startWorldNow": e => { gameOf(e).phase = "live"; return ok; },
  "game.resume": e => { gameOf(e).phase = "live"; return ok; },
  "game.end": e => {
    const g = gameOf(e);
    g.phase = "ended"; g.endedAt = e.state.now++;
    e.state.rooms[g.roomId]!.gameId = null;
    return ok;
  },
  "game.get": e => {
    const g = gameOf(e), seat = g.seated.includes(e.userId);
    return {
      gameId: g.gameId, phase: g.phase, worldSeconds: g.worldSeconds, endsAt: null, preset: roomOf(e).preset, variant: "line-z",
      roster: g.seated.map(u => ({ memberId: u, name: nameOf(e.state, u) })),
      me: seat ? { energy: g.energy[e.userId]!, power: 1, ready: !!g.ready[e.userId], pauseUsed: !!g.pauseUsed[e.userId] } : null,
    };
  },
  "game.standings": e => {
    const g = gameOf(e);
    const pts = g.seated.map(u => ({ memberId: u, name: nameOf(e.state, u), points: Object.values(g.objects).reduce((t, o) => t + levelOf(g, u, o), 0) }));
    return { rows: pts.sort((a, b) => b.points - a.points).map((p, i) => ({ ...p, rank: i + 1 })) };
  },
  "game.ready": (e, a) => {
    const g = gameOf(e);
    g.ready[e.userId] = a.ready;
    if (g.seated.every(u => g.ready[u])) g.phase = "live";
    return ok;
  },
  "game.pause": e => { const g = gameOf(e); g.pauseUsed[e.userId] = true; g.phase = "paused"; return ok; },
  "rule.explain": e => {
    const family = gameOf(e).rules[e.userId]!;
    return { family, params: {}, card: `Your rule, ${family}, wants the gradient close to its target.`, depends: ["si"], ladder: ladder() };
  },
  "rule.ladder": () => ({ rungs: ladder() }),
  "rule.rarity": (_e, a) => ({ level: a.level, rarityBits: a.level * 1.5 }),
  "objects.list": (e, a) => {
    const g = gameOf(e);
    const rows = Object.entries(g.objects).map(([objectId, o]) => ({ objectId, level: levelOf(g, e.userId, o), points: levelOf(g, e.userId, o) }));
    const key = a.sort;
    if (key !== "recent") rows.sort((x, y) => y[key] - x[key]);
    return page(rows, a);
  },
  "object.read": (e, a) => ({ rep: a.rep, site: a.site ?? 0, ...readRep(objectOf(e, a.objectId), a.rep) }),
  "object.element": (e, a) => {
    const { elements } = readRep(objectOf(e, a.objectId), a.rep);
    const value = elements[a.name];
    if (!value) throw new OpFailure(`${a.rep} has no element ${a.name} in the fake server.`);
    return { ref: `${a.rep}.${a.name}`, value, bits: value.kind === "number" ? intBits(Number(value.q)) : 1 };
  },
  "rep.mutators": (_e, a) => ({
    mutators: a.rep === "si"
      ? [{ id: "si.shift", reps: ["si", "cart", "table"], args: [{ name: "k", code: "nonzero" }], baseBits: 3.17, effect: "c += k" },
        { id: "si.tilt", reps: ["si", "mach"], args: [{ name: "k", code: "nonzero" }], baseBits: 3.17, effect: "m += k" }]
      : [],
  }),
  "object.quote": (e, a) => {
    const o = { ...objectOf(e, a.objectId) };
    const bits: number[] = [];
    for (const c of a.calls) {
      const k = Number(c.args.k);
      if (!Number.isInteger(k) || k === 0 || (c.mutator !== "si.shift" && c.mutator !== "si.tilt"))
        return { valid: false, reason: `The fake server prices only si.shift and si.tilt with a nonzero integer k.`, bits, total: 0, charge: 0, after: null };
      if (c.mutator === "si.shift") o.c += k; else o.m += k;
      bits.push(3.17 + intBits(k));
    }
    const total = bits.reduce((s, b) => s + b, 0), g = gameOf(e), level = levelOf(g, e.userId, o);
    return { valid: true, bits, total, charge: total + 0.05 * total * total, after: { score: [String(-Math.abs(6 - level))], level, top: 6, terms: [] } };
  },
  "object.score": (e, a) => {
    const g = gameOf(e), level = levelOf(g, e.userId, objectOf(e, a.objectId));
    return { score: [String(level - 6)], level, top: 6, terms: [], rarityBits: level * 1.5, points: level };
  },
  "moves.list": (_e, a) => page([], a),
  "pitch.draft": (e, a) => ({ draft: `Proposal to ${a.to?.length ? a.to.join(", ") : "everyone"}: let's protect lines whose gradient suits ${gameOf(e).rules[e.userId]}.${a.aim ? ` ${a.aim}` : ""}` }),
  "agents.list": e => ({ agents: gameOf(e).agents.filter(a => a.ownerId === e.userId).map(a => ({ agentId: a.agentId, name: a.name, language: a.language, share: a.share, energy: a.energy, acts: a.acts, version: a.versions.length - 1 })) }),
  "agent.programs": (e, a) => ({ versions: agentOf(e, a.agentId).versions.map((v, version) => ({ version, ...v, acts: 0 })).reverse() }),
  "agent.check": (_e, a) => {
    const defined = a.language === "python" ? /def\s+agent\s*\(/.test(a.source) : /function\s+agent\s*\(/.test(a.source);
    return defined
      ? { verdict: "works", summary: "Ran on 3 sample objects.", price: FAKE_PRESET.summonPrice, sample: [] }
      : { verdict: "rejected", summary: "The program defines no agent function.", price: FAKE_PRESET.summonPrice, sample: [] };
  },
  "agent.summon": (e, a) => {
    spend(e, FAKE_PRESET.summonPrice);
    const g = gameOf(e), agentId = newId(e.state, "a");
    g.agents.push({ agentId, ownerId: e.userId, name: a.name ?? `Agent ${agentId}`, language: a.language, share: a.share ?? 1, energy: 0, acts: 0, versions: [{ language: a.language, source: a.source }] });
    return { agentId, price: FAKE_PRESET.summonPrice };
  },
  "agent.replace": (e, a) => {
    const agent = agentOf(e, a.agentId);
    spend(e, FAKE_PRESET.summonPrice);
    agent.versions.push({ language: a.language, source: a.source });
    return { version: agent.versions.length - 1, price: FAKE_PRESET.summonPrice };
  },
  "agent.putBack": (e, a) => {
    const agent = agentOf(e, a.agentId), v = agent.versions[a.version];
    if (!v) throw new OpFailure(`That agent has no version ${a.version}.`);
    spend(e, FAKE_PRESET.summonPrice);
    agent.versions.push(v);
    return { version: agent.versions.length - 1, price: FAKE_PRESET.summonPrice };
  },
  "agent.destroy": (e, a) => { const g = gameOf(e), agent = agentOf(e, a.agentId); g.agents = g.agents.filter(x => x !== agent); return ok; },
  "power.allocate": (e, a) => {
    const total = Object.values(a.shares).reduce((s, x) => s + x, 0);
    if (total <= 0) throw new OpFailure("Give at least one agent a share.");
    for (const [agentId, share] of Object.entries(a.shares)) agentOf(e, agentId).share = share / total;
    return ok;
  },
  "account.whoami": e => ({ userId: e.userId, name: nameOf(e.state, e.userId), roomId: e.roomId, grant: e.grant ?? null }),
  "account.connections": e => ({ connections: Object.entries(e.state.connections).filter(([, c]) => c.userId === e.userId).map(([connectionId, c]) => ({ connectionId, client: c.client, roomId: c.roomId, grant: c.grant, lastUsedAt: null })) }),
  "account.revokeConnection": (e, a) => {
    if (e.state.connections[a.connectionId]?.userId !== e.userId) throw new OpFailure("No such connection.");
    delete e.state.connections[a.connectionId];
    return ok;
  },
  "account.approveConnection": (e, a) => { e.state.connections[a.request] = { userId: e.userId, client: "remote assistant", roomId: e.roomId, grant: a.grant }; return ok; },
};

/** A fake deployment: perform any server affordance as a user, through the same `runOp` path `defineOp` uses. */
export function createFake(state: FakeState = emptyState()) {
  state.receipts ??= {};
  state.views ??= {};
  const receipts = memoryReceipts(state.receipts);
  return {
    state, receipts,
    addUser(userId: string, name: string, admin = false) { state.users[userId] = { name, ...(admin ? { admin } : {}) }; },
    contextFor: (userId: string | null, roomId: string | null = null, gameId: string | null = null, grant?: Grant) => contextFor(state, userId, roomId, gameId, { grant }),
    async perform(who: { userId: string; roomId?: string | null; gameId?: string | null; grant?: Grant; via?: Via }, id: string, args: unknown): Promise<OpOutcome> {
      if (!isAffordanceId(id)) return { ok: false, error: { code: "unknown", message: `Unknown affordance: ${id}` } };
      const a = AFFORDANCES[id];
      const roomId = who.roomId ?? null, gameId = who.gameId ?? null;
      if (a.runs === "client") {
        // A view operation changes the human's stored view, as `defineViewOps` does on the server.
        const key = `${who.userId}|${roomId ?? ""}`;
        const { outcome, view } = applyView(state.views[key] ?? EMPTY_VIEW, id, args, contextFor(state, who.userId, roomId, gameId, { grant: who.grant }), who.via ?? "app");
        if (outcome.ok) state.views[key] = view;
        return outcome;
      }
      const handler = FAKE_HANDLERS[id as Extract<AffordanceId, keyof typeof FAKE_HANDLERS>];
      // A transaction, as a Convex mutation is: a failure leaves the world as it was.
      const before = structuredClone(state);
      const out = await runOp(a, handler as never, args, {
        ctx: contextFor(state, who.userId, roomId, gameId, { grant: who.grant }), via: who.via ?? "app",
        callerKey: who.userId, receipts, env: { state, userId: who.userId, roomId, gameId, grant: who.grant },
      });
      if (!out.ok) Object.assign(state, before);
      return out;
    },
  };
}
export type Fake = ReturnType<typeof createFake>;
