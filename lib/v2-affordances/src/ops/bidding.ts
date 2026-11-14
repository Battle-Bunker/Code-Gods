/**
 * The bid phase (integration plan §5.9, decision 18): before the deal, each human player bids whole percents 1–100 of
 * handicap on rule families, sealed; the top bid on a family wins it exclusively and its handicap comes off the
 * winner's totals. A bid names a family only. AI seats and practice partners do not bid.
 */
import { z } from "zod/v4";
import { affordance, id, none, obj, ok, requestId } from "../define.ts";
import { IN_GAME, type AffordanceContext, type Availability } from "../types.ts";

const bidOpen = (ctx: AffordanceContext): Availability =>
  ctx.room && !ctx.room.bidOpen ? { ok: false, reason: "There is no bid phase open." } : { ok: true };
const family = z.string().min(1).max(40).describe("A rule family on offer (bid.state lists them).");

export const biddingOps = [
  affordance({
    id: "bid.state", title: "Show the bid phase", group: "play", scope: "room",
    description: "The open bid phase: the families on offer (each with its card and ladder top), the deadline, the caller's own bids and who is done. Other players' bids are sealed.",
    tooltip: "What is on offer and what you have bid.", keywords: ["bids", "auction", "bidding", "handicap"],
    params: none,
    result: z.object({
      deadline: z.number(), pricing: z.enum(["first", "second"]),
      families: z.array(z.object({ family: z.string(), card: z.string(), top: z.number().int() })),
      mine: z.array(z.object({ family: z.string(), percent: z.number().int() })),
      done: z.array(z.object({ memberId: id, name: z.string() })),
    }),
    contexts: ["room"], caller: "seated", effect: "read", confirm: "none", runs: "server", available: bidOpen,
  }),
  affordance({
    id: "bid.place", title: "Bid on a rule family", group: "play", scope: "room",
    description: "Places or changes a sealed bid of 1–100 percent handicap on a family. If it is the top bid the caller is dealt that family and the handicap comes off their final total.",
    tooltip: "Bid handicap to be dealt this family.", keywords: ["bid", "auction", "buy rule", "handicap"],
    params: obj({ family, percent: z.number().int().min(1).max(100), requestId: requestId.optional() }), result: ok,
    contexts: ["room"], caller: "seated", effect: "write", confirm: "inline", runs: "server", available: bidOpen,
  }),
  affordance({
    id: "bid.withdraw", title: "Withdraw a bid", group: "play", scope: "room",
    description: "Withdraws the caller's bid on a family.", tooltip: "Take back a bid.", keywords: ["withdraw", "cancel bid", "unbid"],
    params: obj({ family, requestId: requestId.optional() }), result: ok,
    contexts: ["room"], caller: "seated", effect: "write", confirm: "none", runs: "server", available: bidOpen,
  }),
  affordance({
    id: "bid.done", title: "Finish bidding", group: "play", scope: "room",
    description: "Tells the room the caller has finished bidding. The phase closes and rules are dealt when every human is done or at the deadline.",
    tooltip: "I'm done bidding.", keywords: ["done", "finish bidding", "ready"],
    params: obj({ requestId: requestId.optional() }), result: ok,
    contexts: ["room"], caller: "seated", effect: "write", confirm: "none", runs: "server", available: bidOpen,
  }),
  affordance({
    id: "game.auction", title: "Show the auction's result", group: "play", scope: "game",
    description: "The game's auction as the preset discloses it: who won which family and at what handicap (during the game only what the disclosure setting allows; everything after the end).",
    tooltip: "Who won which rule, and the handicaps.", keywords: ["auction", "winners", "handicaps", "bids"],
    params: none,
    result: z.object({
      disclosure: z.enum(["none", "handicaps", "all"]),
      wins: z.array(z.object({ memberId: id, name: z.string(), family: z.string().nullable(), handicap: z.number().int() })),
      bids: z.array(z.object({ memberId: id, family: z.string(), percent: z.number().int() })).nullable(),
    }),
    contexts: [...IN_GAME, "ended", "replay"], caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
] as const;
