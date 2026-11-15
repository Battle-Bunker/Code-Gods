# Playtest round 11 (2026-11-15, develop at 4f073195)

After 25 merges since round 10, among them:
- #611/#616 (noise on others' sums, "about … ≈");
- #615/#624 (public log, live anonymity);
- #625 (agent note points to the leave control);
- #631 (round-10 app minors);
- #632/#638/#641/#642 (line rules v3, adversaries, one equation writer, starters step into fractions);
- #633 (a "more ways to move" trial setup);
- #634 (room settings: hidden random end, totals interval, noise).

Develop deploy green (run 514). Fresh local deployment, app build 6a0a5472. Played by hand in Chromium:
- room 4G3H5F, Lines · beginner, ending **at a hidden random moment (half-life 3 min)**: alice at 1440 and bob at 390, with one practice partner, two games;
- room 8EJMN4, Grids · beginner practice: carol at 1440, at the same time.

Bidding and rotation were checked in round 10 and not repeated in full.
Screenshots: `docs/screenshots/playtest/round-11/`.

## Re-checks

| Item | Verdict | Evidence |
|---|---|---|
| #631 the palette's "Leave lines alone" | ✓ one Enter opens the leave box with the cursor in it | — |
| #631 a tug note's leave button | ✓ the agent's note ends with a **"Leave line 7 alone"** link | 04 |
| #625 the agent note's wording | ✓ "Make a deal with them; to keep your agent off it, add 5 to "leaves these lines alone" under your agent." | 04 |
| #631 no practice-partner hint in live tug text | ✓ the live cards say only "another player … Ask in chat who else wants this line" | 03, 04 |
| #615/#587 no other mover named in the log | ✓ "Another player changed a line: y = −⅔x → y = −⅔x + ⅔"; the log has "Moves that changed your points" and "All moves (the public log)" tabs | 03 |
| "−1x" | ✓ now "y = −x − 1" | 05 |
| Signed-out page | ✓ "Sign in to watch or play the game in room 4G3H5F." | — |
| /device "Access approved" | ✓ neutral (grey box, black tick) | 08 |
| #642 fractions | ✓ fractions now appear in play: "−1¼x − ⅓", "y = −½x − ½", table cells "−3⅓", "2⅔" | 03, 05, 09 |
| Remote assistant | `pnpm player connect` → /device approve → `status` (32 tools in a grid game) → `disconnect` | 08 |
| Results | loads for all players in both rooms; 0 timeouts in the engine log | 06, 07 |

## New: room settings (#634)

The room now offers four settings:
- **How the game ends:** "At its length (everyone sees the countdown)" or "At a hidden random moment", with the help line "The clock shows a range, not an exact time".
- **Half-life (minutes):** "Half of games end within this; the end is a hidden random moment".
- **Totals counted every (seconds).**
- **Others' totals while live:** Exact, or blurred by about 2, 4, 8 or 16 bits.

The summary line reads "ends at a hidden moment, half of games within 3 min". It is clear and fits on one screen (01).

| Item | Verdict | Evidence |
|---|---|---|
| A game that ended after **5 seconds** | The first hidden-end game drew its end at **5.34 s** (`endAtWorld` 5.34; half-life 180 s). That is a correct exponential draw: about 1 game in 50 ends within 5 s. But the players had just summoned. The Results page shows a 5-second chart, and the game counts as game 1 of the rotation. There is no minimum length | 02 |
| The range timer | "GAME ENDS IN **0:13–12:58** 90%". A 12-year-old will not know what "90%" means. The range **never changes**: it read 0:13–12:58 at 0:00, at 0:21, at 0:57 and at 4:31. That is mathematically right for a memoryless end, but it looks like a broken clock. A line such as "could end any moment; 9 in 10 games are over by 12:58" would explain it | 03, 05 |
| Game 2's length | ended at 5:23 (drawn 323.5 s) | 06 |
| Dynamics under a hidden end | The agents behaved the same as under a countdown: Simple has no notion of the end. Tug-of-war ran all game (line 12: 149 pulls from 0:51 to 4:31). A hidden end changes nothing for agents that never look at the clock | 05 |

## Judged as a 12-year-old would

| Item | Verdict | Evidence |
|---|---|---|
| Live "about" points vs the final count | **Still biased high** (round 10 #1), though less on grids. Lines (alice, game 2): the chart peaks near 2,600 and the final is **1,184.00**. Grids (carol): about 19,500 at the end of the chart, final **14,649.79**. Stored moves: shown/true *want* has a median of **2.21** (lines game 2), **1.52** (grid game) and **2.26** (lines game 1), and **91–99 %** of moves show a value above the true one. #616 changed the wording, not the bias | 06, 07 |
| **Negative bits** | "(others' bits were about **−8.21**)": the blur can push a rarity below zero, which cannot happen and confuses anyone who learned that bits count rarity | 03 |
| Trial setup name | "Lines · more ways to move (trial)" has the description "**line-q-lenses**, 11 kinds of rule" (an internal id) | 01 |
| The planning screen's worked example | the y ÷ x row ("−3⅓ ✗", "3 does not divide y(3): the run stops here") reads well | 09 |

## Dynamics (metastable-ecosystem instruction)

| Question | What round 11 showed | Evidence |
|---|---|---|
| Did objects keep moving to the end? | **Yes.** Every contested line or grid was pulled to the end. The lines summary lists 10 contested lines at 18–80 pulls each; carol's grids show 14–30 moves each, and one ("Grid 6 … climbed together, every move raising the points") was a joint climb | 06, 07 |
| Did the board converge or freeze? | No freeze. Fractions now stay in play (#642). Round 10's integer drift (65 % whole at the end against ~30 % at birth) is a convergence signal from play, not a births bug (confirmed with the rules session); not re-measured this round | 03 |
| Did one strategy dominate? | Every human ran Simple. Alice won game 2 and finished 2nd in game 1; carol finished 3rd. No strategy dominated | 06, 07 |
| Best state and sit? | No hold exists, and lines kept moving. A hidden end removes the "freeze at the buzzer" incentive, but no agent uses the clock either way | — |

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | Live "about" values are still biased high: median 1.5–2.3× the true *want*, above it on 91–99 % of moves; the chart drops at the end (lines 2,600 → 1,184) | 06, 07 | **major** (server; round 10 #1 still open) |
| 2 | The blur shows negative bits ("others' bits were about −8.21") | 03 | minor (server/app: clamp or blur in a way that stays ≥ 0) |
| 3 | A hidden-end game can end within seconds (drawn 5.34 s, half-life 3 min); no minimum, and it counts in the rotation | 02 | minor (rules/server; design: a floor such as the planning time?) |
| 4 | The range timer "0:13–12:58 90%" never moves and "90%" is unexplained | 03, 05 | minor (app) |
| 5 | The trial setup's description shows "line-q-lenses" | 01 | minor (app) |
