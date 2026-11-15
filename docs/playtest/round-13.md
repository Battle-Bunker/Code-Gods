# Playtest round 13 (2026-11-15, develop at 8ec3aed9)

After #686 (glossary in the palette), #688/#693/#694 (round-12 views and summary items), #691/#695/#696/#697 (every game
pays to look, the Watcher, a calm freshness mark, agents tell their owner what they learn), #680/#692 (no emoji:
"energy" for ⚡) and the line-parameter work (#682, #690). Fresh local deployment, app build c50f864c; the latest
finished develop deploy was green (run 539; 562–563 were cancelled by newer pushes). Played by hand in Chromium, three
practice games at once:
- room PKJ5CJ, Lines · beginner: alice at 1440;
- room EHUVE2, Grids · more rules: bob at 390;
- room APZJDG, Grids · beginner: carol at 1440.

The beginner presets now run 10 minutes; "Grids · more rules" ends at a hidden moment (half-life 5 min). 0 timeouts or
errors in the engine log. Screenshots: `docs/screenshots/playtest/round-13/`.

## Re-checks

| Item | Verdict | Evidence |
|---|---|---|
| "More views" / "Compare with" at 390 on Grids · more rules (#660/#665) | ✓ both selects fit inside the card ("choose", "nothing") | 01 |
| Glossary from the palette (#686) | ✓ "Explain a term" opens a term card ("Room: The table you play at: a short code, an owner and up to 8 seats …") with an **All terms** link to a Glossary pane | 05 |
| ⚡ replaced by the word | ✓ "Energy 576.00 energy (full)" (reads twice: "Energy … energy") | 02 |
| Remote assistants | ✓ device flow → `status` (57 tools, a new `object look`) → `game standings` → `disconnect` | — |
| Results | load for all three games | 06–08 |

## New: paying to look (#691, #697)

| Item | Verdict | Evidence |
|---|---|---|
| The freshness mark | Each line has a calm green dot "seen 6 s ago", or "seen 12 s ago · up to date". Clear | 02 |
| Look buttons | Folded under "Your agents tell you about every line they touch. Want to see them sooner?". **Look at all 3 lines (0.89 energy)**: one click, and every line read "seen 3 s ago". Cheap and clear | 02 |
| Keep my lines fresh (Watcher) | The confirmation explains it well ("an agent that only looks, for 20% of your power … without paying for each look yourself") but says only **"It costs energy"**, not how much. After Save the store fell from 576 to **192 energy**, the agents' share went from 70 % to 90 %, and the Watcher made 29 moves for 0 points. The line under the buttons changed to "Your Watcher keeps them fresh" | 03, 04 |
| "Look at all **3** lines" | alice's game had 7 lines in store, but the list and the button counted 3. The other lines are presumably not yet known to her, but nothing says so | 02 |
| Does it change dynamics? | Little to see with practice partners. Alice's agents already tell her every line they touch, so looking only helps for lines nobody of hers touches | — |

## Hidden end in "Grids · more rules"

Bob's game ended after **70 s** (drawn 70.4 s with a 300 s half-life; within the 90 % range shown). The Results page
(06) does not say that the end was a hidden random draw or when it came; a 12-year-old sees a game that stopped after a
minute. It is a correct draw (about 15 % of games end in the first 70 s), but this preset now makes short games common.

## Judged as a 12-year-old would

| Item | Verdict | Evidence |
|---|---|---|
| "Energy 576.00 energy" | the word twice; "576.00 energy" alone, or "Energy 576.00", reads better | 02 |
| "good for both" moves | the Try-next-game box now quotes the on-screen label ("the moves marked "good for both"") | 06, 07 |
| Watcher's price | "It costs energy" with no number, then 384 energy gone | 03, 04 |
| A 70-second game | see above | 06 |

## Dynamics (metastable-ecosystem instruction)

| Question | What round 13 showed | Evidence |
|---|---|---|
| Did objects keep moving to the end? | **No, mostly not, in the 10-minute games.** Stored states (`v2ObjectStates.changedAt`): Lines PKJ5CJ, 7 lines, last changes at **12, 42, 153, 162** s, then 595, 595, 600 s; so 4 of 7 lines did not move for the last 7+ minutes. Grids APZJDG, 7 grids, last changes at **30, 147, 169, 240** s, then 549, 598, 600 s. Alice's points chart is flat from about 1:00 to 9:00, then jumps in the last minute | 07 |
| Did the board converge or freeze? | **It froze.** Lines settled on whole numbers with prime gradients: 6 of 7 lines are whole (`-43,1,-47` → y = 43x + 47, "gradient 43 · exactly"; y = 37x + 43, "gradient 37 · exactly"). The grid's top grids show "folded cells three apart · exactly". Once a main part is exact and the tie-breaker is high, the starter has no move that pays, so it stops | 07, 08 |
| Did one strategy dominate? | Every human ran Simple; alice and carol each won (1,560.76 and 2,277.82) | 07, 08 |
| Best state and sit? | **Yes, by default.** With 10-minute games, agents reach "exactly" on the main part within 1–3 minutes and then sit for the rest of the game. That is the collapse the owner's criterion names | 07 |

## Findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| D1 | In 10-minute beginner games, most objects stop changing after 1–4 minutes: 4 of 7 lines and 4 of 7 grids had their last change before 4:00. The points chart is flat for about 8 minutes. Main parts reach "exactly" (prime gradients, folded threes) and the starters then sit | 07, 08 | **major** (rules / agents; the metastable-ecosystem criterion) |
| 1 | The Watcher's confirmation says "It costs energy" without the price; it took 384 energy | 03, 04 | minor (app) |
| 2 | "Grids · more rules" defaults to a hidden end with a 5-minute half-life; a game ended after 70 s, and Results does not explain the hidden end | 06 | minor (app; preset choice for the coordinator) |
| 3 | "Look at all 3 lines" while the game held 7 lines; nothing says why only 3 | 02 | minor (app/server: say "the 3 lines you know") |
| 4 | "Energy 576.00 energy" | 02 | minor (app) |

Not covered this round: rotation totals (round 10 ✓), bidding (round 12 ✓), a two-human game, the "Price of a look"
room setting (not found in the room's settings list I saw).
