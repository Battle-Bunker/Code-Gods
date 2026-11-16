# Playtest round 8 (2026-11-14, develop at 1522914b)

After #554 (the Hold control), #556–#562 (act-log board, hold link, assistant re-walk, round-7 minors, AI seats that
settle, debt/hold fixes). Develop deploy green (run 453). `dev` restarted on the **existing** local deployment.
Hand play: room A (alice 1440 + bob 390 + 1 partner, no deal), room B (carol 1440 + admin 1440 + 1 partner, a held
deal), room C (alice + carol + admin, Grids · beginner, three humans). Screenshots: `docs/screenshots/playtest/round-8/`.

## (1) The deal that pays

**Lines, room B (deal).** Carol and admin were both dealt Square Area (same main part, different tie-breakers:
"smallest prime factor of the root as big as possible" vs "as many prime factors as possible"). Carol opened in chat
("lets deal: hold the lines we fight over where they are now"), found line 8 (a three-way fight with admin and the
partner), opened it in One line and pressed **Hold this line here**: the forge filled "Hold lines [8] at y = [18] x +
[−6]" and said, before saving, *"Simple will hold line 8 at y = 18x − 6, moving it back whenever anyone moves it
away: only those settings change, for 16.98 ⚡. Settling where every player agreed is the deal that pays."* Save →
*"✓ Simple holds line 8 at y = 18x − 6 … (It cost 16.98 ⚡.)"* (**price shown = price charged**). Admin read the chat,
typed the same three numbers into the same control and saved (same confirmation, same 16.98 ⚡).
**Time from "let's deal" to both holds saved: 147 s** (including my driving; the slow part is finding the line in the
list and reading its equation).

| Room | Humans' rules | Deal | Final totals |
|---|---|---|---|
| A | alice Square Area, bob Treasure | none | partner 1st; **bob 3,265 (2nd), alice 3,250 (3rd)** |
| B | carol and admin Square Area | line 8 held by both | **carol 3,405 (1st), admin 3,286 (2nd)**, partner 2,585 |

Both humans finished ahead of the partner only in the deal room, but the deals of rules differ between rooms and it
was one game each way, so this **does not show that the deal paid**; line 8 also stayed contested by the partner. A
clean comparison needs the same seats and rules twice (a seed or a rematch with the same deal), which I could not set
up from the UI.

**Grid, room C (three humans).** Rules: Leapfrog (alice), Magic Eighteen (carol), Crosswise Threes (admin); grid 19
was pulled by all three. Alice pressed **Hold this grid here**: *"Simple will hold grid 19 at the board 3243 5544
5243 6251 … for 21.09 ⚡"*, saved, and posted the board in chat. Before carol and admin could type it into "Hold
grids [ ] at the board [16 digits, row by row]", **my local backend was killed for lack of memory** (four browsers +
the engine on this machine), and the game ran out while it restarted. So the three-way grid deal was **not
completed** and nothing can be said about whether it pays. (Not an app defect.)

## (2) Does anything help a player work out WHAT to propose?

Partly. One line shows **"What would make it rarer"** with priced options for *your own* rule (e.g. "Turn about the
point at x = −2, gradient −16 → y = 2x − 38 · area 1 → 361 · square's root's smallest prime factor 1 → 19 → 17.05
bits"). Nothing shows what the *other* player wants on that line, so the only proposal a child can make is "hold it
where it is now", which is what both rooms did. Where a 12-year-old gets stuck:
- finding the contested line's current equation (the tug-of-war card names the line but not its state; the Lines
  list must be scrolled to that row; in room B the Lines list went **blank** once after opening One line);
- on grids, reading and typing a **16-digit board** to another player and back;
- choosing a state better than "where it is now": no view combines both players' wants.

## (3) Does the end summary say the deal worked?

**No.** Room B's Results showed the headline, chart and standings, with no line about the hold. In room C the summary
lists "What cost you" ("You, Ada Admin and Carol Nguyen pulled grid 8 back and forth (16 pulls, 211.49 ⚡)" …
"Tug-of-wars cost you 4,867.94 ⚡ in all: energy that moved no grid for good"), which is good, but nothing says
which grids were held or what the hold earned.

## New findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | **Results pane fails at game end:** on bob's phone "How the game went" showed *"This pane could not load: [CONVEX Q(v2/playState:moves)] [Request ID: d4eecc2af49a3060] Server Error Function execution timed out (maximum duration: 1s) Called by client"*; **Try again** returned the same error (same request ID). The engine log has 14 timeouts at the end of the two games: `Q(v2/playState:moves)` and `A(v2/replayBuild:build)` "Function execution timed out (maximum duration: 1s)". Two games ran at once on my machine, so load contributed; still, the query that feeds Results exceeds the 1 s limit near the end of a 5-minute game, and the player sees a raw server error with no recovery | 04 | **major** (server: query cost; app: the raw error and a retry that does not retry) |
| 2 | The end summary does not mention a hold or a deal (see 3) | 03, 06 | major (app; the coordinator's question) |
| 3 | Nothing shows the other player's want on a contested line, so proposals default to "hold it where it is" (see 2) | 01 | design question |
| 4 | The Lines list went blank (header and legend only) in room B after opening One line from it | 01 | minor (app) |
| 5 | The grid Hold control asks for "16 digits, row by row" typed by hand; "Hold this grid here" fills it for the player who presses it, but the other players must copy 16 digits from chat | 05 | minor (app) |

## Re-checks

- Leave/hold confirmation: ✓ "✓ Simple holds line 8 … (It cost 16.98 ⚡.)".
- Hold price shown vs charged: ✓ equal (16.98 ⚡, both players).
- Phone pane-name row: opaque now ✓ (04).
- Palette "objects" wording, bidding room: **not re-checked** this round (time went to the deal tests and the
  backend restart).
