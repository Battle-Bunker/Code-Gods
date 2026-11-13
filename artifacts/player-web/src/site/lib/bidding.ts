/**
 * The bid phase of a game start, as the app shows it (engine convex/bidding.ts; docs/bid-phase.md): the room's start
 * state with bidding in it, the bidding screen's small rules (what a typed percentage means, what the one button says,
 * what a change does to the player's bids before the server answers) and, in the game, what a handicap did to a score.
 * Pure: no React, no Convex.
 */
import { startView, type StartRequest, type StartView } from "@workspace/player-client/start";

export type Bid = { familyId: string; percent: number };
export type BidFamily = { id: string; name: string; emoji: string; theme: string };
export type BidPricing = "first" | "second";
/** The room's bid phase as everyone sees it (rooms.get `bidding`): its clock and how many play, never a bid. */
export type RoomBidding = { startedAt: number; endsAt: number; seconds: number; pricing: BidPricing; players: number; error?: string };
/** A player's own outcome of a bid phase somebody won, on their goal card (`self.utility.bid`). */
export type CardBid = { won: boolean; familyId?: string; percent?: number; handicap: number; pricing: BidPricing; bids: Bid[] };

/** The room's bid phase while it is open (a failed one is shown as a failed start). */
export const openBidding = <B extends { error?: string }>(room: { bidding?: B | null } | null | undefined): B | null =>
  (room?.bidding && !room.bidding.error ? room.bidding : null);

// ------------------------------------------------------------------------------------------------
// The start control
// ------------------------------------------------------------------------------------------------

/** The start control's state with the bid phase in it: while the players bid, the start is neither pending nor preparing. */
export type RoomStartView = StartView | { phase: "bidding"; endsAt: number };
export type StartRoomLike = { activeGame: unknown; preparing?: { ready: number; total: number; error?: string } | null; bidding?: { endsAt: number; error?: string } | null };

/**
 * @workspace/player-client/start's startView for a room that may be bidding: an open bid phase is the start's own
 * state (so "Starting…" ends the moment the room shows it); a failed one counts as a failed preparation (a retry over
 * it shows as starting for a few seconds, then the failure shows again).
 */
export function roomStartView(request: StartRequest | null | undefined, room: StartRoomLike | null | undefined, now: number): RoomStartView {
  if (!room || room.activeGame) return startView(request, room, now);
  const preparing = room.preparing && !room.preparing.error ? room.preparing : null;
  const open = openBidding(room);
  if (open && !preparing) return { phase: "bidding", endsAt: open.endsAt };
  const failed = room.bidding?.error;
  return startView(request, { activeGame: null, preparing: room.preparing ?? (failed ? { ready: 0, total: 0, error: failed } : null) }, now);
}

// ------------------------------------------------------------------------------------------------
// The bidding screen
// ------------------------------------------------------------------------------------------------

/** The quick bids offered on every rule (percent). */
export const BID_CHIPS: readonly number[] = [5, 10, 20];

/** What a bid costs, as one plain example for the price rule. */
export const bidExample = (pricing: BidPricing) => (pricing === "second"
  ? "Bid 10% on a rule: if you win it, at most 10% is taken off your final score (you pay the next-highest bid on it). If nobody bids, rules are dealt at random as usual."
  : "Bid 10% on a rule: if you win it, 10% is taken off your final score. If nobody bids, rules are dealt at random as usual.");

/** A typed bid: a whole percentage within the limits, or why not. */
export function parsePercent(raw: string, min: number, max: number): { percent: number } | { error: string } {
  const text = raw.trim().replace(/%$/, "").trim();
  const value = Number(text);
  if (!text || !Number.isInteger(value) || value < min || value > max) return { error: `Type a whole number from ${min} to ${max}.` };
  return { percent: value };
}

/** One step up or down from a bid; from no bid, a step up is the smallest bid. Null: no step that way. */
export function stepPercent(current: number | undefined, delta: 1 | -1, min: number, max: number): number | null {
  if (current === undefined) return delta > 0 ? min : null;
  const next = current + delta;
  return next < min || next > max ? null : next;
}

/** The player's bids after placing one (it replaces their bid on that rule), in the order the server keeps. */
export const placeBid = (bids: readonly Bid[], familyId: string, percent: number): Bid[] => [...bids.filter(b => b.familyId !== familyId), { familyId, percent }];
export const withdrawBid = (bids: readonly Bid[], familyId: string): Bid[] => bids.filter(b => b.familyId !== familyId);

/** The player's bids with their rules' names, in the pool's order. */
export function bidSummary(bids: readonly Bid[], families: readonly BidFamily[]): { familyId: string; name: string; emoji: string; percent: number }[] {
  const rank = new Map(families.map((f, i) => [f.id, i]));
  return bids.map(b => { const f = families.find(x => x.id === b.familyId); return { familyId: b.familyId, name: f?.name ?? b.familyId, emoji: f?.emoji ?? "", percent: b.percent }; })
    .sort((a, b) => (rank.get(a.familyId) ?? Infinity) - (rank.get(b.familyId) ?? Infinity));
}

/** The screen's one primary button: a player with no bids passes, one with bids is done bidding. */
export const primaryLabel = (bids: readonly Bid[]) => (bids.length ? "Done bidding" : "Pass");

/** After the button: what the player waits for (`waitingFor`: human players not done yet). */
export function doneLine(bids: readonly Bid[], waitingFor: number): string {
  const said = bids.length ? "You are done." : "You passed.";
  return waitingFor > 0 ? `${said} Waiting for ${waitingFor} more ${waitingFor === 1 ? "player" : "players"}…` : `${said} Everyone is done: dealing the rules…`;
}

/** Whole seconds until the bid phase ends (0 once it has). */
export const secondsLeft = (endsAt: number, now: number) => Math.max(0, Math.ceil((endsAt - now) / 1000));
/** "0:27", or "ending…" once the time is up (the deal follows within a second or two). */
export function countdownText(endsAt: number, now: number): string {
  const s = secondsLeft(endsAt, now);
  return s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "ending…";
}

// ------------------------------------------------------------------------------------------------
// In the game: the outcome and the handicap
// ------------------------------------------------------------------------------------------------

/** The bid outcome on a goal card, if the game was dealt with a bid somebody won (a card without one is an ordinary deal). */
export function cardBid(card: unknown): CardBid | null {
  const bid = (card as { bid?: Partial<CardBid> } | null | undefined)?.bid;
  if (!bid || typeof bid !== "object" || typeof bid.won !== "boolean") return null;
  return {
    won: bid.won, pricing: bid.pricing === "second" ? "second" : "first", handicap: typeof bid.handicap === "number" ? bid.handicap : 0,
    ...(typeof bid.familyId === "string" ? { familyId: bid.familyId } : {}), ...(typeof bid.percent === "number" ? { percent: bid.percent } : {}),
    bids: Array.isArray(bid.bids) ? bid.bids : [],
  };
}
/** The handicap on a goal card in percent (0: none, or a game without a bid phase). */
export function cardHandicap(card: unknown): number {
  const h = (card as { handicap?: unknown } | null | undefined)?.handicap;
  return typeof h === "number" && h > 0 ? h : cardBid(card)?.handicap ?? 0;
}

/** The outcome in one or two sentences, for the player's own goal card. `rule`: the won rule's name. */
export function bidOutcomeText(bid: CardBid, rule: string): string {
  if (!bid.won) return "You did not win a bid: this rule was dealt to you at random. No handicap.";
  const percent = bid.percent ?? bid.handicap;
  return bid.pricing === "second" && bid.handicap !== percent
    ? `You won ${rule}. You bid ${percent}% and pay ${bid.handicap}%: a handicap of ${bid.handicap}% is taken off your score.`
    : `You won ${rule} with a bid of ${percent}%. Handicap: ${bid.handicap}% is taken off your score.`;
}

/**
 * The score before the handicap, from the score after it (net = raw − h% × |raw|, so a negative score got more
 * negative). Null when it cannot be told (a 100% handicap leaves 0 whatever the score was) or there is no handicap.
 */
export function beforeHandicap(net: number, handicap: number): number | null {
  if (!(handicap > 0) || handicap >= 100 || !Number.isFinite(net)) return null;
  return net >= 0 ? net / (1 - handicap / 100) : net / (1 + handicap / 100);
}

/** "after your 12% handicap; 200.0 before", to follow the player's own score; null without a handicap. */
export function handicapNote(net: number, handicap: number, fmt: (v: number) => string): string | null {
  if (!(handicap > 0)) return null;
  const raw = beforeHandicap(net, handicap);
  return raw === null ? `after your ${handicap}% handicap` : `after your ${handicap}% handicap; ${fmt(raw)} before`;
}

/** Under standings and results of a game that was bid for (only the viewer's own card says so). */
export const HANDICAP_FOOTNOTE = "Scores are after handicaps from bidding.";

// ------------------------------------------------------------------------------------------------
// Open bidding (settings.bidVisibility "open"): everyone's bids, live
// ------------------------------------------------------------------------------------------------

/** One human player of an open bid phase (bidding.mine `table`): their bids so far and whether they are done. */
export type TableRow = { godId: string; name: string; done: boolean; bids: readonly Bid[] };

/** Everyone's bids per rule (the pool's order, only rules somebody bid on): highest first, ties by name; `mine` marks the viewer's. */
export function everyonesBids(table: readonly TableRow[], families: readonly BidFamily[], meId: string | null | undefined):
  { familyId: string; name: string; emoji: string; bids: { godId: string; name: string; percent: number; mine: boolean }[] }[] {
  return families.flatMap(f => {
    const bids = table.flatMap(p => p.bids.filter(b => b.familyId === f.id).map(b => ({ godId: p.godId, name: p.name, percent: b.percent, mine: p.godId === meId })))
      .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
    return bids.length ? [{ familyId: f.id, name: f.name, emoji: f.emoji, bids }] : [];
  });
}

// ------------------------------------------------------------------------------------------------
// What a game tells about its auction (games.auction; settings.bidDisclosure, everything once it has ended)
// ------------------------------------------------------------------------------------------------

export type AuctionWin = { godId: string; familyId: string; percent: number; handicap: number };
export type Auction = { disclosure: "handicaps" | "all"; handicaps: { godId: string; handicap: number }[]; pricing?: BidPricing; wins?: AuctionWin[] };

/** games.auction's answer, checked (the engine stores the auction untyped); null: nothing is told. */
export function readAuction(value: unknown): Auction | null {
  const a = value as { disclosure?: unknown; handicaps?: unknown; pricing?: unknown; wins?: unknown } | null | undefined;
  if (!a || (a.disclosure !== "handicaps" && a.disclosure !== "all") || !Array.isArray(a.handicaps)) return null;
  const handicaps = (a.handicaps as { godId?: unknown; handicap?: unknown }[])
    .flatMap(h => (typeof h?.godId === "string" && typeof h.handicap === "number" ? [{ godId: h.godId, handicap: h.handicap }] : []));
  const wins = a.disclosure === "all" && Array.isArray(a.wins)
    ? (a.wins as Partial<AuctionWin>[]).flatMap(w => (typeof w?.godId === "string" && typeof w.familyId === "string" && typeof w.percent === "number"
      ? [{ godId: w.godId, familyId: w.familyId, percent: w.percent, handicap: typeof w.handicap === "number" ? w.handicap : w.percent }] : []))
    : undefined;
  return { disclosure: a.disclosure, handicaps, ...(a.pricing === "first" || a.pricing === "second" ? { pricing: a.pricing } : {}), ...(wins ? { wins } : {}) };
}

/** Each player's handicap in percent, by god id (players who won nothing have 0). */
export const handicapsOf = (auction: Auction | null | undefined): ReadonlyMap<string, number> => new Map((auction?.handicaps ?? []).map(h => [h.godId, h.handicap]));
/** "−12%" beside a net score; "" for a player without a handicap. */
export const handicapLabel = (handicap: number | undefined) => (handicap && handicap > 0 ? `−${handicap}%` : "");

/** The "Bidding" block of an ended game: who won which rule for how much, highest handicap first. Empty when the wins are not told. */
export function auctionLines(auction: Auction | null | undefined, playerName: (godId: string) => string, ruleName: (familyId: string) => string): { godId: string; text: string }[] {
  return [...(auction?.wins ?? [])].sort((a, b) => b.handicap - a.handicap || playerName(a.godId).localeCompare(playerName(b.godId))).map(w => ({
    godId: w.godId,
    text: w.handicap !== w.percent
      ? `${playerName(w.godId)} won ${ruleName(w.familyId)}: bid ${w.percent}%, pays a ${w.handicap}% handicap.`
      : `${playerName(w.godId)} won ${ruleName(w.familyId)} with a bid of ${w.percent}%: a ${w.handicap}% handicap.`,
  }));
}
