# Bid phase (owner's rule, 2026-11-11)

The owner asked for "a bid phase at the start of the game where players can bid handicap percent (taken off their score)
on particular rule families; the highest bidder (ties resolved randomly) wins an instance of that rule family". Full rules,
evidence and variants: `docs/bid-phase.md`.

- **Mechanism (pure, `lib/game-utilities/src/bidding.ts`).** Sort every bid highest first, ties uniformly at random; the
  top bid's player wins that family; drop that player's other bids and the family's other bids; repeat. A won family is
  exclusive. Everyone else is dealt by the game's dealer from the families nobody won (duplicates among them as before).
  **No bids = the dealer's own deal, byte for byte** (the same rng, nothing drawn before it): keep that test green.
- **Bids** are whole percents 1–100. 0% is not a bid (a free exclusive claim would make bidding 0 on everything dominant).
- **Handicap** = what the winner pays (first price: their bid; `bidPricing: "second"`: the best bid still standing behind
  it on that family, at least 1%). It is taken off every TOTAL of that player (standings, scoreboard, own score, results,
  the log's recorded totals): net = total − h% × |total| (`lib/world.ts withHandicaps`). Per-object bits and payoffs are
  never scaled: a payoff is a product with the peers' bits, so scaling one player's bits would change the others' scores.
- **Where it lives.** The bid phase is a step of the START, on the room (`rooms.bidding`, private `roomBids` rows), before
  the game row exists; it ends at `bidSeconds` or when every human player is done, then hands the deal to the existing
  `preparing` → launch path. There is no "bidding" value in the games phase union. `bidSeconds` 0 (the default) = no phase.
- **Disclosure.** Sealed bids; after the deal each player's own card carries `bid` and `handicap`; `games.handicaps` and
  `gameAuctions` are never projected while a game is live unless the setup's `bidDisclosure` says so (`games.auction`).
  An ended game's replay shows everything. The disclosure contract (`test/disclosure.ts`) checks other players' bid
  outcomes.
- AI seats do not bid.
