/**
 * The bid phase (owner decision 18, integration plan §5.9): a room-level step of the start, before the game exists.
 * Each human player bids whole percents 1–100 of handicap on rule families, sealed; the top bid on a family wins it
 * exclusively, and the winner's totals (never per-object points) are reduced by the handicap. A bid names a family only.
 */
import { z } from "zod/v4";
import { affordance, id, none, obj, ok, requestId } from "../define.ts";
import type { AffordanceContext, Availability } from "../types.ts";

const open = (ctx: AffordanceContext): Availability =>
  ctx.room?.bidding ? { ok: true } : { ok: false, reason: "No bid phase is open in this room." };

const family = z.string().min(1).max(64).describe('A rule family id on offer, e.g. "prime-gradient".');
const bid = z.object({ family: z.string(), percent: z.number().int().min(1).max(100) });

export const bidOps = [
  affordance({
    id: "bid.state", title: "Show the bid phase", group: "room", scope: "room",
    description: "The open bid phase: the rule families on offer (card sentence and ladder top in ✨ rarity), its deadline, the caller's own sealed bids, and which players are done. Other players' bids are never shown.",
    tooltip: "The families on offer and your bids.", keywords: ["bids", "auction", "bid phase", "families"],
    params: none,
    result: z.object({
      open: z.boolean(), deadline: z.number().nullable(),
      families: z.array(z.object({ family: z.string(), title: z.string(), card: z.string(), topRarityBits: z.number() })),
      mine: z.array(bid), done: z.boolean(),
      players: z.array(z.object({ memberId: id, name: z.string(), done: z.boolean() })),
    }),
    contexts: ["room"], caller: "member", effect: "read", confirm: "none", runs: "server", available: open,
  }),
  affordance({
    id: "bid.place", title: "Bid on a rule family", group: "room", scope: "room",
    description: "Places or changes the caller's sealed bid on one family: a whole percent 1–100 of handicap taken off the caller's totals if the bid wins that family. The highest bid wins it exclusively; ties are drawn at random.",
    tooltip: "Bid handicap percent for a family you want.", keywords: ["bid", "auction", "want this rule", "handicap"],
    params: obj({ family, percent: z.number().int().min(1).max(100), requestId: requestId.optional() }), result: ok,
    contexts: ["room"], caller: "member", effect: "write", confirm: "none", runs: "server", available: open,
  }),
  affordance({
    id: "bid.withdraw", title: "Withdraw a bid", group: "room", scope: "room",
    description: "Removes the caller's bid on one family.", tooltip: "Take back a bid.", keywords: ["withdraw bid", "cancel bid", "unbid"],
    params: obj({ family, requestId: requestId.optional() }), result: ok,
    contexts: ["room"], caller: "member", effect: "write", confirm: "none", runs: "server", available: open,
  }),
  affordance({
    id: "bid.done", title: "Finish bidding", group: "room", scope: "room",
    description: "Says the caller has finished bidding (or passes, with no bids). The phase ends when every human player is done or at its deadline.",
    tooltip: "I'm done bidding.", keywords: ["done bidding", "pass", "finish auction"],
    params: obj({ done: z.boolean().default(true), requestId: requestId.optional() }), result: ok,
    contexts: ["room"], caller: "member", effect: "write", confirm: "none", runs: "server", available: open,
  }),
  affordance({
    id: "game.auction", title: "Show the auction's results", group: "play", scope: "game",
    description: "Who won which rule family and at what handicap, as the preset discloses it during the game (nothing, handicaps only, or every bid); everything after the end.",
    tooltip: "Who won which family, and the handicaps.", keywords: ["auction", "handicaps", "who won", "bids"],
    params: none,
    result: z.object({
      disclosure: z.enum(["none", "handicaps", "all"]),
      wins: z.array(z.object({ memberId: id, family: z.string().nullable(), handicapPercent: z.number() })),
      bids: z.array(z.object({ memberId: id, family: z.string(), percent: z.number().int() })).nullable(),
    }),
    contexts: ["planning", "live", "paused", "ended", "replay"], caller: "member", effect: "read", confirm: "none", runs: "server",
  }),
] as const;
