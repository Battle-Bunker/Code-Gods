# Replays

A player can open any game of a room they were seated in and replay it, tick by tick, seeing exactly what they could
see while it ran. This document records how the engine makes that possible (§1–§3: the event log, its schema and the
replay API) and how the player client presents it (§4 onwards: the replay view).

Status: §1–§3 shipped with the event-log completeness change; the view is designed in §4 onwards.

## 1. Re-simulate or play back?

**Decision: play back recorded outcomes. Never re-run an agent, a sampler or a scorer to replay a game.**

Re-simulation would need, for every tick, the exact inputs to every nondeterministic step, and the same code:

- **Opportunity scheduling is drawn from a CSPRNG** (`engine/tick.ts`: the opportunity count's stochastic rounding,
  the target object, the eligible agent). Recording those draws is possible, but every one of them would have to be
  logged, and the log would then be a recording of outcomes anyway.
- **Act seeds are salted with the season salt** (`deriveSeed(salt, ["play", gameId, agentId, actIndex])`), a secret
  that never leaves the engine. A replay that re-ran agents would either need the salt (and could then be used to
  predict a live game's acts) or could not reproduce randomized agents.
- **The sandboxes and the scorers change.** CPython WASI and QuickJS bundles are pinned by hash, but they are upgraded;
  utility families and calibration tables are regenerated (`pnpm --filter @workspace/game-utilities calibrate`); the
  mutator preludes evolve. A re-simulated replay of last month's game under this month's code is a different game.
- **Spawns redraw on collisions, and the 2,000-object limit and the 4 s simulate budget drop opportunities.** These
  are host-dependent (wall clock) and cannot be reproduced.
- **Agents are deleted when destroyed**, so their sources would be gone.

Playing back outcomes is robust to every code change: each spawn's value, each transformation's result and calls, each
act's charge, each object's per-god net bits after the event, and each summon's agent record are already facts in the
log. A replay is a fold over those facts. The only code a replay runs is pure arithmetic of game-core (the agent energy
account: `settleAgentEnergy`, `chargeAct`), whose formula is part of the game's rules; if it ever changes, the rules
version (`scoring: "information-v1"`) changes with it.

## 2. What a perfect replay needs, and where it is

Working from what the state of a game is (`games`, `deities`, `objects`, `agents`, `tickBatches`, `chat`) and every
mutation that changes it:

| State | Changed by | In the log as | Before this change |
|---|---|---|---|
| Settings, instance, roster (with AI seats), start time, planning deadline, setup | `game/lobby.ts commitStart` (frozen for the game: settings and seats cannot change while a game is live) | the game document's fixed header | present |
| Initial objects | `commitStart` | batch 0: `phase planning` + one `spawn` per object at world 0 | present |
| Spawns (values, with their random draws resolved) | `engine/tick.ts` | `spawn {objectId, value, version, world, net[]}` | present |
| Transformations | `engine/tick.ts` | `transform {objectId, before, value, version, world, agentId, ownerId, calls, cost, net[]}` | present |
| Failed acts (charged, object unchanged) | `engine/tick.ts` | `fail {objectId, world, agentId, ownerId, reason, cost}` | present |
| Agent summons: source, language, price, act cost, energy account, owner | `game/commands.ts` summon | **`summon {agentId, ownerId, world, language, source, summonCost, decisionBits, expectedActCost, perActFloorBits, breakdown, randomized, account}`** | **missing** (the agent row was the only record, deleted on destroy) |
| Agent destruction | `game/commands.ts` destroy | **`destroy {agentId, ownerId, world}`** | **missing** |
| Agent energy accounts | every act | derived: `account = chargeAct(settle(account, world), cost.total)` per act, from the summon's account | derivable once summons are logged |
| God energy | summons (price) and wall time | derived: `startingEnergy + (wall − startedAt)·energyPerSecond − Σ own summon prices`, frozen at `endedAt`; wall time is each batch's `at` | derivable once summons are logged |
| Object scores (every god's net bits) | spawns, transforms | `net[]` on each spawn and transform, roster order | present |
| Leaderboard | any score change | **`totals[]` on each batch that changed scores**: every god's total payoff after the batch, roster order | **missing** (only the end summary had it) |
| Phases: planning, running, paused (by whom), recovery (why), resumed, ended (why) | loop, commands, owner | `phase {phase, world, reason}` | present |
| Public chat | `game/commands.ts` chat | the `chat` row, **stamped with `gameId` and `world` when sent during a live game** | **missing the world time** (wall timestamp only) |
| Players joining or leaving | `rooms.join`, `rooms.leave` | nothing: the roster is fixed at the start, seated gods cannot leave a live game, joiners spectate | not game state |
| Calibration tables | start (tables computed or shipped) | nothing needed: scores are recorded as net bits, so a replay never consults a table | not needed |
| Settings changes mid-game | refused | nothing | not possible |

Notes on the choices:

- **Chat stays in the `chat` table** rather than becoming a log event. It belongs to the room (it stays open after
  the end), it is rate-limited per author but not per game, and writing one `tickBatches` doc per message would
  fragment the log and push transformations out of the observation's recent-batches window (`lib/load.ts`,
  `RECENT_BATCHES`). A message sent while a game is live (planning to recovery) carries that game's id and its world
  time; the replay API merges them. Messages from before the stamp are placed by wall time against the batches.
- **Totals instead of per-object payoffs.** Each god's total payoff after a batch is exactly what the live leaderboard
  showed after that commit, so it discloses nothing new. Per-object payoffs of other gods would. As with the live
  leaderboard, a batch holding a single transformation lets a careful reader difference the totals; this is the same
  inference the live game allows, and aggregates are not claimed to prevent it.
- **Order.** Events apply in (batch `seq`, index) order, the order the engine committed them. A summon or a pause is
  committed by its own mutation while a tick may be simulating, so its world time can be a little later than the
  first events of the next tick's batch. The reducer seeks by the running maximum of world time.
- **Discarded windows** never reach the log (a discarded commit writes nothing), so the log and the state cannot
  disagree.

**Schema.** Every `tickBatches` doc carries `schema` (`EVENT_LOG_SCHEMA` in `convex/lib/world.ts`, now 2). Version 2
added `summon`, `destroy`, `totals` and the chat stamps. A batch without `schema` predates them: a replay of such a
game has no agent lifetimes, no leaderboard curve, and chat placed by wall time; the replay view says so. Bump the
schema whenever an event's fields or meaning change, and keep the reducer reading every schema it has seen.

**Storage.** The new events are small and rare: a summon is about 400 bytes plus its source (summons are capped by
`maxAgentsPerGod`), a destroy about 120 bytes, `totals` 8 bytes per god per tick batch. The log's size is still
dominated by transformations, about 350 bytes each (ids, values, calls, a six-field charge and one net value per god).
A game's act rate is bounded by agent energy, not by the interaction cap: with the default 2 bits/s of agent income
and acts costing tens of bits, a six-god game runs a few acts per second, about 1 KB/s of log, so a 600 s game is
about 1 MB. A game held at the 100 Hz cap with rich agents writes about 35 KB/s, 20 MB for 10 minutes; that is still
within Convex's limits (batches stay under 400 events, about 140 KB per doc). Compression is not needed yet; if it
becomes so, the place is `appendEvents` (column-packing the `transform` events of a batch), behind a schema bump.

**Test.** `artifacts/engine/test/game-replay.test.ts` plays a game with summons, chat in planning and while running,
a destroy, a pause and an owner end; captures the engine's raw state at four moments; and for each of the three
seated gods rebuilds, from that god's `player.replay` pages cut at the snapshot's last batch, every object (value,
version, own bits, peer aggregate, payoff), every own agent (acts, spending, energy account; destroyed ones as
destroyed), the god's summon spending, the phase and every god's total. Union over the gods, that is every agent and
every score in the game. The reducer's own rules are unit-tested in `lib/player-client/test/replay.test.ts`.

## 3. The replay API (public, for every client)

`player.replay({ roomId, gameId, afterSeq?, limit? })`, a Convex query. Third-party clients call it like any other
public function (docs/engine-api.md); the reference reducer is `@workspace/player-client/replay`.

- **Who:** a player seated in that game (its roster). Other room members, spectators of the game included, get
  `FORBIDDEN`; non-members get the room's usual refusal.
- **Paging:** pages of up to `limit` batches (default and maximum 100), stopping early past 4,000 events (the query
  reads batch by batch, so it never reads more than it returns). Start with neither cursor; continue with
  `afterSeq: nextCursor, chatAfter: chatCursor` until `done` (the game has ended and the page reaches the end of its
  log). A live game's replay is never done: poll with the last cursors, as with `player.events`.
- **Result:**
  - `version`: the replay API version (1). The reducer refuses a version it does not know.
  - `game`: id, short code, phase, `startedAt`, `planningEndsAt`, `endedAt`, `endReason`, `worldSeconds`, settings,
    setup, roster (`{id, name, kind}`), object instance, season commitment; on the first page `logSchema` (the log's
    schema) and `currentLogSchema`.
  - `self`: the caller's god id, roster index and own utility card.
  - `batches`: `{seq, at, worldFrom, worldTo, totals?, events}`. Events are the caller's projection, the same as
    `player.events`, plus `agent.summoned` and `agent.destroyed`.
  - `chat`: the game's messages after `chatAfter` up to the page's last batch (to the end on the last page), at most
    500, each with `worldSeconds` when stamped. Chat never runs ahead of the page's events, so a live replay picks up
    new messages as its log grows.
  - `nextCursor`, `chatCursor`, `latestCursor`, `done`.
- **Mixed logs.** `logSchema` is the first batch's schema. A game that was live during the deploy of schema 2 reports
  1: its replay lacks the agents summoned before the deploy (the caller's own still appear, from their acts, without
  a source) and its leaderboard curve starts at the deploy.

**Disclosure (the contract, tested in `test/game-disclosure.test.ts` and `test/game-replay.test.ts`).** A replay shows
only what the player was entitled to see while the game ran:

- per object: the value, its version, the player's own net bits, the peers' sum (`peerNetBits`), their care and the
  player's payoff; never another god's per-object bits or descriptor;
- the player's own utility card; never another god's;
- every agent's appearance (`agent.summoned`, `mine`) and disappearance, because the live agent count and the agent
  ids in transformations already showed them; never another god's agent source, language, price, account, calls,
  charges or failures, and never which god owns another agent;
- the public leaderboard totals, phases with their reasons, and public chat;
- never seeds, the season salt, AI prompts or `endAtWorld`.

Agent sources stay private to their owner after the game ends, as in the frozen end state (PR #47).
