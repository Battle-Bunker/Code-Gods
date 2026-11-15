/**
 * Playing a game: the game header and standings, the viewer's rule, objects and their priced representation queries,
 * quotes of per-representation mutations, the move log, and the negotiation aid (spec §6, integration plan §2.5).
 * A human's reads are free; each answer carries `bits`, what an agent would pay for the same read.
 */
import { z } from "zod/v4";
import { affordance, call, elementValue, id, knot, none, obj, ok, page, paging, q, rep, requestId, score, scoreWire, site } from "../define.ts";
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
    description: "Every player's points, bid handicap and net total (total less the handicap's share), ranked by net total, as of the last scoreboard (at most 10 s old).",
    tooltip: "Who is ahead.", keywords: ["leaderboard", "scores", "ranking", "points"],
    params: none, result: z.object({ rows: z.array(z.object({ memberId: id, name: z.string(), points: z.number(), handicap: z.number().int(), net: z.number(), rank: z.number().int() })) }),
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
    description: "Pauses the world for everyone. Each player may pause once per game; the pause ends by itself after the room's pause length (3 minutes unless the owner set another), or earlier when the owner resumes.",
    tooltip: "Use your one pause.", keywords: ["pause", "stop time", "hold on"],
    params: obj({ requestId: requestId.optional() }), result: ok,
    contexts: ["live"], caller: "seated", effect: "write", confirm: "inline", runs: "server", available: pauseCheck,
  }),

  affordance({
    id: "rule.explain", title: "Explain my rule", group: "play", scope: "game",
    description: "The caller's private rule: family, parameters, its layers (main part, tie-breakers), the card sentence, which representations it reads, and the handicap if it was won by bid. Its value curve is rule.values. Never reveals other players' rules.",
    tooltip: "What your rule wants.", keywords: ["my rule", "goal", "card", "what do I want"],
    params: none,
    result: z.object({
      family: z.string(), params: z.record(z.string(), z.unknown()), layers: z.array(z.string()), card: z.string(), depends: z.array(z.string()),
      wonByBid: z.object({ handicap: z.number().int() }).nullable(),
    }),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "rule.values", title: "Show my rule's value curve", group: "play", scope: "game",
    description: "How many bits the caller's rule pays at each score, worst to best: the knots of its value function (bits = minus log2 of the share of all states scoring at least that well; each bit is twice as rare). Values between knots follow the curve; rule.worth looks one score up.",
    tooltip: "How much each score is worth to you.", keywords: ["values", "curve", "rarity", "bits", "worth"],
    params: none, result: z.object({ points: z.array(knot) }),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "rule.worth", title: "Look up what a score is worth", group: "play", scope: "game",
    description: "The value in bits of one score of the caller's rule (a score tuple as object.score returns it), with the calibration's lower and upper bounds.",
    tooltip: "How rare a score is.", keywords: ["worth", "rarity", "bits", "how rare", "value"],
    params: obj({ score: scoreWire }), result: z.object({ bits: z.number(), lo: z.number(), hi: z.number().nullable().describe("null past the rule's last measured score: at least lo.") }),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "objects.list", title: "List objects", group: "objects", scope: "game",
    description: "Pages through the game's objects for the viewer, sorted by the viewer's points, rarity (bits) or most recent change, with each object's bits and points.",
    tooltip: "Objects in this game.", keywords: ["objects", "lines", "list", "browse"],
    params: obj({ sort: z.enum(["points", "rarity", "recent"]).default("points"), ...paging }),
    result: page(z.object({ objectId: id, number: z.number().int().describe("The line's number: what the app shows and an agent's offer.object."), bits: z.number().describe("Its value under the caller's rule."), points: z.number() })),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "object.read", title: "Read an object in one representation", group: "objects", scope: "game",
    description: "One object's state shown in one representation: its static elements (coordinates and derived), and for an equation the line as a person writes it (`text`, e.g. \"y = −x + 12\", \"x = 3\"): quote it as written. Free for a human; `bits` is what an agent pays for the same read (the coordinates' code lengths).",
    tooltip: "See an object as an equation, a graph, a table…", keywords: ["read", "view", "representation", "equation", "graph"],
    params: obj({ objectId: id, rep, site }),
    result: z.object({ rep: z.string(), site: z.number().int(), elements: z.record(z.string(), elementValue), bits: z.number(),
      text: z.string().nullable().optional().describe("For an equation, the object written as a person writes it; null for a picture.") }),
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
    description: "The mutators that belong to a representation (e.g. si: si.shift, si.tilt), each with its arguments (their codes, and in plain words what each is, what may be typed, an example and the words a choice takes) and its base price in bits.",
    tooltip: "The moves you can make through this view.", keywords: ["mutators", "moves", "changes", "price list"],
    params: obj({ rep }),
    result: z.object({ mutators: z.array(z.object({ id: z.string(), reps: z.array(z.string()), args: z.array(z.object({ name: z.string(), code: z.string(), label: z.string().optional(), hint: z.string().optional(), example: z.string().optional(), choices: z.record(z.string(), z.string()).optional() })), baseBits: z.number(), effect: z.string() })) }),
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
    description: "The caller's rule evaluated on one object: score tuple, the recorded terms, its value in bits and the caller's points from it (the caller's bits × the other players' bits on it added together).",
    tooltip: "How your rule rates this object.", keywords: ["score", "my points", "rarity", "evaluate"],
    params: obj({ objectId: id }), result: score.extend({ number: z.number().int(), bits: z.number(), points: z.number() }),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "object.look", title: "Look at objects", group: "objects", scope: "game",
    description: "See one object as it is now, or every object when no objectId is given, paying each one's full read at the read price times the game's weight (readPriceWeight; a game at 0 reads free and has nothing to look at) from the caller's own store; each look is a fresh measurement of the others' bits. Until a look, an object shows as the caller was last told it: at its birth, by their own agents' changes and complete reads, or by an earlier look. Refused, with the price and the store, when the store cannot pay; keep some power for yourself to look.",
    tooltip: "Pay to see objects as they are now.", keywords: ["look", "refresh", "see", "observe", "update view"],
    params: obj({ objectId: id.optional(), requestId: requestId.optional() }), result: z.object({ looked: z.number().int(), price: z.number() }),
    contexts: ["live", "paused"], caller: "seated", effect: "write", confirm: "inline", runs: "server",
  }),
  affordance({
    id: "object.whatIf", title: "What if, for the others", group: "objects", scope: "game",
    description: "What the others' sum on one object would read after each of up to 4 candidate moves from the state the caller knows: one look's price per candidate, paid from the caller's own store (free where the game reads free). Each quote is a fresh blurred reading, never exact while the game runs. A candidate onto a state another object holds says which object holds it.",
    tooltip: "Price what a move would do for the others.", keywords: ["what if", "quote", "preview", "others"],
    params: obj({ objectId: id, calls: z.array(call).min(1).max(4), requestId: requestId.optional() }),
    result: z.object({ state: z.string(), price: z.number(), after: z.array(z.object({ state: z.string(), want: z.number(), taken: z.number().int().nullable() }).nullable()) }),
    contexts: ["live", "paused"], caller: "seated", effect: "write", confirm: "inline", runs: "server",
  }),
  affordance({
    id: "moves.list", title: "List moves that concern me", group: "objects", scope: "game",
    description: "Pages through the moves that changed the caller's points or were made by the caller's agents: calls, states before and after, points before and after, charge.",
    tooltip: "What happened to your objects.", keywords: ["log", "moves", "history", "what happened"],
    params: obj({ ...paging }),
    result: page(z.object({ seq: z.number().int(), objectId: id, number: z.number().int(), agentId: id.nullable(), mine: z.boolean(), calls: z.array(call), pointsBefore: z.number(), pointsAfter: z.number(), charge: z.number().nullable() })),
    contexts: GAME, caller: "seated", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "log.list", title: "Read the public log", group: "objects", scope: "game",
    description: "Pages through every move in the game, newest first (the public log): each object's state before and after, the caller's own bits, the others' bits added together and the caller's points before and after. While the game runs the log is unattributed (no mover, agent, calls or cost on other players' moves) and the others' bits are deliberately blurred; after the end every move is attributed and exact. Read it to work out what the other players want.",
    tooltip: "Every move in the game.", keywords: ["public log", "all moves", "everything", "history", "what others want"],
    params: obj({ ...paging }),
    result: page(z.object({
      seq: z.number().int(), worldSeconds: z.number(), kind: z.enum(["born", "move"]), objectId: id, number: z.number().int(), version: z.number().int(),
      stateBefore: z.string().nullable(), state: z.string().nullable().describe("null: another player's move in a paid game while it runs"), mine: z.boolean(),
      own: z.number().nullable(), others: z.number().nullable(), points: z.number().nullable(),
      ownBefore: z.number().nullable(), othersBefore: z.number().nullable(), pointsBefore: z.number().nullable(),
      by: z.object({ memberId: id, name: z.string() }).nullable(), agentId: id.nullable(), calls: z.array(call).nullable(), charge: z.number().nullable(),
    })),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
  affordance({
    id: "game.boardAt", title: "Show the board at a moment", group: "objects", scope: "game",
    description: "Every object as it was at a world time (v1's get_board_at), as the caller saw it then: its state, the caller's own bits, the others' bits added together and the caller's points. While the game runs the others' bits are blurred as everywhere else and nothing is attributed. Up to 100 objects by number a call; pass nextAfter as after for the rest.",
    tooltip: "The board as it was at a moment.", keywords: ["board at", "history", "snapshot", "back then", "rewind"],
    params: obj({ world: z.number().min(0).describe("World seconds since the start."), after: z.number().int().optional().describe("Only objects numbered above this (from nextAfter)."), limit: z.number().int().min(1).max(100).default(100) }),
    result: z.object({
      world: z.number(),
      objects: z.array(z.object({ objectId: id, number: z.number().int(), state: z.string().nullable().describe("null: hidden from you (a paid game)"), own: z.number().nullable(), others: z.number().nullable(), points: z.number().nullable() })),
      nextAfter: z.number().int().nullable(),
    }),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server", action: true,
  }),
  affordance({
    id: "pitch.draft", title: "Draft a cooperation pitch", group: "play", scope: "game",
    description: "Drafts a chat message proposing cooperation to other players: which states serve both rules and which objects to defend together. Returns the draft only; send it with chat.send.",
    tooltip: "Help me pitch a deal to other players.", keywords: ["negotiate", "pitch", "deal", "cooperate"],
    params: obj({ to: z.array(id).max(15).optional().describe("Member ids to address; omit for everyone."), aim: z.string().max(300).optional(), requestId: requestId.optional() }),
    result: z.object({ draft: z.string() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "aiBudget", confirm: "summary", runs: "server", action: true,
  }),
] as const;
