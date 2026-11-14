# Engine v2: the server's API (W3)

Status: W3-1, the contract the app (W5) builds against ([integration-plan.md](integration-plan.md) §2.2, §4, §5.1).
Code: `artifacts/engine/convex/v2/`.

## What is where

| Piece | File | Notes |
|---|---|---|
| Tables | `convex/v2/tables.ts` | spread into `convex/schema.ts`; players are `v2Members` rows (human, practice, ai), so game tables key by `memberId` |
| Live queries (subscriptions) | `rooms.ts`, `games.ts`, `play.ts`, `spectate.ts`, `layout.ts`, `replays.ts`, `bids.ts` | each declares `returns:` from `validators.ts`; app types come from the generated api (`FunctionReturnType<typeof api.v2.play.object>`) |
| Operations | `ops/<namespace>.ts` | one `defineOp` per server affordance of `lib/v2-affordances` (`v2/ops/<ns>:<verb>` and its twin `<verb>As`); unbuilt ones answer `{ok: false, error: {code: "failed", message: "Not built yet: … W3-x"}}` |
| Caller and context | `access.ts`, `ops/define.ts` | sign-in everywhere; the affordance context is derived from v2's own rows; a credential bound to a room acts there only |
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
| `v2/play:myRule`, `me`, `agents`, `digest` | `gameId` | seated |
| `v2/play:objectIds` | `gameId, sort (points, rarity, want, born, recent), paginationOpts` | seated |
| `v2/play:object` | `objectId` | member; `value` is the caller's own, null for a spectator |
| `v2/play:agentEnergy`, `agentPrograms` | `agentId` | the agent's owner |
| `v2/play:moves` | `gameId, paginationOpts` | seated |
| `v2/spectate:objectIds`, `object` | as above | member; states only |
| `v2/layout:current` | `roomId` | member |
| `v2/replays:stored` | `gameId` | member |
| `v2/bids:state` | `roomId` | member; the caller's own sealed bids only |

Values: `rarityBits` is the player's n_i, `want` is Σ_{j≠i} n_j and `points` = n_i · want (spec §8). States travel as
the object type's wire (`line-z`: `a,b,c` per line, `;` between lines). Scores are `(string | null)[] | null`.

## Running it

`pnpm --filter @workspace/engine dev` (wait for `[dev] READY`), then `pnpm --filter @workspace/engine test:v2`.
