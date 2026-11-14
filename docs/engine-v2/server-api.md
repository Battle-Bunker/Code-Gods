# Engine v2: the server's API (W3)

Status: W3-1 to W3-4 (milestone M1): the contract the app (W5) builds against, and the server behind it ([integration-plan.md](integration-plan.md) §2.2, §4, §5.1).
Code: `artifacts/engine/convex/v2/`.

## What is where

| Piece | File | Notes |
|---|---|---|
| Tables | `convex/v2/tables.ts` | spread into `convex/schema.ts`; players are `v2Members` rows (human, practice, ai), so game tables key by `memberId` |
| Live queries (subscriptions) | `rooms.ts`, `games.ts`, `play.ts`, `spectate.ts`, `layout.ts`, `replays.ts`, `bids.ts` | each declares `returns:` from `validators.ts`; app types come from the generated api (`FunctionReturnType<typeof api.v2.play.object>`) |
| Operations | `ops/<namespace>.ts` | one `defineOp` per server affordance of `lib/v2-affordances` (`v2/ops/<ns>:<verb>` and its twin `<verb>As`); every one is built. A domain failure is `{ok: false, error: {code: "failed", message, fix?}}` (a mutation throws it as a ConvexError whose data is the outcome) |
| Caller and context | `access.ts`, `ops/define.ts` | sign-in everywhere; the affordance context is derived from v2's own rows; a credential bound to a room acts there only |
| Lobby and deal | `lobby.ts`, `deal.ts` | only rules with a value function are dealt (decision 23); rotation as v1, keyed by rule key |
| Loop | `loop.ts` (world start, commit, scoreboard, pause, resume, end, watchdog), `tick.ts` (Node: births, offers, `runAct`) | one lease per live game; the commit owns every write. Each act is told its owner's value on the offered line, the last 8 moves on it that concerned them (`v2ObjectValues.recent`, written by the commit; `actInputs` reads one row a player and line, in parallel batches) and their rule's value function (`values`: knots and tail, by the seat's ruleKey); the first two are recorded in the act event (replay re-derives `values` from the bundle), and agents' notes land in the act event and on the mover's `v2Moves` row (`notes`) |
| Agents and energy | `agents.ts`, `commands.ts`, `checkNode.ts`, `runtime.ts` (Node: inline sandboxes) | lib/v2-economy accounts: energy moves with power. `power.allocate` takes absolute shares (each a fraction of the player's power, ≤ 1 in all); what no agent holds feeds the own store. An agent's `offer.object` is the line's `number`, the one objects.list, moves.list, object.score and the app show |
| Values | `world.ts`, `values.ts` (+ `values.gen.ts`, `scripts/gen-v2-values.mjs`), `reads.ts` | decision 23: a score is the rule's utility (plain lexicographic, no levels); n_i = its worth in bits from the rule's value function (`valueLookup`); π_i = n_i · Σ_{j≠i} n_j; human reads through the agents' own EngineHost. |
| Model calls | `ai.ts` (provider, `spendWithin`), `spend.ts` (who may spend how much), `perform.ts` (a delegate's affordance call) | AI only in rooms an administrator owns; the owner's per-game token quotas (`room.aiQuotas`: AI players together, each player's assistant; 0 = off); USD ceilings per game and per UTC day; call-rate limits. AI_MOCK=1 uses lib/v2-ai's offline mock |
| AI players | `aiTurn.ts` | a turn every 20 s as `member:<id>`, ≤ 30 turns a game; each turn's message ends with its deals ledger (`deals`: the game's chat in world seconds, moves that lowered a player, its agents' programs → lib/v2-ai `commitmentBriefing`) |
| In-client assistant | `assistant.ts` (the pane's reads), `assistantCore.ts` (queue, turns, autopilot), `assistantRun.ts` (one action per turn), `assistantTables.ts` | acts as the human's delegate (`via: "assistant"`, their chosen grant, lowered to a passing connection's); read-only mode offers read tools only; never its own `assistant.*` |
| Stored panels | `panels.ts` (the app's reads), `panelStore.ts`, `panelCompile.ts` (Node), `panelShapes.ts`, `ops/panel.ts` | per human across rooms, `sdk: 2` |
| Page-query modules | `rooms`, `games`, `play`, `spectate`, `layout`, `replays`, `bids`, `assistant`, `panels` | keep them light: a module that loads `@workspace/v2-affordances`' index, the lobby or a model package costs a page query about 30 ms (measured: 38–43 ms against 7–13 ms), so writes and helpers that throw `OpFailure` live in a sibling module |
| Fixtures | `testing.ts` (TEST_FIXTURES=1 only) | `seedUser`, `seedRoom`, `seedGame` (a live line game with rules, values, agents, moves, standings), `memberFor`, `setBidding` |
| Presets | `presets.ts` | a stand-in until W1-5's `lib/v2-linear/presets.ts` |
| R8 rows | `test/v2-query-budgets.ts` | every live query, `pending` until M1's `v2-query-cost.test.ts` measures them |

## Live queries

| Query | Args | Who |
|---|---|---|
| `v2/rooms:list` | `paginationOpts` | signed in: the caller's memberships (skeleton; rows subscribe to `get`) |
| `v2/rooms:get` | `roomId` | member: room, ≤ 16 members (`me` marks the caller), current and last game, open bid phase |
| `v2/rooms:chat`, `v2/rooms:history` | `roomId, paginationOpts` | member |
| `v2/games:header`, `standings` | `gameId` | member; `header.me` is the caller's seat or null |
| `v2/games:standingsHistory` | `gameId, after` | member; ≤ 100 rows after `after` |
| `v2/play:myRule`, `me`, `agents`, `digest` | `gameId` | seated; `myRule.value` is the rule's value function (`{knots, tail}`, what `valueLookup` takes); `me` adds `ownPerSecond`, `capacity` (the store stops at it) and `settledAt` (world s) |
| `v2/play:objectIds` | `gameId, sort (points, rarity, want, born, recent), paginationOpts` | seated |
| `v2/play:object` | `objectId` | member; `value` is the caller's own, null for a spectator |
| `v2/play:agentEnergy`, `agentPrograms` | `agentId` | the agent's owner |
| `v2/play:moves` | `gameId, paginationOpts` | seated; every row's `by` names the mover; `charge` and `notes` (what their agent noted for them) only on the caller's own moves |
| `v2/spectate:objectIds`, `object` | as above | member; states only |
| `v2/layout:current` | `roomId` | member |
| `v2/replays:stored` | `gameId` | member |
| `v2/bids:state` | `roomId` | member; the caller's own sealed bids only |
| `v2/assistant:status`, `threads` | `roomId` (+ `gameId?`) | member: the caller's mode, grant, allowance, latest turn, waiting messages; their threads of a game |
| `v2/assistant:transcript` | `threadId, paginationOpts` (≤ 30) | the thread's human: messages newest first |
| `v2/assistant:turn` | `turnId` | the turn's human: outcome and tool calls (activity chips) |
| `v2/panels:list`, `code` | `{}`, `slug, version?` | signed in: the caller's own panels |
| `v2/rooms:aiQuotas` | `roomId` | member: the owner's per-game token quotas `{ai, assistant}` |
| `v2/connect:pending` | `request` (the /connect key) | signed in: the OAuth request's client, grant, status, expiry, hinted room and the caller's v2 rooms; decided by `account.approveConnection` / `account.denyConnection` |
| `v2/setups:presets` | `{}` | signed in: the deployed presets (the setup picker); `room.create`/`room.settings` refuse any other id |
| `v2/gallery:family` | `preset, family` | signed in: the family's dealable rules with card, layers and value curve (`points`: each knot's score and bits) |

Values: `rarityBits` is the player's n_i, `want` is Σ_{j≠i} n_j and `points` = n_i · want (spec §8). States travel as
the object type's wire (`line-z`: `a,b,c` per line, `;` between lines). Scores are `(string | null)[] | null`.

## The record (spec §9)

`v2Events`, dense `seq` from 0: `gameStarted` (players and their dealt rules), `command` (summon, replace, putBack,
destroy, allocate), `phase`, `objectBorn`, `values` (per player utility and bits), `act` (the act record with its
seed, energy, offered object, program version), `tick` (standings), `gameEnded`. Folding `values` gives the standings;
every `act` re-executes from its own fields (test/v2-game.test.ts).

## Running it

`pnpm --filter @workspace/engine dev` (wait for `[dev] READY`), then `pnpm --filter @workspace/engine test:v2`.
Suites: `v2-contract`, `v2-lobby`, `v2-play`, `v2-game` (M1's acceptance and replay), `v2-disclosure`,
`v2-query-cost` (R8 at 1,000 objects); unit: `test/unit/v2-*.test.ts`.

## Known limits (M1)

- Agents run inline in the Node action (no worker thread in a Convex bundle): QuickJS keeps its time cap; a single long
  native Python step runs until the action's limit, and the watchdog then restarts the chain.
- `v2/play:digest` grows with objects (30 KiB at 1,000 with three players; 64 KiB near 2,300).
- R8's cold check (a cold query survives tick commits) is not yet run.
