# Playtest round 4 (2026-11-14, develop at 4221e335)

After #487–#497: grid values (#491), the desktop dock (#492), no step text in faces and goal card (#489), LEAVE in
line starters (#494), line badges (#496), grid starters on value functions with 900 ⚡ (#497). Hand play in Chromium,
**fresh** local deployment: alice 1440×900 (Lines · beginner, then **Grids · beginner with bidding**), carol 1440×900
(**Grids · beginner**), bob 390×844 (**Grids · beginner**). Screenshots: `docs/screenshots/playtest/round-4/`.

## Blocker found before playing

`dev` would not start on the deployment I had used since round 1: *"Schema validation failed. Document … in table
"v2Moves" does not match the schema: Object contains extra field `level` … Path: .after"*. The v2Moves validator
dropped `before/after.level` without widening. The **develop deploy failed three times in a row** at the same time
(runs 393–395, #494–#496). Sent to the server session and the coordinator at once. I continued on a wiped local
deployment (allowed for local testing; the cloud dev deployment cannot be wiped that way).

**Start to finish:** lines practice **yes** (1440); grid practice **yes** at 1440 **and** 390; grid bidding room
**yes** (bid → "You won Magic Eighteen in the bid: 20% comes off your total" → play). Not repeated: two humans,
remote connection (paths unchanged).

## Re-tests of open items

| Item | Now | Evidence |
|---|---|---|
| Dock at 1440×900 (rounds 1–3 major) | **fixed**: panes share a column as tabs ("Your secret goal · Where am I", "Leaderboard · Agent code"); opening a pane no longer evicts "What just changed"; results, stats and charts are no longer clipped | 04, 07, 11 |
| Step / rung / level text (decision 23) | **gone** from the goal card (number line per part, "the bigger, the better"), the compact faces, the act log, What-if, the bid cards ("scores up to 59.60 bits (1 in 870 quadrillion by chance)") and gallery rule pages. **Survivor:** the gallery intro, "open a rule to see a worked example and **the steps to the top**" | 01, 06, 09, 10 |
| Arithmetic | consistent everywhere I checked by hand: 4.41 × 14.60 ≈ 64.36; 1.20 × 13.81 ≈ 16.53; 1.91 × 9.94 ≈ 18.95; 2^4.41 = 21 ("1 in 21"); bid cards 2^59.6 = 8.7·10^17, 2^45.8 = 6.1·10^13, 2^63.6 = 1.4·10^19, 2^53.3 = 1.1·10^16 all match their "1 in N"; bits always 2 decimals. Products are shown with "≈" (rounded factors), as intended | 04, 06, 09 |
| Grid compact face (round 3 major) | **mostly fixed**: boards are drawn and readable with box dividers, at 1440 and 390. On the phone one row still had a caption ("how far the top-right box is from two different pairs 0") over the board, and the part labels under each face are cut off ("every corner box holds two c…") | 04, 05 |
| Grid starter price (round 3 major) | **fixed**: grids start with 900 ⚡; Opposite Nines starter 411.53 ⚡, Two Pair 495.55 ⚡, Magic Eighteen 556.13 ⚡, each leaving enough for another summon later | 02, 03, 11 |
| LEAVE knob (#494) | **works as designed**: the note reads "Tug-of-war on line 23: another player keeps pulling it back. Make a deal with them, then add 23 to LEAVE in your agent. (said 3 times)"; the starter has `const LEAVE = []; // lines you agreed to leave alone, e.g. [19] or [4, 9]`. I changed only `[]` → `[23]` and pressed Replace; no tug-of-war card for line 23 appeared afterwards (I could not watch line 23 move by move, so this is consistent, not proven). The edit's price is still not shown anywhere | — |
| Tug-of-war legibility | legible (cards name the players, the count, the time span and the agent's spend). Against practice partners a human still cannot end one by talking (known; partners do not read chat) | 04, 06 |
| Second summon / pull power back | "Summon another agent" worked straight from my own store (556.13 ⚡ of 576): the new agent took 15 %, the first kept 70 %. The pull-power-back path was not reachable because the store was full; not tested | 11 |
| Phone growth face y(0) | not re-tested (no growth rule dealt on the phone) | — |

## New this round

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 1 | v2Moves schema narrowed without widening: local `dev` refuses to start on an existing deployment; develop deploys 393–395 failed | — | **blocker** (server) |
| 2 | Grid practice is lopsided against the human: carol (Opposite Nines, starter "Odd numbers on the board", 113 moves in 30 s) finished **509 points vs 4,126 and 4,056** for the partners; at 0:30 it was 107 vs ~1,340. Bob (Two Pair) won his grid game 10,717 vs 9,789, so it depends on the rule: the Opposite Nines starter barely raises its owner's points (+117.73 from 113 moves) | 07 | **major** (agents, grid starters) |
| 3 | The rule gallery offers only line boards ("Whole-number lines / Fraction lines / Four lines"): no grid rules, though grids are dealt | 10 | minor (app) |
| 4 | Both of alice's grid agents were named "Odd numbers on the board" in a Magic Eighteen game (known: agents named after the tie-breaker) | 11 | known |
| 5 | Typo in the goal card and gallery: "decides between line s that are equally good" | 06, 10 | minor |
