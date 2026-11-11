# Design explorations: what to try, and where

**What to try first.** Open a new room on the dev deployment: it starts on the setup **Annotated basics**, a 4×4
board of numbers with no colour that now deals the eight beginner rules (#278). Energy now has a capacity: every agent,
and each player's own energy, fills in 30 seconds and then income is lost (#282). Then preview #277
(`claude/distance-cost`) to feel mutation priced by distance, and `claude/paid-observation` (no pull request yet) to
feel paying energy to look at the world. #281 (`claude/first-five-minutes`) pre-fills a working first agent.

Previews work once the owner has added the two secrets in `docs/preview-deployments.md` (merged in #280). A branch
with a pull request: add the label `preview` to it. A branch without: Actions → Preview → Run workflow → the branch
name. On a preview, sign in with the passphrase and pick a test player.

There are no `variant/*` branches and no admin-only "Lab" setups in the repository yet, on `develop` or on any branch.
When one exists it will be visible only when signed in as an admin (on a preview: the player "Ada Admin"). Every
alternative below is a `claude/*` branch or a design document.

| Exploration | What is on develop now | Alternatives | What it changes, and when you might prefer it | How to try it | Not yet verified |
|---|---|---|---|---|---|
| **ECONOMY** | | | | | |
| Energy capacity | Merged (#282). New setting "How long does an empty energy store take to fill?" (default 30 s). Every agent, and each player's own energy, holds at most its power × that time. Income past a full store is lost. Lowering an agent's power share loses the excess at once. **My agents** shows energy against capacity and "full in N s". | None. Change the number per room (suggested: 10, 30, 60, 120, 300 s). | Short times force players to spend or re-allocate; long times let energy pile up as before. A player with all power given to agents holds nothing and cannot summon. | Dev: any setup; the setting is in the energy section of the room's configuration page. A game started before the deploy keeps no capacity. | The default of 30 s has no simulation behind it yet (#282 lists that as next). No check on dev or with people is stated. |
| Paid observation | Agents pay to read: 1/32 of the price of changing (#270). Players see every object live, for free. | `claude/paid-observation`, no pull request. New setting "Do players pay to look at the world?" (free or paid). **Annotated basics** is paid on that branch. A player sees each object as they were last told it: at its birth, when their agents change it or read all of it, or when they pay for a look from their own energy (1.66 energy per object on **Annotated basics**). Activity stays public; content is paid. Design only, in #275: looking costs nothing. No branch. | Gives a player's own energy a use besides summoning, and makes watching the others closely dear. Prefer free if the game should be easy to follow. | Actions → Preview → Run workflow → `claude/paid-observation`, then start a room on **Annotated basics**. | No pull request, so no test results stated. Its own document says a seated player can still watch for free through a second account. Conflicts with `develop`. |
| Mutation priced by distance | Every changed cell costs the same (16.3 energy on the beginner board). The design is merged as a document only (#275, `docs/mutation-cost-design.md`). | Draft #277, `claude/distance-cost`. New room setting "How is a change priced?" (set, distance, and the variants dial, log and multiply). | Adding 1 to a number is the cheapest change; a far jump costs more (the design gives 7.1 energy for +1 and 19.0 for +5). Adds a mutation `add(where, amount)` that fails out of range. Prefer it if small careful steps should beat big rewrites. | Label #277 `preview`, start a room on **Annotated basics** (that branch gives it distance pricing). Other setups keep today's prices. | Everything: #277 says "work in progress" and lists no tests. Conflicts with `develop`. |
| Summon price | Summoning an agent costs energy (unchanged). A summon larger than the player's store is refused with the reason (#282). | Design only, in #275: no summon price, at most 4 agents per player on beginner setups. No branch. | Prefer it if players should try agents freely. | Cannot be tried yet. | Not built. |
| **RULES** | | | | | |
| Beginner set | Merged (#278). **Annotated basics** deals eight rules: Mirrormancer, Magic Eighteen, Opposite Nines, Two Pair, Spread of Three, Strangers, Leapfrog, Crosswise Threes. The coloured set is kept as the new setup **Annotated colours**. Reasons and measurements: `docs/beginner-pool.md`. | **Annotated colours** and **First steps** on dev. | Rules chosen to be equally easy to understand and to write an agent for. | Dev: a new room starts on **Annotated basics**. | Tested with a real game with AI players on a local machine. The set still fails some of its own balance thresholds; Strangers wins 17% of simulated greedy games, Opposite Nines 47%. Two goal-card badges read oddly (#278). Not checked with people. |
| Numbers-only board | Default since #272. Rules that need colour are locked on it. | **Annotated colours** (same small board, three colours, #278) and **First steps** on dev. | Prefer colour if the numbers-only board feels bare. | Dev: **Annotated basics** against **Annotated colours**. | Colour-blind readability of coloured boards is unverified (backlog). |
| Layered rules | Design document and measuring scripts only (#276, `docs/layered-rules-design.md`). No rule in the game changed. | None playable. Proposed first build: Opposite Nines plus "lines add up to x". | An easy base goal, plus a "to score even higher" part that rewards planning. Seven decisions wait for the owner (section 11 of the document). | Read section 1 of the document. Nothing to play. | Not built. Measured on simulated play only. |
| Rule difficulty measure | A command that scores how hard a rule is to understand, to write an agent for, and to combine with others (#273, #274, `docs/rule-difficulty.md`). | None. | A tool for the sessions, not a change to play. It chose the beginner set above. | Nothing to play. | Compared with simulated games, not with people. |
| **FIRST FIVE MINUTES** | | | | | |
| Getting to a first move | A "Write my first agent" button in planning (#264). The room page stays on "Starting…" while a game starts (#263, #266). The five-pane layout is the default (#269). Results show a headline and a next step (#245, #250). | Draft #281, `claude/first-five-minutes`. So far: the editor pre-fills a short, commented example agent for the player's own rule, in both languages, and confirms a summon. Planned on the same branch, not built yet: room owner seated by default, pacing, a readable score, assistant chips. | A new player can summon a working agent without writing code. | Label #281 `preview`, create a room, open the editor in planning. | #281 says "work in progress"; the test set is not stated. The backlog says four of five simulated first-time players could not make a move. No check with people is stated. |
| **COORDINATION INCENTIVES** | | | | | |
| Does careful, cooperative play pay? | Cheap reads for agents (#270) are meant to make coordinating strategies pay. Every player gets the same odds of each rule (#261). The beginner rules can all be satisfied together, pair by pair (#278). | None built for this. Paid observation (above) changes what players know about each other. | The backlog (section 2) says blocking the other players may be the strongest strategy: 62% of simulated wins on the **First steps** board. On the beginner set, blocking beats building for Strangers, Spread of Three and Crosswise Threes in simulation (#278). | Dev: play a three-player game on **Annotated basics** and watch whether blocking beats building. | Simulated only. Whether capacity (#282) or paid observation changes this: not stated. |
| **ENGINE ROBUSTNESS** | | | | | |
| Many games at once | AI players survive idle checks (#241). Stuck starts recover (#254, #262). Validate and Summon no longer hang: after 25 seconds the editor says "The sandbox is busy… Try again" and the same command can be sent again without paying twice (#279). | None. | Still open and marked most urgent: with 20 games at once, games stall for minutes and starts take 80 to 218 seconds (backlog section 1). The abandoned check's remaining work still runs through the queue (#279). | Nothing to pick. On dev, start several rooms at once. | #279 did not run the engine integration suites or a browser test for this. The stall was measured on a local machine only. |
| **ANYTHING ELSE** | | | | | |
| Preview deployments | Merged (#280). A branch can get its own copy of the app with empty data and six test players (Ada Admin, Alice, Bob, Carol, Dan, Erin). | None. | Lets the owner try a branch without touching dev. No AI players or assistant on a preview unless two optional secrets are added. | Add the two secrets, then label a pull request `preview`. | Creating a real preview and the workflow on GitHub are untested: they need the preview deploy key (#280). |
| Replay | My agents in a replay shows spending and energy as in a live game (#271). A game started before #282 replays with no capacity. | None. | Display only. | Dev: open a finished game's replay. | Not stated. |
| Clean-up from the readiness push | #242 to #266: clearer errors, truer rule text (ten goal cards), accessibility fixes, join by code. Released to production in #268. | None. | No design choice to make. One visible change: the brand red is slightly darker (#257). | Dev or production. | See the "Unverified" items in the backlog. |

## Stale or unfinished

- #277 (`claude/distance-cost`): open draft, 7 commits ahead, now conflicts with `develop`. Says work in progress; no
  tests listed.
- `claude/paid-observation`: no pull request. 5 commits ahead, conflicts with `develop`.
- #281 (`claude/first-five-minutes`): open draft, 2 commits ahead, 11 behind `develop`, no conflicts reported. Most
  of its title (owner seated, readable score) is not built yet.
- #277 and `claude/paid-observation` both change the **Annotated basics** setup and both add a tenth version of the
  game's event log. Whichever merges second needs a look.
- Not built, stated as next in #282: removing the limit of four acts per second per agent, the price of an offer, and
  simulations behind the 30-second default.
- Layered rules (#276), free observation and free summoning (#275): documents only. Nothing to play.
- Old branches without an open pull request, all last changed on or before 5 November: `claude/jolly-hamilton-iuxff1`
  (613 behind `develop`), `claude/remove-haskell`, `claude/wip-haskell-room-cache` and `claude/ryb-colour-set` (all
  three conflict with `develop`), `claude/gallant-archimedes-ym5ssz`, `claude/grid-integration`,
  `claude/gridlab-agent-dsl`, `claude/gridlab-defence-goals`, `claude/gridlab-kid-cards`,
  `claude/room-lobby-lifecycle`, and 22 `claude/calib/*` branches holding generated tables. Not part of this week's
  explorations.
- `claude/game-production-readiness-qkh63d`: already merged (#267). Safe to ignore.
- Merged and deleted since the last refresh: `claude/beginner-rules` (#278), `claude/tick-livelock` (#279),
  `claude/preview-deployments` (#280), `claude/energy-capacity` (#282).

Last refreshed: 2026-11-11 11:13 UTC (PRs up to #282)
