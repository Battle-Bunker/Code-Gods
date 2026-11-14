# What the persona walks taught: UX lessons for engine v2

Written 2026-11-14, when the first-five-minutes workstream on the current app stopped (owner: engine v2 is built from
a fresh slate). Source: about 20 screen-only persona walks across rounds 1–9 (2026-11-11 to 11-14), each a first-time
player who has never written code (Jo, office administrator, desktop 1440×900; Sam, student, phone 390×844), plus the
fixes that followed (PRs #281–#339). Every lesson is written as a statement a test or a walk can check. They are
ordered by how much a beginner is hurt when the lesson is missing.

Goal that the walks measured: from creating a room to **seeing your own agent make a scoring move and being able to say
why the score changed** in under two minutes, without docs; the end of a first game in about five.

Best measured (round 9, non-admin, develop after #338): seated 5 s, first agent 21 s, first scoring move 28 s (phone,
alone with practice partners); score explained at 67–86 s on desktop; natural end 326–405 s. Before round 1: no walker
ever reached a scoring move or the end of a game.

## 1. Getting to a first scoring move (what made it fast)

1. A new player is never blocked by seats. Creating a room seats the creator as a player. One press fills empty seats
   with practice partners (computer players that cost nothing and need no model or key) for **every** signed-in owner.
   *Missing, it was fatal:* with AI seats admin-only, a player with one friend could not start at all (walk quit at 117 s).
2. The room never says two contradictory things: no "AI players are not available" beside a practice-game button.
3. The first agent is pre-written and works: the editor opens holding a named example for the player's own goal, and
   "Summon my first agent" summons it in one press **without a validation step first** (validation under load took
   10–100 s and once kept Summon off until planning ended).
4. Every starting example is payable from the starting energy during planning, when nothing accrues. Test: price every
   shipped starter for every beginner goal and assert it ≤ starting energy (the real prices found one at 572.2 when
   the documented budget said 572).
5. After the first summon, the god's own store can still pay for the dearest starter (so Replace is never refused for
   good). Test: derive the bound from the starters' real prices, not a constant.
6. The game is short and fixed for a beginner: 60 s planning, fixed length (~5 min), so a first game has a visible end.
7. The owner can start the world early, and the button visibly answers ("Starting the world…") until it does.
8. As soon as a summon is accepted, nothing offers "Summon my first agent" any more (planning bar and agents list), even
   while the agent list lags the receipt. Walkers read the stale button as "did it work?".
9. The summon message says what happened in plain words, and where to look next (a button to "My agents").

## 2. Making a score change explainable

1. One word per quantity, everywhere: **points** (the total and each object's share), **✨ rarity** (how rare a rule
   score is), **⚡ energy** (what summons and acts cost), **power** (energy earned per second). Never "bits" or "payoff"
   in player-facing text ("600 bits", "64 bits/s" meant nothing; "bits" stays in engine docs only).
2. Each move of the player's own agent gets one line that says the cell changed, the rule score before → after, the ✨
   rarity before → after **with its reason** ("fewer random grids score this well"), and this object's points before →
   after, with how much the others want it. When that want changed, both values are shown ("2.4 (was 3.2)"): two
   walkers checked "before = rarity × want" against the new want and concluded the numbers were wrong.
3. When points move against the rule score, the line says why ("because the others want this grid less now").
4. "Your points now" is explained before the first agent exists ("every grid already gives everyone some points; your
   agent's job is to raise yours"): walkers asked "11 points and I haven't done anything?".
5. The player's total is always visible during the game, also on a phone (header). A phone walker never found it.
6. Rule scores with parts are named in plain words: "(main part, tie-breaker)", not "(primary, secondary)".
7. Observation is free and exact on the beginner setup (no disclosure noise): with noise, live totals read high and
   dropped at the end, which a new player reads as a bug; paid looks cost attention and sped nobody up.
8. The objects view says the formula in the same words: width = your ✨ rarity, height = how much the others want it,
   area = your points. Use the game's own noun ("grid"), never "object", in a game of grids.
9. The end screen leads with the result ("You finished 1st of 3 with N points"), then why; charts there say that
   points rise and fall (a peak above the final value read as a mismatch) and never pad an axis below zero.

## 3. Changing your agent: replace and put back

1. Every example carries exactly one "Try this:" change in a code comment, small enough for a non-coder to make.
2. A changed draft of a running agent is offered as **Replace**, first; "Summon beside it" is secondary. Two agents with
   different ideas undo each other's work, and every walker who summoned beside ended up confused.
3. Replace is one engine command: same agent, same name, same share, **same stored energy**; only the program changes,
   for its summon price paid from the god's own store. The message says so: "It keeps its stored ⚡ and its share of
   your power; the price came from your own energy."
4. A ready-made alternative ("Other starting points": Simple, Thorough, …) is offered as a Replace of the agent in the
   editor or of the only goal agent, never of an observer. It is reachable by a button next to the next step, not only
   by scrolling (on a phone it sat below the code box; walkers searched the menus for it).
5. "Put the previous version back" is one press, and a frozen comparison says whether the change helped ("Before your
   change: +21 points a move. Since: +1"), with the caveat that early moves are a rough guide.
6. No stale price or "you cannot afford it" line right after a successful replace or summon of exactly that code.
7. The first agent's share of power is large (≈70%: as close to 75% as still leaves room to replace with any starter);
   the summon line explains power in the same breath: "Your power is the energy you earn each second. 70% of it now
   goes to this agent, which spends it on moves; you keep 19.1 ⚡ a second, saved up for replacing it or adding another."
8. A destroy confirmation says what comes back ("The 517 ⚡ it holds come back to you").
9. Energy that is routinely a little below zero (an agent spending as fast as it earns) reads "about 0 ⚡" with the
   exact figure in a tooltip; "−8.9 ⚡" read as broken. A full store says whose store it is (the agent's or yours).

## 4. Failure isolation

1. A failed query takes down only the pane that shows it; the rest of the screen keeps working. No client retry loops,
   no polling: the pane waits for the subscription's next value.
2. A transient failure of a page-level query never tears down the play screen. A walker lost a summon in flight when
   "Could not load this game's room: Function execution timed out" replaced the whole page. Route the play screen on
   data it already has (the game header's room id), not on a second query; never hold stale results as a cache.
3. "No game yet" and "you are not seated" have their own sentences, never "you no longer have access".
4. Every site page renders inside an error boundary that keeps the header; every paged list has its own boundary.

## 5. Phone layout rules

1. Below 768 px the panes stack in reading order; no inner scroller may fill the screen. A list takes at most ~45% of
   the viewport height and the code box a short fixed height, so a swipe beside them scrolls the page.
2. A code box never shrinks to nothing in a short pane (it was squeezed to an empty dark strip on desktop too).
3. Primary buttons stack under their text at phone width; status lines that matter (summoned, replaced) are brought into
   view when a command starts and ends.
4. Adding a pane beyond the maximum says which pane it replaced.

## 6. Wording that confused, and what replaced it

| Confused (quote from a walk) | Replaced by |
|---|---|
| "600 bits", "64 bits/s", "payoff" | ⚡ energy, power ⚡/s, points |
| "rule score (primary, secondary)" | "(main part, tie-breaker)" |
| "✨ 1.0 → 2.9" | "✨ rarity 1.0 → 2.9 (fewer random grids score this well)" |
| "Energy −8.9 ⚡", "0 s of its income" | "Energy about 0 ⚡ · Working: it spends energy as fast as it earns it" |
| "Full: its income is being wasted" | "Full: this agent earns faster than it spends…" / "Your own energy is full" |
| "Summon the thorough version later" (nowhere to find it) | "Open Other starting points and pick Thorough", plus a button |
| "your best object gave you 127 points" (chart peak 249) | "At the end, your best grid gave you 127 points"; chart caption says points rise and fall |
| "AI players are not available in this room" (beside a practice button) | "Practice partners can fill the empty seats, or invite people." |
| "Overdrawn" | kept: understood once explained (judgment call accepted by the coordinator) |

## 7. Never solved (carry these into v2 as open problems)

1. Balance: every walker finished 1st of 3 against practice opponents, usually by a wide margin.
2. Power versus energy is only half understood even with the sentence above; the two words may be one too many.
3. Rarity as "1 in 2.2 billion" and why one more pair moves it so much remained a guess for most walkers.
4. Checking edited code takes 10–100 s under load; walkers waited ("20 seconds?? the game's already going").
5. Phone: finding things in stacked panes is still slow; the menu search is the only way to some panels.
6. Replay events show no points change.

## 8. How to run the persona-walk harness against a new app

Files: `scripts/persona-walk/` (`server.js`, `cli.js`, `README.txt`, `PERSONA.md`, `PERSONA-MODES.md`, `COMMON.md`).

1. Copy the folder to a scratch directory outside the repo and replace the placeholder `<WALK>` (and `<SCRATCH>`)
   with that path: walkers may read nothing in the repository.
2. `server.js` drives the pre-installed Chromium through Playwright (never `playwright install`), signs in through
   the local fake OIDC provider as `--user`, and serves commands; `cli.js PORT <command>` prints a screenshot path, a
   clock (seconds since sign-in) and the visible text with numbered clickable elements. For a new app, change only
   the sign-in step and the site URL in `server.js`; the command set (look, click N, fill N, key, scroll, wait,
   friends CODE [names], quit) is app-independent. `friends` makes other test users join a room code.
3. A walker is a subagent given only `PERSONA.md` (plus a round file of extra questions), a persona, a viewport, a user,
   a port (4701–4799) and an output directory. It may run only the harness and read its PNGs.
4. Use non-admin users (admins see extra controls). A game needed three players: give the walker friends with
   `friends`, or let them fill seats the way the screen offers.
5. Read times from the harness clock at five milestones: seated; first agent summoned; first scoring move; score change
   understood (the walker must write a correct explanation; a guess counts as not understood); natural end. Limit
   about 660 s. Ask round-specific questions with exact quotes and clock times.
6. At most two walks at a time on a 4-core machine (more falsify the timings), a fresh room each, and never run live
   engine tests during a walk (they end every game). Rebuild the static site before walks.
7. After each round: fix what the walks found, run the suites, merge, and walk again. One walk pair per round was enough
   to find 5–8 problems each time.
