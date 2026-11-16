# Engine v2 against v1: an audit of the game rules (14 November 2026)

**What this is.** Every game-logic and product rule the v1 engine encoded is listed below, with what v2 does today on
`develop`, and **who decided each change**. The owner (verbatim): "the old code acts as a precious spec of what I want
and a demonstration of what I'm trying to accomplish, even though the specific implementation of that logic is not
precious." So a v1 rule should still hold in v2 unless one of the owner's verbatim decisions
([owner-decisions.md](owner-decisions.md), "The owner's decisions, verbatim", numbered 1–24) changes it.

**Sources.** v1 is the branch `archive/engine-v1` (written `archive:` below). Its rules come from `.agents/memory/*.md`,
`docs/energy-model.md`, `docs/public-log-design.md`, `docs/engine-api.md`, `docs/mutation-cost-design.md`,
`docs/judgment-calls.md`, `docs/beginner-pool.md`, `docs/tiered-rules.md`, `docs/bid-phase.md`, and from the code in
`lib/game-core`, `lib/game-utilities` and `artifacts/engine/convex`. v2 is `develop` at `e60f0be3`. Provenance comes
from commit history and PR bodies.

**Labels used in the table.**
- **Status:** **kept**, **changed**, **dropped** or **unknown**. UNVERIFIED marks a claim I could not check in the files.
- **Authority:**
  - **Owner N**: a verbatim owner decision covers the change.
  - **Discretion**: a session decided it. The entry says where: the architect's judgment calls, a coordinator call, the
    integration plan, a commit, or *silent* (no document records the decision).
- **The integration plan's drop list is discretionary.** It was written in commit `7359a0f4f` (PR #357, 06:18 UTC on
  14 November). That was before the owner gave decision 15. Six minutes later, commit `f29109c1b` (PR #360) relabelled
  the same list "deleted in D1" and cited decision 15. The list itself predates the decision.
- **"v1 live default" is not the same as the code default.** It means the default setup, Annotated basics:
  `archive:lib/game-core/src/settings.ts:714-780`. Some features the owner asked for were already switched off there
  by coordinator calls (noted in the rows).


## Status, re-audited 15 November against `develop` 51249392

This table is machine-checked. `docs/engine-v2/v1-audit-status.json` mirrors it row for row (item, title, status,
the PRs and decision, call and trial numbers it names, the evidence) and adds, for every **restored** or **kept** row,
the test files that would fail if that behaviour broke, or a `gap` saying what no test guards (a **partly** row may
name the tests that guard the part that is back). Evidence names files and functions or symbols, not line numbers,
so it does not drift. Rows updated 16 November against `develop` 9e3c57672: defence goals, the commit clause, 200
agents and user setups restored; grid boards, rival inference and the "secondary preference" wording partly.
`artifacts/engine/test/unit/v1-audit-status.test.ts` keeps the two in step: the same rows in the same order, every
named decision, call and trial present in owner-decisions.md, every listed test file present, and no restored or kept
row without a test or a stated gap (it prints the gaps). Change a row here and in the JSON together.

Each §1 departure and §2 row, checked against the code as it now stands (not this file's older text). Verdicts:
**restored** (with PR), **owner N** (a verbatim owner decision covers it), **call/trial N** (a coordinator's declared
call or trial in owner-decisions.md), **kept** (v1 and v2 agree), **STILL MISSING** (with size and side).
Note: owner-decisions.md repeats numbers 12, 13, 17, 18, 19 and 23 under "Coordinator's calls under the owner's
delegation"; a call number below means the one whose subject is named.

| Item | Status | Evidence |
|---|---|---|
| §1.1 Live moves attributed | restored (#587, #615); owner 33 | disclose.ts attributed; play.ts log, moves, objectMoves |
| §1.2 Exact others' sums | owner 32 (#608, #611, #673); call 33 (What if quotes cost a look and carry the blur) | disclose.ts peerNoiseVarianceOf, readingNoise; play.ts othersAt |
| §1.3 Paid looks deleted | restored (#643, #653); owner 35 (every game pays to read, weight may be 0, #685) | knowledge.ts paysToRead, paidLive, lookPrice |
| §1.4 Default domain line-z | restored (line-q beginner; owner 2, call 6; whole-number setups retired #620) | lib/v2-linear/src/presets.ts (lines-beginner on line-q); convex/v2/presets.ts BEGINNER, DEFAULT_PRESET |
| §1.5 Hold rarity | owner 43 (not restored; measurement docs/engine-v2/hold-measurement.md, call 11) | owner-decisions.md decision 43 |
| §1.5 Defence goals | restored (#983; call 1): off by default, a room setting on grids only | deal.ts dealDefence, defencePool; lobby.ts defenceGoals override; world.ts valueOf (defence); tick.ts defenceOf |
| §1.6 Hidden random end | restored (#623) as a setting, default on the v1-board presets; beginner fixed 600 s by owner 34 ("10m long") | duration.ts drawEnd; presets.ts V1_DEFAULT_BOARD (halfLife), BEGINNER_WORLD (fixed 600 s) |
| §1.7 Fair-aligned dealer | trial 12 (logging only; the deal is the seeded shuffle with the seating rules) | deal.ts policyDeal; lobby.ts |
| §1.8 Idle parking | restored (#629) | activity.ts |
| §1.9 Scoreboard interval | restored (#623); exact standings by call 15, owner 33 | lobby.ts scoreIntervalSeconds |
| §1.10 Tiers | owner 13, 23, 29 (a main part plus a tie-breaker, no gates) | lib/v2-linear presets |
| §1.11 Commit clause, shelter targeting | commit clause: restored (#884; lens worker #874), call 34; shelter: call 32 (not restored) | lib/v2-agents act.ts commitClause, onlyIfBetter; tick.ts passes settings.commitClause; no shelter in v2; v1 archive lib/game-core/src/settings.ts:153,158 |
| §1.12 Futility memo | call 31 (not restored: a v2 act is not a pure function of source and object) | tick.ts offers with no memo; v1 archive lib/futility.ts |
| §1.13 Birth law and counts | call 4 (stationary-law births); owner 31 (beginner counts) | world.ts birthDraws, distinctBirths; tick.ts regularBirths, opportunities |
| §1.14 Move onto own state | restored (#615); owner 24 | tick.ts `occupied` (the holder map includes the object's own state); loop.ts holderOf |
| §1.15 200 agents per god | restored (#898; call 35), with paginated agent lists | play.ts MAX_AGENTS, agents (paginated); agents.ts summon refuses past MAX_AGENTS |
| §2.1 Live, a player sees only their own utility | kept | world.ts valueOf; validators.ts playObjectV |
| §2.1 Every transformation and spawn is public | restored (#587, #615); owners 33, 36 narrow the spread | play.ts log, objectMoves; disclose.ts attributed |
| §2.1 Others' summons hidden | kept (v1's public agent count is not shown; minor) | play.ts agents, agentEnergy, agentPrograms (requireSeat, ownAgent: the caller's own agents only) |
| §2.1 Public scores move together | restored (#623); call 15, owner 33 | loop.ts scoreboard |
| §2.1 Disclosed sums carry Gaussian noise | owner 32 (#673) | disclose.ts; presets.ts peerNoiseVariance |
| §2.1 The commit clause decides on noisy values | owner 32 (per-player stable readings) | lib/v2-agents host.ts othersAfter (the disclosed payoff); act.ts commitClause |
| §2.1 Per-object public figures | kept; counts "as last looked" by owners 33, 35 | spectate.ts object (bornAt, version, changedAt) |
| §2.1 Paid observation | restored (#643, #653); owner 35 | knowledge.ts |
| §2.1 Spectators see the public view | kept | spectate.ts |
| §2.1 Ended games fully transparent | kept | replays.ts; disclose.ts attributed, disclosesNoise |
| §2.1 Nothing visible disappears | kept (UNVERIFIED pane by pane) | disclose.ts attributed, disclosesNoise |
| §2.1 Rival inference is a legitimate read | partly (#922; call 36): rule.fit (v1's fit_utility_mixture) and rule.candidates are restored; the fit is offered on lines at noise σ ≥ 8 only, so it is refused on grids and in the beginner game (noise 0), by call 36's guard | fit.ts fitRefusal; ops/rule.ts; lib/v2-affordances ops/play.ts rule.fit, rule.candidates; play.ts candidates |
| §2.1 Bids sealed | kept (owner 18) | bids.ts |
| §2.2 Every object unique | restored (#615); owner 24 | tick.ts `occupied`; loop.ts holderOf; world.ts distinctBirths |
| §2.2 Every object an independent universe | kept, tested (test/v2-independence.test.ts) | lib/v2-core contracts |
| §2.2 Births: Poisson | call 4; owner 31 (beginner) | world.ts; tick.ts |
| §2.2 Integer and string objects | owner 15 | — |
| §2.2 Grid object boards | partly: call 13 (grids-more-rules on the 4×4 digit board); call 37 and #925 (v1's coloured 4×4 board, Grids · original colours); Grids · arithmetic withdrawn (#1045, call 39); the 5×5, 6×6 and 7×7 card boards are in lib/v2-grid-boards but in no preset, **STILL MISSING** as setups | presets.ts PRESETS (grids-beginner, grids-more-rules, grids-original-colours); lib/v2-grid-boards type.ts BOARD_VARIANTS |
| §2.2 Opportunity targeting: uniform or shelter | call 32 (shelter not restored) | tick.ts header comment (an object uniformly) |
| §2.3 Payoff | kept | world.ts valueOf, valuesOf; disclose.ts standingsFor |
| §2.3 Bits are rarity | owner 10 (4, 19, 20, 22, 23) | values.ts worthOf |
| §2.3 Hold rarity | owner 43 | as §1.5 |
| §2.3 Defence goals | restored (#983; call 1) | as §1.5 |
| §2.3 Tiered rules | owner 14; call (f) | lib/v2-linear presets |
| §2.3 Continuous landscape | kept (owner 13, 23) | spec §0.3 |
| §2.3 Params named and typed | kept | lib/v2-core contracts.ts ParamDecl |
| §2.3 Params of equal opportunity | restored (#630) | test/unit/v2-params-equal.test.ts |
| §2.3 Scores are points tuples, never "tie-break" | partly (call 35): a line's parts are said "main part", "secondary preference" in the app; "tie-breaker" remains on the rule gallery page and in the AI players' prompt (lib/v2-views faces.tsx has it only in comments) | lib/v2-views annotate.ts partName; player-web panes/lines.ts partsNote; site/pages/rule-gallery.tsx; lib/v2-ai prompts.ts |
| §2.3 Heterogeneous simple utilities | kept (owner 14) | beginnerPool, 11 families |
| §2.3 Dealing fair-aligned | trial 12; call 30 (practice dealt as real) | deal.ts |
| §2.3 Rule rotation | kept | deal.ts |
| §2.3 Commit clause | restored (#884; lens worker #874), call 34 | as §1.11 |
| §2.3 Futility memo | call 31 (not restored) | as §1.12 |
| §2.4 Power per god | owner 38; call 17 (beginner 4/s; 64 elsewhere) | lib/v2-economy settings.ts LINES_BEGINNER_ECONOMY; presets.ts V1_DEFAULT_BOARD |
| §2.4 Capacity | kept; call 17 (beginner 240 s) | energy.ts |
| §2.4 Energy and debt move with power | kept | energy.ts movePower |
| §2.4 Debt bound | kept | energy.ts actCredit, affordable, chargeAct |
| §2.4 Selection proportional to energy | kept | energy.ts pickByEnergy |
| §2.4 Opportunity rate | owner 37 | lib/v2-economy settings.ts LINES_BEGINNER_ECONOMY (3/s) and its bounds; presets.ts V1_DEFAULT_BOARD (100/s) |
| §2.4 Act charge | kept | lib/v2-economy charge.ts |
| §2.4 Offer read log2(live objects) | kept | energy.ts offerReadBits |
| §2.4 Read metering | owner 6, 35 | presets.ts readPriceWeight |
| §2.4 Change cost | owner 11, 17, 19 | lib/v2-core walk.ts |
| §2.4 Summon price | owner 21 | lib/v2-agents summon.ts |
| §2.4 Starting energy | call 17 (beginner); kept elsewhere (600, 900 on grids-more-rules) | presets.ts |
| §2.4 First agent's share | kept | energy.ts FIRST_AGENT_SHARE_TARGET, firstAgentShare |
| §2.4 Bid phase and handicap | kept (owner 18) | lib/v2-economy bidding.ts |
| §2.5 Sandboxed Python or TypeScript | kept | lib/v2-sandbox |
| §2.5 Step budget 500,000 | kept (owner 6) | lib/v2-sandbox limits.ts |
| §2.5 Agent sees only its object | owner 6 | lib/v2-agents host.ts |
| §2.5 At most 200 agents | restored (#898; call 35) | as §1.15 |
| §2.5 One pause per player, 180 s | restored (#873): a pause ends by itself after the room's pauseSeconds (default 180), or earlier when the owner resumes; only a running game pauses | loop.ts pauseGame, pauseEnds; header pauseEndsAt |
| §2.5 Planning holds until sandboxes are warm | restored (#635) | readiness.ts; loop.ts allReady |
| §2.6 At least 3 players | kept | presets.ts minPlayers |
| §2.6 At most 8 players | restored (#629) | access.ts MAX_PLAYERS |
| §2.6 Public chat only | kept | tables.ts v2Chat |
| §2.6 AI players same information | kept (owner 16) | aiTurn.ts |
| §2.6 AI only in admin rooms; quotas | kept | spend.ts |
| §2.6 Assistant modes | kept | assistant.ts; assistantCore.ts |
| §2.6 Assistant state per (player, game) | kept | assistant.ts |
| §2.6 Duration halfLife or fixed | restored (#623); owner 34 (beginner 600 s); trial 16 | duration.ts |
| §2.6 Planning 60 s | kept | presets.ts planningSeconds |
| §2.6 Park after 30 minutes idle | restored (#629) | activity.ts IDLE_MS |
| §2.6 Members players or spectators | kept | lobby.ts |
| §2.6 Practice partners and AI never bid | kept (owner 18) | bids.ts |
| §2.6 Setups: users may save their own | restored (#931, #965; call 35): users save, share, duplicate and apply their own setups | convex/v2/setups.ts |

---

## 1. The discretionary departures, most consequential first

1. **Live moves are now attributed to their mover; v1's public, unattributed log is gone.** This reverses a rule the
   owner stated in words.
   - **v1:** every transformation was public to every player "without attribution". The owner, 2026-11-01:
     `archive:docs/public-log-design.md:5-8`.
   - **v2:** a player gets a move only if it is their own or it changed their points (`v2/loop.ts:90, 422-432`). The
     move then names the player who made it (`by`, shown by name in `v2/play.ts:155-170`; the tugs-of-war in
     `play.ts:179-193` name the others too).
   - **Who decided:** commit `001af4f1a` ("so the app can say who pulled a line back"), with no owner words.
   - **Recommendation: restore.** Give every player every move without attribution, and have the scoreboard move in
     unison. If attribution is wanted for negotiation, ask the owner first.
2. **The exact sum of the others' bits is disclosed, including at hypothetical states; v1's score noise is gone.**
   - **v1:** "never disclose an exact others' sum while live unless `peerNoiseBits` is 0". The owner's ruling
     (2026-11-01, `archive:docs/public-log-design.md:266-269`) asked for a precision setting, on by default, so that
     identifying rivals' rules is "possible (but hard)".
   - **v2:** the per-object peer sum is exact (spec §8). `v2/play.ts:216-236` (`othersAt`) also returns the others'
     exact total after up to four candidate moves per read. That lets an agent or human probe rivals' utilities at
     unvisited states. v1 closed exactly this side channel by making the commit clause decide on noisy values
     (`archive:docs/public-log-design.md:296-310`).
   - **Who decided:** the noise went in the integration plan §1.8 ("it read as a bug (ux 2.7)", from AI persona walks)
     and commit `ca8c78768` (PR #412). `othersAt` was "allowed" by the coordinator (`sharing-rules-design.md:104-106`).
   - **Mitigating fact:** the coordinator had already set noise to 0 on v1's beginner setup
     (`archive:docs/judgment-calls.md:64-66`).
   - **Recommendation: ask the owner.** Ask about noise and about `othersAt` together. Until then, treat exact
     counterfactual sums as against the owner's "possible but hard" goal.
3. **Paid observation (paid looks) was deleted, though the owner asked for it.**
   - **v1:** a game setting the owner requested on 2026-11-11: "create more costly uses of God energy, such as charging
     the God for reads" (`archive:.agents/memory/paid-observation.md`). Its default was "free" by a coordinator call.
   - **v2:** human observation is free and exact (integration plan §1.6, §1.8).
   - **Who decided:** the integration plan §1.8 ("paid looks cost attention and sped nobody up", AI walks), then commit
     `0d757edbf`. The memory file was deleted with it.
   - **Recommendation: ask the owner.** The owner's reason (God energy piling up unused) still applies to v2.
4. **The default number domain is integers (`line-z`), though decision 2 says "probably can't go simpler than
   rationals".**
   - **v2:** the default preset is `lines-beginner` on `line-z` (`lib/v2-linear/src/presets.ts:37`,
     `v2/presets.ts:61,76`). `line-q` is an optional preset.
   - **Who decided:** spec §12.6 and integration plan §1.2 chose it, because the exact law exists only for `line-z`
     (`layered-line-rules.md:1566`).
   - **The sessions' own study disagrees:** "line-z cuts the rational ladders short ... and is a poor default"
     (`layered-line-rules.md:849-851`). Decision 12's example, "distance of c from the nearest integer", is always 0 on
     integers.
   - **Recommendation: ask the owner,** with that study attached. The cause is valuation convenience, not the owner's
     wish.
5. **Hold rarity and defence goals were dropped.**
   - **v1:** hold rarity was always on. The owner chose its design: "option A: on demand", m = n − 1
     (`archive:docs/energy-model.md:757, 794`).
   - **v2:** value is stationary-law bits alone (spec §8).
   - **Who decided:** the architect's judgment call, explicitly provisional (owner-decisions.md, last section). The code
     went in commit `ca8c78768`.
   - **Recommendation: ask the owner.** Hold rarity rewarded states that survive the others' mutations, which is the
     decision 24 world of incremental hill climbing. Defence goals were off by default in v1, so dropping them is low
     cost.
6. **Hidden random game ends were dropped. Every v2 game is fixed length (300 s) and its end is public.**
   - **v1:** the code default `durationMode` was "halfLife", a hidden end. Annotated basics was 300 s fixed.
   - **v2:** there is no duration mode (`v2/presets.ts:53`; `ops/rooms.ts:91` allows a `worldSeconds` override only).
   - **Who decided:** silent.
   - **Recommendation: ask the owner** whether the hidden end is wanted. It shapes end-game behaviour (last-second
     grabs).
7. **The fair-aligned dealer was dropped.**
   - **v1:** "Dealing is behind a selector interface: 'fair-aligned' (measured rule synergy) by default"
     (`archive:.agents/memory/code-gods-product.md:137`).
   - **v2:** a seeded shuffle with distinct rules while the pool lasts (`v2/deal.ts:70-90`). Only practice games apply
     a compatibility check (coordinator call (i)).
   - **Who decided:** silent.
   - **Recommendation: restore** a selector behind the same interface once v2 has pair synergy data
     (rule-compatibility.md has it).
8. **Idle parking was dropped.**
   - **v1:** "Park after 30 minutes without human activity", for cost (`archive:code-gods-product.md:107-111`).
   - **v2:** no idle or recovery path in `v2/loop.ts`, `lobby.ts` or `crons.ts` (grep).
   - **Who decided:** silent.
   - **Recommendation: restore.** Nothing in v2 argues against it, and v2 games are short, so it matters less.
9. **The scoreboard interval is a constant, not a setting.**
   - **v1:** `scoreIntervalSeconds`, 1–3600 s, default 10. The owner asked for "every 10s (configurable)".
   - **v2:** `SCOREBOARD_SECONDS = 10` (`v2/loop.ts:20`).
   - **Who decided:** silent.
   - **Recommendation: restore it as a preset or room setting.** The cadence itself (10 s) is kept.
10. **Tiers were dropped.**
    - **v1:** an optional setup, "Tiered rules".
    - **v2:** replaced by two-layer rules.
    - **Who decided:** integration plan §1.8, commit `55ed79ea5`.
    - **Justified:** decisions 12, 14 and 23 define rule layers, and decision 13 rules out gates ("binary decisions are
      worthless"). Nothing to restore.
11. **The commit clause (`only_if_better`) and shelter targeting were dropped.**
    - **v1:** both were options, off by default.
    - **v2:** absent (grep).
    - **Who decided:** silent.
    - **Recommendation: justified for now,** being off by default, but list them in the integration plan as dropped.
      They should not stay silent omissions.
12. **The futility memo was dropped.**
    - **v1:** an agent was not offered an object version on which its deterministic act already failed.
    - **v2:** absent.
    - **Who decided:** integration plan §1.8.
    - **Justified:** it was an efficiency device, and v2's skips are visible.
13. **Birth law and counts changed.**
    - **v1:** births were uniform from the prior; Annotated basics started with 10 objects and spawned 0.1 per second.
    - **v2:** births are draws from the walk's stationary law (spec §2.4, an architect's judgment call); games start
      with 24 objects at 0.1 per second (`v2/presets.ts:53`).
    - **Justified:** decisions 10 and 11 make value the stationary law, so births drawn from it keep "b bits" honest.
      The count is a tuning choice.
14. **Uniqueness no longer refuses a move onto the object's own state.**
    - **v1:** "A transformation onto any existing value (including the object's own) fails entirely".
    - **v2:** a move whose result equals the object's current state is not refused (`holderOf` excludes the object,
      `v2/loop.ts:71-78`); it costs like any change.
    - **Who decided:** silent.
    - **Recommendation: restore the v1 wording, or ask the owner.** It is minor: a no-op move only wastes energy.
15. **Agent limit per player.** v1 allowed 200 agents per player; v2 allows 20 (`v2/play.ts:23`, for read cost).
    - **Justified:** agent count confers no advantage in either engine (selection is proportional to energy), so the
      cap only bounds reads.

Everything else is **kept** or **owner-covered**. The deletion that was asked for in so many words is integer and string
objects (decision 15). Bidding, which the plan first meant to delete, was kept by decision 18.

**The CLAUDE.md "Delete early" bullet.** Its list ("integer and string objects, paid looks, tiers, hold rarity, score
noise, every setup but Annotated basics and its bidding twin") sits under the heading "the owner's standing
instructions". It was written by a session in commit `2c70393ff` (PR #371), from the integration plan's list, with the
summary "follows decision 15". Of the items:

| Item | Asked for by the owner in words? |
|---|---|
| Integer and string objects | Yes (decision 15) |
| Paid looks | No |
| Tiers | No (but covered by decisions 13, 14 and 23 in substance) |
| Hold rarity | No |
| Score noise | No |
| The other setups | No ("anything else ... that we don't need anymore" names none of them) |

The bullet should say which items are the owner's and which are sessions' calls.

---

## 2. The table

Status: **K** kept, **C** changed, **D** dropped, **?** unknown.

### 2.1 Information hiding and disclosure

| # | v1 rule (source; owner's reason) | v2 today (evidence) | St. | Authority |
|---|---|---|---|---|
| 1 | Live, a player sees only their own utility, the sum of the others' and their product, never another god's own bits (`archive:code-gods-product.md:11-15`; "The user explicitly specified aggregate-only opponent information") | Own bits, peer sum and points per object (`v2ObjectValues`, spec §8); no per-player bits for others found | K | — |
| 2 | Every transformation and spawn is public to every player as it happens, without attribution (agent, owner, calls and cost withheld) (`archive:docs/public-log-design.md:3-8, 31-51`; owner 2026-11-01: "all object transformation events to be part of the public log during games (without attribution)") | Only moves that concern the viewer (own, or changed their points) reach them, and each names its mover (`v2/loop.ts:90, 422-432`; `v2/play.ts:155-170`) | C | Discretion: commit `001af4f1a`, silent on the rule. **Restore** |
| 3 | Others' summons and destructions of agents are hidden live; only the agent count is public (`archive:public-log-design.md:43-45`) | `v2Agents` is read per player (`v2/play.ts:104-124`); no live query of others' agents found | K (UNVERIFIED in full) | — |
| 4 | Everyone's public score moves together every `scoreIntervalSeconds` (1–3600, default 10); the own score is live (`archive:code-gods-product.md:23`; owner: "Deity scores should only be updated in unison every 10s (configurable)") | Standings published every 10 world seconds (`v2/loop.ts:20, 442`); own points per object live; not configurable | C | Discretion, silent (the constant). **Restore the setting** |
| 5 | Disclosed others' sums carry Gaussian noise `peerNoiseBits` (0/2/4/8/16, code default 8), keyed by value, shared by viewers; everything built on it follows the noisy value; never an exact others' sum live unless noise is 0 (`archive:public-log-design.md:266-294`; owner's ruling 2026-11-01, "possible (but hard)"). The coordinator set 0 on the beginner setup (`archive:judgment-calls.md:64-66`) | No noise anywhere (spec §8; integration plan §1.6) | D | Discretion: integration plan §1.8 (ux 2.7, AI walks); commit `ca8c78768`. **Ask the owner** |
| 6 | The commit clause decides on disclosed (noisy) values, so probing cannot recover exact others' sums (`archive:public-log-design.md:296-310`) | `othersAt` gives the exact others' total at up to 4 candidate states one move away, per read, unlimited reads (`v2/play.ts:207-236`) | C | Discretion: the coordinator, round 8 (`sharing-rules-design.md:104-106`). **Ask the owner** |
| 7 | Per-object public figures: mutation count, birth time, last change time (`archive:public-log-design.md:53-60`; owner's disclosure decision 2026-11-03, not quoted) | `v2ObjectStates.version`, `changedAt`, `v2Objects.bornAt`, readable by members (`v2/spectate.ts`) | K | — |
| 8 | Paid observation (option): a seated god sees objects as last told; a look costs a full read; activity is free, content paid; default "free" by coordinator (`archive:.agents/memory/paid-observation.md`; owner 2026-11-11: "charging the God for reads ... I would rather keep a principled cost function for reads") | Deleted; human reads free and exact (`v2/reads.ts:1-5`) | D | Discretion: integration plan §1.8, commit `0d757edbf`. **Ask the owner** |
| 9 | Spectators see the public view of a live game, never per-god secrets (`archive:code-gods-product.md:246-250`; owner 2026-11-02) | States only, no rules, scores or values (`v2/spectate.ts:1-4`) | K | — |
| 10 | Ended games are fully transparent: every utility, every agent's code, attribution, exact scores; the replay refuses a live game (`archive:code-gods-product.md:17-21`; owner 2026-11-01: "Replays should be fully transparent with no information hiding at all") | The replay file is built and served only when `phase === "ended"` and holds every event (`v2/replays.ts:2, 28-46`; spec §9.2) | K | — |
| 11 | Nothing visible while the game ran disappears when it ends (`archive:code-gods-product.md:191-195`; owner 2026-10-31) | Ended games are readable (`ended` contexts in affordances); not audited pane by pane | K (UNVERIFIED in full) | — |
| 12 | Rival inference is a legitimate read; aggregate values do not prevent inference (`archive:code-gods-product.md:15, 27`) | No fitting tools in v2 yet; nothing forbids them | ? | Not yet built |
| 13 | Bids sealed; others' bid outcomes hidden live unless the setup's disclosure says so (`archive:.agents/memory/bid-phase.md`) | Ported with `none`/`handicaps`/`all` (integration plan §5.9; `v2/presets.ts:73`) | K | Owner 18 |

### 2.2 Objects, uniqueness, independence, births

| # | v1 rule (source; owner's reason) | v2 today (evidence) | St. | Authority |
|---|---|---|---|---|
| 14 | Every object in a world is unique: a move onto any existing value, the object's own included, fails; spawns redraw (`archive:code-gods-product.md:149-153`; "The user explicitly requires uniqueness") | Restored: a move onto another object's state is refused, births redraw (`v2/loop.ts:393-398`, `v2/world.ts:39-61`, spec §2.6); a move onto its own state is not refused (`holderOf` skips it, `loop.ts:71-78`) | C (minor) | Owner 24 (after the architect's call against it); the own-state difference is silent |
| 15 | Every object is an independent universe: utility depends only on that object's state; a move changes only its target; enforced by an independence test (`archive:code-gods-product.md:29-33`; owner 2026-11-01: "an essential simplifying assumption") | Rules evaluate one state (`lib/v2-core/src/contracts.ts:225`); a move patches only its object (`v2/loop.ts`); no v2 independence test found | K (untested) | — (add the test) |
| 16 | Births: a Poisson process at `spawnRateHz` drawn uniformly from the type's prior; Annotated basics 10 starting objects, 0.1/s; none at or after the end (`archive:engine-api.md:217`; `archive:settings.ts:768-769`) | Seeded birth walk from the stationary law (spec §2.4); 24 starting objects, 0.1 births/s (`v2/presets.ts:41, 53`) | C | Architect's judgment call (births), consistent with owners 10, 11; counts are tuning |
| 17 | Object types integer and string | Deleted | D | **Owner 15** |
| 18 | The grid object (digits, colours, glyphs, playing cards) | Beginner digit grid ported (`lib/v2-grid`, `Grids · beginner`); the other boards deleted | C | Discretion: integration plan §1.8; owner's "linear equations first followed by grids" (integration-plan.md:8-13) covers order, not the deletion |
| 19 | Opportunity targeting: object uniform (default) or "shelter" (`archive:lib/world.ts:195-205`) | Uniform (spec §6.1); no shelter | C | Discretion, silent (shelter was an option, off) |

### 2.3 Scoring and rules

| # | v1 rule (source; owner's reason) | v2 today (evidence) | St. | Authority |
|---|---|---|---|---|
| 20 | Payoff π_i = n_i · max(0, Σ_{j≠i} n_j) per object; total = sum over live objects now; final score = the final board's total (`archive:lib/game-core/src/scoring.ts:51-146`) | Same formula and standings (spec §8; `v2/world.ts:35`) | K | — |
| 21 | Bits are rarity under a calibrated prior (isotonic calibration tables) (`archive:docs/clean-implementation-plan.md:114-120`) | −log2 of the stationary mass of states at least as good (spec §0.5, §7.0) | C | **Owners 4, 10, 19, 20, 22, 23** |
| 22 | Hold rarity, always on: payoff bits include the chance a state survives m = players − 1 random mutations (`archive:docs/energy-model.md:745-796`; owner chose "option A: on demand" and m = n − 1) | Not in v2 (spec §8) | D | Discretion: architect's judgment call (provisional); commit `ca8c78768`. **Ask the owner** |
| 23 | Defence goals (option, off by default): every god dealt one or none (`archive:settings.ts:128-135`) | Not in v2 (spec §8) | D | Discretion: architect's call. Low cost (it was off) |
| 24 | Tiered rules (option): a gated tier added to the ordinal (`archive:docs/tiered-rules.md`) | Replaced by a main layer plus one tie-breaker | C | Discretion (integration plan §1.8), substantively covered by **owners 12, 13, 14, 23** |
| 25 | Every rule offers a continuous landscape of points, no all-or-nothing scores (`archive:code-gods-product.md:252-265`; owner 2026-11-03: "a smooth distribution of points ... of logarithmically increasing difficulty") | Every layer graded, never yes/no (spec §0.3) | K | **Owner 13** restates it |
| 26 | Params are named and typed; colours by name, never an index (`archive:code-gods-product.md:267-279`; owner 2026-11-03: "That's terrible architecture") | Families declare typed params and a dealable grid (`lib/v2-linear/src/presets.ts:12-16`, spec §4.1); not audited family by family | K (UNVERIFIED in full) | — |
| 27 | Params make peer rules of equal opportunity: a family's param values are related by a symmetry, with the same score distribution and top; audited by a test (`archive:code-gods-product.md:281-292`; owner 2026-11-04: "Parameters should create peer variations within a rule family without any unfair asymmetry in scoring opportunity between them") | No equal-opportunity test found in `lib/v2-*` or `artifacts/engine/test`; `layered-line-rules.md` measures ladders "at their best parameter" (e.g. :37, :696), which implies params differ | ? (likely D) | Silent. **Restore the audit** |
| 28 | Scores are points tuples said that way to players: primary then secondary points, never "tie-break" (`archive:code-gods-product.md:294-306`; owner 2026-11-03) | v2 calls the layers "main part, tie-breaker" (integration plan §1.6 goal card; spec §0.3) | C (wording) | Discretion, silent. **Ask the owner** whether "tie-breaker" is acceptable |
| 29 | Utility functions are heterogeneous, simple to state, with a plain-language summary; many unrelated families per type (`archive:code-gods-product.md:137-141`) | Families with a card sentence; beginner pool of 8 line families (`lib/v2-linear/src/presets.ts:30`) | K | **Owner 14** sets the audience |
| 30 | Dealing: "fair-aligned" (best of 32 Divine Lottery deals by measured synergy) by default, Divine Lottery fallback (`archive:code-gods-product.md:137`; `archive:lib/game-utilities/src/selectors.ts:69-167`) | Seeded shuffle, distinct rules while the pool lasts (`v2/deal.ts:70-90`); practice games only: the human is not the odd one out | C | Discretion: silent (fair-aligned); coordinator call (i) (practice). **Restore** |
| 31 | Rule rotation: same players and deal key → rules pass one seat on until each has held each rule; never after won bids (`archive:lib/dealRotation.ts`; coordinator, `archive:judgment-calls.md:126-134`) | Ported (`v2/deal.ts:5-13, 184`); practice games never rotate; a `game.rotation` read shows next game's families per seat (`lib/v2-affordances/src/ops/rooms.ts:76-82`) | K | Coordinator in v1 too |
| 32 | Commit clause `only_if_better` (option, off) (`archive:settings.ts:150-156`) | Absent | D | Discretion, silent. Low cost |
| 33 | Futility memo: a failed deterministic act is not offered the same object version again (`archive:lib/futility.ts`) | Absent | D | Discretion: integration plan §1.8 |

### 2.4 Energy, economy and costs

| # | v1 rule (source; owner's reason) | v2 today (evidence) | St. | Authority |
|---|---|---|---|---|
| 34 | Power P per god per world second (Grid 64), split into agent shares (Σ ≤ 1); the rest feeds the god's store, which pays summons; no accrual in planning (`archive:docs/energy-model.md:469-490`) | Same, P = 64 (`lib/v2-economy/src/energy.ts:2-9`; `settings.ts:22-27`) | K | — |
| 35 | Capacity: an account holds at most power × `fullChargeSeconds` (30) (`archive:energy-model.md:492-507`; owner 2026-11-11: "we need one as a function of power") | Same (`energy.ts:7, 83`) | K | — |
| 36 | Energy and debt move with power; re-allocation loses nothing (coordinator, `archive:judgment-calls.md:102-108`) | Same (`energy.ts:188-198`) | K | Covered by **owner 21** |
| 37 | Debt bound: an account may owe at most its capacity; an agent in debt is not picked (coordinator) | Same (`energy.ts:13-14, 173-181`; `v2/loop.ts:389-391`) | K | — |
| 38 | Selection: one room-wide draw ∝ positive energy; agent count gives no advantage (owner 2026-11-11: "the discrete quantity of agents to offer no opportunity for advantage") | Same (`energy.ts:10-12, 154`) | K | — |
| 39 | Opportunity rate `interactionRateHz` (default 100, Annotated basics 25, max 1000) (`archive:settings.ts:323, 768`); throughput is a cap, never a debt (`archive:code-gods-product.md:113-117`) | 25/s per preset, max 1000; no debt carried (`lib/v2-economy/src/settings.ts:24-28, 52-56`) | K | — |
| 40 | Act charge R/κ + C with κ = 32, C = W + 0.05·W²; skips, collisions and invalid acts pay reads only (`archive:energy-model.md:12-82`) | Same constants (spec §6.1); a refused duplicate pays its reads (`v2/loop.ts:393-397`) | K | — |
| 41 | Every offer is a read of log2(live objects) bits (owner 2026-11-11: "we want it to cost something (though much less than mutation) to get exposure") | Same (`energy.ts:140-146`) | K | — |
| 42 | Read metering: accessors charge the information they carry, once per act (`archive:energy-model.md:117-191`) | Priced queries per representation or element (spec §6.2) | C | **Owner 6** |
| 43 | Change cost: "set-v1", or "distance-v1" on the beginner board, where adding k costs ∝ \|k\| (owner 2026-11-11: "adding a small number to cost less than setting a cell") | Code length plus a confining surcharge; mixed costing, steps for adds and digits for factors (spec §2.5, §5) | C | **Owners 11, 17, 19** |
| 44 | Summon price: AST description length; replace costs a full summon (coordinator) | Token-based price; replacing costs the edit's description length (`lib/v2-agents/src/summon.ts:15-22, 95-104`) | C | **Owner 21** (edits) |
| 45 | Starting energy 600 on grid setups, so the dearest starter is payable in planning (coordinator) | 600 for lines, 900 for grids (`v2/presets.ts:52, 64`) | K | — |
| 46 | First agent's share up to 0.75 (coordinator) | Same target (`energy.ts:49-55`) | K | — |
| 47 | Bid phase and handicap (owner 2026-11-11) | Ported (`lib/v2-economy/src/bidding.ts`; `v2/loop.ts:162-172`) | K | **Owner 18** |

### 2.5 Agents' capabilities and limits

| # | v1 rule (source; owner's reason) | v2 today (evidence) | St. | Authority |
|---|---|---|---|---|
| 48 | Agents are sandboxed Python or TypeScript with no host access; time and randomness only as a virtual clock and seeded stream (`archive:.agents/memory/wasi-determinism.md`; "The user explicitly allowed time and randomness") | `lib/v2-sandbox` (copy of game-runtime plus a host channel, spec §6.5) | K | — |
| 49 | The step budget (500,000) is the deterministic bound; a CPU backstop (`archive:settings.ts:314, 324`) | 500,000 steps and a 64-call host cap (spec §6.1; `lib/v2-sandbox/src/limits.ts`) | K | **Owner 6** ("time capped") |
| 50 | An agent sees only its offered object's metered view, never scores or others' utilities (`archive:clean-implementation-plan.md:23-24`) | `myScore` for its own rule, priced as the reads it needs; never others' scores (spec §6.2) | C | **Owner 6**; spec §6.2 |
| 51 | At most 200 agents per god (`archive:settings.ts:69`) | 20 per player (`v2/play.ts:23`) | C | Discretion (read cost); harmless given #38 |
| 52 | One pause per player per game, 180 s (`archive:game/commands.ts:232-245`) | `pauseUsed` per player (`v2/lobby.ts:275`, `v2/loop.ts:227-231`); length UNVERIFIED | K (UNVERIFIED) | — |
| 53 | Players never wait for sandboxes; planning holds until every language is warm (owner 2026-11-01) | UNVERIFIED (not checked in `v2/runtime.ts`) | ? | — |

### 2.6 Seats, AI, assistants, durations, rooms

| # | v1 rule (source; owner's reason) | v2 today (evidence) | St. | Authority |
|---|---|---|---|---|
| 54 | At least 3 players per game (`archive:code-gods-product.md:41-45`; "The user explicitly added these requirements") | `minPlayers: 3` enforced at start (`v2/presets.ts:53`; `v2/lobby.ts:175, 238`) | K | — |
| 55 | At most 8 players (`archive:owner.ts:192-193`) | No player cap found beyond 16 room members (`v2/access.ts:21`) | C (UNVERIFIED) | Silent. **Restore 8 or ask** |
| 56 | Public chat only, AI included; no private messages (`archive:code-gods-product.md:41-45`) | One room chat table, no recipient field (`v2/tables.ts:77`) | K | — |
| 57 | AI players get the same information and action permissions as humans (`archive:code-gods-product.md:45`) | AI turns go through the affordance directory (`v2/aiTurn.ts`); not audited | K (UNVERIFIED) | **Owner 16** supports it |
| 58 | AI only in rooms owned by an admin; per-game token quotas of 300,000 for AI seats and for assistants; no approvals (`archive:.agents/memory/ai-quotas.md`; owner 2026-11-03) | Same (`v2/spend.ts:11-25`) | K | — |
| 59 | Assistant modes: Autopilot, On request (default), Read-only enforced server-side (`archive:.agents/memory/assistant-modes.md`) | Modes and autopilot ported (`v2/assistantCore.ts:16, 50-58, 90`) | K | — |
| 60 | Assistant state is per (player, game) (owner 2026-11-01) | Per (room, human, game) (`v2/assistant.ts:11`) | K | — |
| 61 | Duration: "halfLife" (hidden random end; code default) or "fixed" (public); Annotated basics 300 s fixed (`archive:lib/game-core/src/game-timer.ts:4-18`; `archive:settings.ts:768`) | Fixed only, 300 s by default, 30–7,200 s override (`v2/presets.ts:53`; `ops/rooms.ts:91`) | C | Discretion, silent. **Ask the owner** |
| 62 | Planning 60 s by default; world time stops (`archive:settings.ts:269, 318`) | 60 s, override 5–900 s (`v2/presets.ts:53`) | K | — |
| 63 | Park running games after 30 minutes without human activity (`archive:code-gods-product.md:107-111`, the owner's affordability reason) | No idle parking found | D | Discretion, silent. **Restore** |
| 64 | Members are players or spectators; the owner is seated on creating a room (owner 2026-11-02; 2026-11-11) | Same (`v2/lobby.ts:49`; integration plan §1.2) | K | — |
| 65 | Practice partners and AI seats always play and never bid (`archive:.agents/memory/bid-phase.md`) | Same (integration plan §5.9) | K | Owner 18 |
| 66 | Setups: a seeded catalogue of complete settings; users may save their own; Lab setups for admins (`archive:code-gods-product.md:185-189`; owner 2026-10-31) | Presets in code plus three overrides; no user-saved setups (integration plan §1.2) | C | Partly **owner 7** (deploys add variants); user setups dropped at discretion ("guess: nobody but the owner saved setups") |

---

## 3. How this was checked

- **Each v2 claim** comes from reading the file and lines cited, at `develop` `e60f0be3`.
- **Each v1 claim** comes from the cited archive file, read with `git show origin/archive/engine-v1:<path>`.
- **The provenance** comes from `git log -S` on the relevant lines, from commits `7359a0f4f`, `f29109c1b`, `2c70393ff`,
  `0d757edbf`, `ca8c78768`, `55ed79ea5` and `001af4f1a`, and from the PR bodies of #357, #360, #371, #379, #412 and
  #417.
- **Not covered:**
  - UI layout and implementation details.
  - Every pane's ended-state behaviour (#11).
  - Sandbox warm-up (#53).
  - Each AI-seat permission (#57).
  - A full search for a v2 player cap (#55).

---

## 4. App: player-facing behaviour (W5, 15 November)

This section compares the v1 client (`archive:artifacts/player-web`) with the v2 app, pane by pane and affordance by
affordance. Hours are app work. **W3** means the item needs a server read or operation first. **Q** means it waits on an
owner question.

**Carried over, checked:**
- paid looks (always paid, keep fresh), noise on others' figures, hidden random end, score interval, idle parking;
- the public log with live anonymity, bidding screens, replay with watch-as;
- the fully transparent ended game: `e2e:ended` walks every pane for lines and grids, on desktop and phone, and closes
  the gap left open in §3 (#11);
- one pause, power share and pull back, "summon when I have the energy", rematch;
- rule gallery, palette, glossary, AI quotas, assistant threads and owner powers;
- chat closing after the end.

| # | v1 behaviour | v2 now | Hours | Needs |
|---|---|---|---|---|
| A1 | Configure page with every setting; saved setups (page/get/save/duplicate/remove) and seeded system setups | Preset picker and three overrides | 6–8 | W3 (tables, ops); see §2 #66 |
| A2 | Rival-inference assistant tools (fit_utility_mixture, list_utility_candidates, get_utility_series, get_board_at); "Possible gods" list | Absent | 3 | W3 (reads) |
| A3 | Objects sorts: payoff, bits, others, mutations, newest, oldest, recently mutated. Filters: all, positive, contested | Sorts: points, rarity, recent | 3 | W3 (indexed fields) |
| A4 | Feed filters (who, object, minimum impact); group by mutator, "cost against yield" | **Restored** (#875) | — | — |
| A5 | Goal card: "How rare is each rule score?" table; editable, randomisable example | Fixed example | 3 | Q: check that the rarity table doesn't point at peaks |
| A6 | My agents: sparkline, "Edit a copy", version comparison, "How energy works" | **Restored** except the sparkline (#876) | 1 | W3 (energy history from the tick) |
| A7 | Replay: keyboard shortcuts, speeds ¼–64×, deep links (?e ?t &as), copy a moment link, download | **Restored** (#878; links are ?replay&t&as) | — | — |
| A8 | Owner "Cancel bidding" | Absent | 1 | W3 (op) |
| A9 | Phone assistant bottom sheet; pane maximise | Maximise **restored** (desktop, this screen only); bottom sheet absent | 2 | — |
| A10 | Chat filters: Humans, AI, Mentions | **Restored** in the game's chat (#881) | — | — |
| A11 | Grid as coloured tiles (a per-viewer renderer choice) | Covered by the owner: "We eliminated colour from the beginner grid game to increase concentration of interest within one dimension." (owner decision 5) | — | — |
| A12 | "Copy game rules for an AI"; "Connect a player app" sheet | **Restored**: How to play copies the rules and the agent primer; connecting is the /connect page | — | — |
| A13 | Header: overdrawn warning, retry-uncertain banner | Absent | 1 | W3 (check the field) |
| A14 | "Who am I" and "Server info" sheets | Absent | 1 | — |
| A15 | run_code tool and Code results pane | Absent | 2 | W3 (sandbox op); Q (wanted?) |
| A16 | Hold rarity; score-noise variants; other deleted setups | Deleted | — | Q, already open in §1 |

**Order of restoration.** Items with no server need and no open question come first, largest effect on play first: A4,
A6, A7 (without download), A10, A11, A9, A12, A14. Each operation among them goes through `lib/v2-affordances`.

---

## 5. Mechanical parity inventory of the old app (W5, 15–16 November)

`docs/engine-v2/v1-parity.json` lists every component, pane, page, palette command, keyboard shortcut, room setting
and e2e scenario of archive/engine-v1's player app, one row each, with its status in v2: present (with the v2 file),
missing, or changed (with the decision and its source). `artifacts/player-web/test/v1-parity.test.ts` fails when a
row is missing or changed with neither a named reason nor a plan, so a gap cannot be silent. Restoring an item sets
its row present; rows are never deleted.

The statuses come from searching the v2 tree for each item's words, test ids, titles and affordances, not from
running the app.

| | Rows | Present | Changed | Missing |
|---|---|---|---|---|
| All | 468 | 264 | 102 | 102 |
| component | 130 | 76 | 30 | 24 |
| e2e | 120 | 50 | 24 | 46 |
| command | 118 | 89 | 21 | 8 |
| setting | 40 | 9 | 16 | 15 |
| shortcut | 28 | 13 | 8 | 7 |
| pane | 17 | 15 | 1 | 1 |
| page | 15 | 12 | 2 | 1 |

- **Missing:** about 81 hours to port, 31 of them old e2e scenarios. 27 missing rows need something from a server session first (the `server` field).
- **Changed without a written decision ("changed?"):** 66 rows, about 27 hours if each is ported back rather than accepted. Each needs a look: some will turn out to be missing.

## 6. Grid annotations against v1 (grid-annotations session, 15 November)

v1's grid annotations at the archive tip ("scoring units", `lib/game-utilities/src/explain/*`, drawn by
`lib/object-views/src/explain/GoalBoard.tsx`; design `docs/annotations-design.md` on `archive/engine-v1`) against v2
grids on `develop` a907a8b7. v2 draws marks a rule family records (`ctx.mark`: focus, note, measure, candidate) on the
family's own representation (`lib/v2-views/src/render/grid.tsx`), with a card per part of the rule beside it
(`faces.tsx`). Measured: every dealt (family, secondary) pair in the three grid presets, 10 boards each
(`lib/v2-views/test/` probe, not kept).

| # | v1 capability (what the player saw) | v1 source | v2 today | Status |
|---|---|---|---|---|
| G1 | **The board marks what the rule counts.** Each scoring unit (cell, pair, row/column line, 2×2 block, 3×3 window, region, ring) is outlined or drawn as a capsule through its cells; pairs joined by an arc, solid ✓ when it scores, dashed ✗ when not | `GoalBoard.tsx:247-273`, `layout.ts` | Each family's main part marks its representation (row gaps/totals/bends, box/window/pair groups), each unit's note says its working, ✓ when on target ("✓ 9+1+1+7 = 18", "✓ two 7s and two 0s"); focus carries ● / ◆ / ▲ (#982, #956) | present (outlines/capsules per unit are v2's group drawing) |
| G2 | **Secondary preferences marked.** Facts grouped by tier under "primary/secondary rule score" sub-headers; tier units on the board (★ lines, squares …) | `GoalBoard.tsx:96-111`, `tier-lenses.ts` | Was: no dealt secondary marked anything (0 of 54). Now (#915, claude/grid-secondary-marks): a mark names its layer (`term`); every dealt secondary of the three grid presets marks what it counts (focus) or how far a unit is off (a note), checked by `lib/v2-grid/test/marks.test.ts`; an undealt secondary's marks are shown to nobody | **present** |
| G3 | **Which cells break a unit.** Mirrormancer: a link per mirror pair ("first and last: 3, 3" ✓/✗); Magic Eighteen: "4+5+2+2 = 13, not 18" and "18 − 13 = 5 short"; Minesweeper/Kings: spots on the king | lenses in `explain/lenses/*` | Notes name what breaks a unit: Mirrormancer's mismatched pairs ("off by 5: 2 vs 0, 0 vs 3", #971), Magic Eighteen's sum, Two Pair's pairing, Opposite Nines' distance from 9, Strangers' failing pair and why (#982, #993) | present for the beginner pool's units; more-rules main parts say their unit only |
| G4 | **Unit list linked to the board both ways**: a scrollable list of units (gains first) with mini tiles, the points, ✓/✗ facts; selecting on either side lights the other, with an arrow between | `GoalBoard.tsx:73-186, 274-295` | A note per unit under the board, each pointing at its element: pointing at it or reaching it with Tab picks the unit out on the board (#962); the part's card lists its own units only (#982); no mini tiles | partial (no list of units with mini tiles) |
| G5 | **Selection**: hover/tap a unit on the board (nearest-unit hit test), arrow keys step through units, others dimmed to 0.32, an aria-live line reads the unit | `GoalBoard.tsx:143-207`, `units.ts:64` | Marked elements are Tab stops; pointing or focusing picks a unit out and dims the other cells to 0.32 (#962); tap a part to keep only its marks | present except arrow-key stepping on one stop |
| G6 | "Point at: Row / Column" mode toggle when unit kinds overlap | `GoalBoard.tsx:237-245` | Replaced by representations ("More views") | changed (by design: representations replace modes) |
| G7 | Board total: "This board's rule score: (5, −3) — primary … · secondary …"; ★ tier notes ("2 more opposite pairs to open ★"), "Nothing on this board counts towards this goal yet." | `GoalBoard.tsx:212-235` | Part cards with value, sense and ruler (a bounded count's ruler ends at its ceiling, #1031); "Secondary preference" at any depth (#910, #952) | present |
| G8 | Goal card worked example (searched board that shows scoring and non-scoring units), caption "Point at a scoring unit …" | `card.tsx:62-71`, `explain/index.ts:223-303` | GoalCard with a worked example, randomise/edit, rarity scale (#901) | present; inherits G1–G3 gaps |
| G9 | Object popover: hover opens, click pins, Close for phones, full annotated board, changed cells outlined | `object-views/src/views.tsx:190-275` | Object pane (`panes/object.tsx`) with ExpandedFace, compare-with, "was" digit on changed cells | present (changed: a pane, not a popover) |
| G10 | "How this scores": breakdown, rarity, bits, net bits | `HowThisScores.tsx` | "How it was worked out", bits line, "What would make it rarer"; the object pane says "rarer than N of 1,000 random grids" (#1006) and "Opened from: <the move>" (#1041) | present |
| G11 | Marks never by colour alone: solid/dashed/dotted per tone, ✓/✗/· glyphs, ± signs | `layout.ts:22-24` | A focused cell or total carries its part's glyph (● main part, ◆ secondary) beside the tint; each note under the board starts with its part's glyph; notes are words | present |
| G12 | Disclosure: own goal only while live; replay follows the point-of-view god | `explain/context.tsx:1-5` | Own rule only (`panes/object.tsx`, `objects.tsx`) | present |
| G13 | Layers of any depth | tuple of tiers | Every dealt preference is a part at any depth (#952); glyphs follow depth (● ◆ ▲ ■) | present |
| G14 | Gallery shows dealt rules | `gallery/annotations.tsx` | Grid gallery shows the dealt secondaries, one per example board | present (fixed) |

Plan (porting, most visible first): (1) let a mark name the layer it belongs to and have every dealt grid secondary mark
what it reads (G2, with the annotations and grids sessions); (2) mark the cells or pairs that break a unit, with a
non-colour cue, per v1's lenses (G1, G3, G11); (3) a unit readout linked both ways with keyboard stepping (G4, G5);
(4) the gallery deals real rules (G14). Layers of any depth and "Secondary:" in the views (G13, G7) are the shared
layer's.
