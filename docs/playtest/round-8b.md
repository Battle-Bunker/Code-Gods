# Playtest round 8, part 2 (2026-11-14, develop at 1522914b)

The coordinator asked for (b) the three-human grid deal and (c) Results at game end, the palette wording and one
bidding room, on the same build as round 8, before round 9. The local backend was restarted and only three browsers
ran (round 8's backend was killed for memory). Screenshot: `docs/screenshots/playtest/round-8/07-grid3-results.png`.

## (b) Three humans settle one grid

Room E96ECF, Grids · beginner: alice (Spread of Three), carol (Magic Eighteen), admin (Leapfrog), all humans, one
Simple agent each. Within 15 s grids 1 and 13 were three-way tug-of-wars.

- Alice opened grid 24 (the top contested grid in her list) in One grid → **Hold this grid here** → Save:
  *"✓ Simple holds grid 24 at the board 5364 6453 5363 6354 … (It cost 21.09 ⚡.)"*
- Carol and admin each typed "24" and the 16 digits "5364645353636354" into **Hold grids [ ] at the board [ ]** and
  saved: *"✓ Simple holds grid 24 at the board 5364 6453 5363 6354"* (21.10 ⚡ and 16.63 ⚡; each price was shown
  before Save and matched the confirmation).
- **Time from picking the grid to all three holds saved: 271 s** in my hands; much of it was finding the grid in the
  list, and typing 16 digits into the right box (my first try put them in the grid-number box; nothing warned).
- The third hold landed with **0:12** left, so this game cannot say whether settling paid. At the end grid 24 was
  still at the held board (One grid shows 5364/6453/5363/6354 at 15.79 bits for alice), so the three holds did keep it.

Final totals: carol 13,850, admin 11,784, alice 11,285. Whether all-settle pays on a grid needs the holds placed in the
first minute; with the harness's speed that needs the rematch/seed option the coordinator has asked for, or a pre-agreed
board entered during planning.

## (c) Re-checks

| Item | Verdict |
|---|---|
| Results at game end | loaded for all three players this time; the engine log has **0** timeouts (one game, three browsers). Round 8's timeout appeared with two concurrent games and four browsers; it is still open with the server session |
| End summary after the held grid | lists grid 24 several times under "What cost you" ("You, Ada Admin and Carol Nguyen pulled grid 24 back and forth (4 pulls, 80.89 ⚡)", then "(2 pulls, 38.53 ⚡)", …) and "Tug-of-wars cost you 6,631.81 ⚡ in all (from your last 1,030 moves)", but says **nothing about the hold**, and does not merge one grid's episodes into one line |
| Palette wording | still **"Leave objects alone"** and **"Settle and hold objects"** in a grid game (should be grids/lines) |
| Bidding room (Grids · beginner with bidding) | works: cards read "Magic Eighteen scores up to 45.80 bits (1 in 61 trillion by chance)"; bid 10 % → "You won Mirrormancer in the bid: 10% comes off your total at the end of the game" |

## Findings

| # | Finding | Severity |
|---|---|---|
| 1 | The grid hold control accepts 16 digits typed into the grid-number box without a warning (it showed "245364645353636354" as grid numbers); the board box stays empty and Save stays enabled for that player | minor (app) |
| 2 | The end summary still does not mention holds; one grid's tug-of-war episodes appear as several separate lines | major (app; same as round 8 #2) / minor |
| 3 | Palette still says "objects" | minor (app) |
