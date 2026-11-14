/**
 * Playing a game: the game header and standings, the viewer's rule, objects and their priced representation queries,
 * quotes of per-representation mutations, the move log, and the negotiation aid (spec §6, integration plan §2.5).
 * A human's reads are free; each answer carries `bits`, what an agent would pay for the same read.
 */
import { z } from "zod/v4";
import { affordance, call, elementValue, id, none, obj, ok, page, paging, q, rep, requestId, rung, score, site } from "../define.ts";
import { IN_GAME, type AffordanceContext, type Availability } from "../types.ts";

/** Contexts with a game in view whose objects can be read. */
const GAME = [...IN_GAME, "ended", "replay"] as const;

const pauseCheck = (ctx: AffordanceContext): Availability =>
  ctx.game?.pauseUsed ? { ok: false, reason: "You have used your one pause." } : { ok: true };

export const playOps = [
  affordance({
    id: "game.get", title: "Show the game", group: "play", scope: "game",
    description: "The game in view: phase, world time and deadlines, preset and variant, roster, and the viewer's energy and power. Start here.",
    tooltip: "Phase, time left and the roster.", keywords: ["game", "status", "time left", "phase"],
    params: none,
    result: z.object({
      gameId: id, phase: z.enum(["planning", "live", "paused", "ended"]), worldSeconds: z.number(), endsAt: z.number().nullable(),
      preset: z.string(), variant: z.string(), roster: z.array(z.object({ memberId: id, name: z.string() })),
      me: z.object({ energy: z.number(), power: z.number(), ready: z.boolean(), pauseUsed: z.boolean() }).nullable(),
    }),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "game.standings", title: "Show the standings", group: "play", scope: "game",
    description: "Every player's points and rank as of the last scoreboard (at most 10 s old).",
    tooltip: "Who is ahead.", keywords: ["leaderboard", "scores", "ranking", "points"],
    params: none, result: z.object({ rows: z.array(z.object({ memberId: id, name: z.string(), points: z.number(), rank: z.number().int() })) }),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "game.ready", title: "Mark me ready", group: "play", scope: "game",
    description: "Tells the room the caller is ready to leave planning. When every player is ready the world starts early.",
    tooltip: "Ready to start.", keywords: ["ready", "done planning"],
    params: obj({ ready: z.boolean().default(true), requestId: requestId.optional() }), result: ok,
    contexts: ["planning"], caller: "seated", effect: "write", confirm: "none", runs: "server",
  }),
  affordance({
    id: "game.pause", title: "Pause the game", group: "play", scope: "game",
    description: "Pauses the world for everyone. Each player may pause once per game; the owner resumes.",
    tooltip: "Use your one pause.", keywords: ["pause", "stop time", "hold on"],
    params: obj({ requestId: requestId.optional() }), result: ok,
    contexts: ["live"], caller: "seated", effect: "write", confirm: "inline", runs: "server", available: pauseCheck,
  }),

  affordance({
    id: "rule.explain", title: "Explain my rule", group: "play", scope: "game",
    description: "The caller's private rule: family, parameters, the card sentence, which representations it reads, and its ladder. Never reveals other players' rules.",
    tooltip: "What your rule wants.", keywords: ["my rule", "goal", "card", "what do I want"],
    params: none,
    result: z.object({ family: z.string(), params: z.record(z.string(), z.unknown()), card: z.string(), depends: z.array(z.string()), ladder: z.array(rung) }),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "rule.ladder", title: "Show my rule's ladder", group: "play", scope: "game",
    description: "The rungs of the caller's rule score, worst to best, each with its ✨ rarity: how many bits an object on that rung is worth.",
    tooltip: "The levels your rule scores and how rare each is.", keywords: ["ladder", "levels", "rungs", "rarity"],
    params: none, result: z.object({ rungs: z.array(rung) }),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "rule.rarity", title: "Look up a level's rarity", group: "play", scope: "game",
    description: "The calibrated ✨ rarity of one level of the caller's rule: minus log2 of the stationary mass of states at least that good.",
    tooltip: "How rare a level is.", keywords: ["rarity", "bits", "how rare", "value"],
    params: obj({ level: z.number().int().min(0).max(64) }), result: z.object({ level: z.number().int(), rarityBits: z.number() }),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),

  affordance({
    id: "objects.list", title: "List objects", group: "objects", scope: "game",
    description: "Pages through the game's objects for the viewer, sorted by the viewer's points, level or most recent change, with each object's level and points.",
    tooltip: "Objects in this game.", keywords: ["objects", "lines", "list", "browse"],
    params: obj({ sort: z.enum(["points", "level", "recent"]).default("points"), ...paging }),
    result: page(z.object({ objectId: id, level: z.number().int(), points: z.number() })),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "object.read", title: "Read an object in one representation", group: "objects", scope: "game",
    description: "One object's state shown in one representation: its static elements (coordinates and derived). Free for a human; `bits` is what an agent pays for the same read (the coordinates' code lengths).",
    tooltip: "See an object as an equation, a graph, a table…", keywords: ["read", "view", "representation", "equation", "graph"],
    params: obj({ objectId: id, rep, site }),
    result: z.object({ rep: z.string(), site: z.number().int(), elements: z.record(z.string(), elementValue), bits: z.number() }),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "object.element", title: "Read one element of an object", group: "objects", scope: "game",
    description: 'One element of one representation, dynamic ones with their arguments (e.g. rep "mach", name "out", args {q: "3"}). `bits` is the value\'s code length.',
    tooltip: "One value: the y-intercept, the output at 3…", keywords: ["element", "value at", "intercept", "output"],
    params: obj({ objectId: id, rep, name: z.string().min(1).max(32), args: z.record(z.string(), q).optional(), site }),
    result: z.object({ ref: z.string(), value: elementValue, bits: z.number() }),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "rep.mutators", title: "List a representation's mutators", group: "objects", scope: "game",
    description: "The mutators that belong to a representation (e.g. si: si.shift, si.tilt), each with its arguments, their codes and its base price in bits.",
    tooltip: "The moves you can make through this view.", keywords: ["mutators", "moves", "changes", "price list"],
    params: obj({ rep }),
    result: z.object({ mutators: z.array(z.object({ id: z.string(), reps: z.array(z.string()), args: z.array(z.object({ name: z.string(), code: z.string() })), baseBits: z.number(), effect: z.string() })) }),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "object.quote", title: "Price a change to an object", group: "objects", scope: "game",
    description: "What a list of mutator calls would cost on an object, call by call, the act charge, and the caller's rule score after them. Changes nothing: agents make the changes.",
    tooltip: "What would this change cost and score?", keywords: ["quote", "price", "what if", "cost"],
    params: obj({ objectId: id, calls: z.array(call).min(1).max(8) }),
    result: z.object({ valid: z.boolean(), reason: z.string().optional(), bits: z.array(z.number()), total: z.number(), charge: z.number(), after: score.nullable() }),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "object.score", title: "Score an object under my rule", group: "objects", scope: "game",
    description: "The caller's rule evaluated on one object: score tuple, level, the recorded terms, its ✨ rarity and the caller's points from it.",
    tooltip: "How your rule rates this object.", keywords: ["score", "my points", "level", "evaluate"],
    params: obj({ objectId: id }), result: score.extend({ rarityBits: z.number(), points: z.number() }),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "moves.list", title: "List moves that concern me", group: "objects", scope: "game",
    description: "Pages through the moves that changed the caller's points or were made by the caller's agents: calls, states before and after, level and points before and after, charge.",
    tooltip: "What happened to your objects.", keywords: ["log", "moves", "history", "what happened"],
    params: obj({ ...paging }),
    result: page(z.object({ seq: z.number().int(), objectId: id, agentId: id.nullable(), mine: z.boolean(), calls: z.array(call), pointsBefore: z.number(), pointsAfter: z.number(), charge: z.number().nullable() })),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "pitch.draft", title: "Draft a cooperation pitch", group: "play", scope: "game",
    description: "Drafts a chat message proposing cooperation to other players: which states serve both rules and which objects to defend together. Returns the draft only; send it with chat.send.",
    tooltip: "Help me pitch a deal to other players.", keywords: ["negotiate", "pitch", "deal", "cooperate"],
    params: obj({ to: z.array(id).max(15).optional().describe("Member ids to address; omit for everyone."), aim: z.string().max(300).optional(), requestId: requestId.optional() }),
    result: z.object({ draft: z.string() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "aiBudget", confirm: "summary", runs: "server",
  }),
] as const;
