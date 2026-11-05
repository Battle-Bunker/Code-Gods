# Reading data from Convex: research, principles and the redesign plan

Status: research and design (2026-11-02). Nothing here is implemented yet. The principles in §3 are already the rule
for new code (CLAUDE.md "Reading data from Convex"; `.agents/memory/convex-reads.md`).

**Why this document exists.** Every page of the app reads the whole world through one giant query. The engine's tick
writes the `games` doc about once a second, and every one of those queries reads that doc. So every page query re-runs
for every viewer about once a second, and each run reads 1,000–2,000 documents. In the site smoke test,
`games.view` hit Convex's 1-second limit. The previous session then added client-side retries and throttles to hide
it. The owner asked for a deep repair, and for principles that stop it from happening again:

> "You should never be doing one giant integrated query for everything in Convex. Use nested queries that sync the
> properties needed to render one component at a time and have those components register subscriptions for any
> subsidiary components. The most common pattern will be one query for a paginated collection skeleton and another for
> each individual item within it, run by the component that renders each item and discarded whenever that component
> gets torn down by the framework."

**Contents**

1. The evidence: what is wrong, measured
2. Does the owner's pattern fit Convex's guidance? (research, with sources)
3. Principles for this codebase (the enforceable rules)
4. The redesign, by component
5. Schema changes (widen → migrate → narrow)
6. PR sequence
7. Sources

---

## 1. The evidence

### 1.1 Measured query cost

The probe is `artifacts/engine/test/probe-query-times.ts`, on branch `perf/world-chunks`. It ran a real 3-player
game with 1,000 objects on the local backend. Server-side figures come from `npx convex logs --jsonl`: user
execution time and documents/bytes read, with cache hits excluded. Medians under parallel load:

| Query | Median | Read per run |
|---|---|---|
| `player:board` | 166 ms | 2,030 docs, 1.2 MiB (all objects, then the latest event per object) |
| `player:observation` | 134 ms | 1,034 docs, 808 KiB |
| `player:game` | 97 ms | 1,020 docs |
| `games:view` | 90 ms | 1,018 docs, 643 KiB |
| `player:objectsPage` | 89 ms | reads and personalises every object to return one page |
| `player:series` | 71 ms | 1,006 docs |
| `player:events` / `history` / `trajectories` | 75–85 ms | about 20 docs, but about 195 KiB (10 KiB `tickBatches`) |

On an idle backend, run one at a time:

| Query | Time |
|---|---|
| empty query | about 11 ms |
| `take(64)` objects | 13 ms |
| `take(1000)` | 33 ms |

Under concurrency everything inflates about 4×.

### 1.2 Why every query re-runs every second

These findings come from an audit of `convex/engine/loop.ts`, `convex/engine/tick.ts`, `convex/game/tables.ts` and
every public query.

**What the tick writes.**
- The tick patches **only the objects that changed**: a successful transform, about 5–10% of the world per tick at
  the default `interactionRateHz: 100`.
- It patches the **`games` doc on every commit**, about once every 1.05–1.1 s, even with zero acts. The patch
  covers `worldSeconds`, `lastTick`, `nextSpawn`, `nextBatch`, `objectCount`, `stats`, the `tick` lease, and the
  `scoreboard` every 10 world-seconds (loop.ts:265-281).

**Who reads the `games` doc.**
- Every live query reads it, including queries that need only its cold fields:
  - `rooms.get` (phase and short code of the active game);
  - `layout.current` (only `phase`);
  - `player.myUtility` (only settings);
  - `rooms.history` and `rooms.list`;
  - `games.resolve`.
- **All of them re-run every second for every viewer, though nothing they show has changed.**

**Who reads every object.**
- Every query that shows objects (`observation`, `game`, `games.view`, `objectsPage`, `board`) reads **all**
  objects with `take(2100)`.
- `objectsPage` sorts all of them in JavaScript to return one page.

**Nothing is shared between viewers.**
- Every public query starts with `requireViewer(ctx)`, which reads `ctx.auth`.
- Convex keys its query cache by user once a query reads `ctx.auth`.
- So nothing is shared between viewers, even for public spectator data.
- **Measured here** on the local backend: two users, each calling twice.

| Query | User A, 1st call | A, 2nd | User B, 1st call | B, 2nd |
|---|---|---|---|---|
| `version:current` (no `ctx.auth`) | executed | cached | **cached** (shared) | cached |
| `setups:list` (`requireViewer`) | executed, 14 docs | cached | **executed again**, 14 docs | cached |

**Work recomputed on every read.**
- `self.score` folds over all objects for every viewer.
- `objectInstance(settings)`.
- Standings and ranks.
- The utility catalog, re-sent with every re-run.
- The client then re-sorts the whole world again in about six panels (`useObjectRanks`).

So the cost is **viewers × ticks × whole world**. The fix is to remove each of those three multipliers.

### 1.3 The client's workarounds (the owner's second concern, audited)

The live UI does use real subscriptions: `useQuery`, `useQueries`, `watchQuery` and `onUpdate`. **Nothing polls
Convex on a timer.** Some code does manage reloads itself, though, and some hides the cost of over-wide queries. Each
occurrence is classified as (a) a legitimate one-off read, (b) a local clock, or (c) a design error.

**Design errors (c):**

| Where | What | Why it is wrong |
|---|---|---|
| `site/lib/convex.tsx` `useLive`, `lib/live-retry.ts` | On a query error, it drops the subscription and resubscribes with backoff (1–30 s, 5 tries), showing the last answer meanwhile | A reload policy the client manages itself. It exists because queries hit the 1 s limit. Convex already resubscribes every query on reconnect. Remove it once the queries fit (§6, PR 8). |
| `core/core-boundary.tsx` | Remounts the whole dock every 3 s after an error, which tears down and recreates every subscription | Same problem |
| `core/replay/replay-game.tsx` | Loads every replay page in a sequential one-off loop with its own retry | A one-off read is right (an ended game never changes). The loop and retry are a workaround for page size. Precompute the replay once (§4.4). |
| `sdk/throttle.ts` `useThrottled`, under every SDK hook | About 20 dock components read the whole-world `player.observation`. Each samples it at 0.5–2 Hz so that ten panels "never cost ten renders per tick". | Sampling that hides an over-wide query. With narrow queries, React re-renders only what changed. |
| `core/panels/race.tsx`, `core/panels/agents.tsx` | Build a module-level history by sampling the observation once per tick, only while the panel is open | The client inventing state the server should own. The history is lost on reload and differs per viewer. |
| `core/game/owner.ts:53` | One-off `rooms.get` (the whole room) just to read `revision` before `owner.settings` | The revision is always fresh, so the optimistic check can never fail and the last writer always wins. Pass the revision the user saw. |
| `site/pages/game.tsx:164` | Keeps `games.view` (every object, 100 chat rows) subscribed under the dock, only to read the game's status, roster and codes | A whole-world subscription for four fields |

**Legitimate by Convex's guidance, but the owner's rule is stricter (R6): these become shared subscriptions too:**
- one-off reads on a user action: the command palette's lists in `layout.tsx` and `use-commands.ts` (AI templates,
  past games, credentials, threads), `aiTemplates.catalog`, `receipts.get`, `myUtility` in `stored-frame.tsx`;
- static data cached per page: `use-manifest.ts`, calibration tables.

**Legitimate under R7:**
- CLI and tooling: `lib/player-client` `state.ts`, `assistant.ts`, `panel.ts`, the engine scripts, e2e;
- the OAuth device-flow poll (RFC 8628 requires it);
- the deploy auto-update: a subscription to `version.current`, plus a reload countdown for new *code*;
- countdown clocks: `room.tsx`, `game.tsx` `useServerNow`, `device.tsx`, `connect.tsx`, `situation.ts` `useNow`;
- confirm-disarm timers.

### 1.4 Computing stats in Convex versus sending the world (measured)

The owner's diagnosis: "calculating stats within convex would be efficient for up to 10k scale objects. The problem
was sending all the objects to the client on every change to any of them." To test it, a temporary local-only query
read N objects and returned either a stats result or every object.
- The stats result: per-god Σ net bits, positive counts, top 10.
- Every object: what the page queries did.

Medians from `npx convex logs --jsonl`, on the local backend:

| N objects | Docs read | Read | Stats: user ms | Stats: answer | All objects: user ms | All objects: answer | All objects: client round trip |
|---|---|---|---|---|---|---|---|
| 1,000 | 1,000 | 590 KiB | 30 | 0.97 KB | 56 | 468 KiB | 231 ms |
| 2,000 | 2,000 | 1.2 MiB | 64 | 0.98 KB | 106 | 935 KiB | 499 ms |
| 5,000 | 5,000 | 2.9 MiB | 149 | 0.98 KB | 240 | 2.3 MiB | 2.6 s |
| 10,000 | 10,000 | 5.8 MiB | 252 | 0.98 KB | — | **refused**: "Array length is too long (10000 > maximum length 8192)" | — |

**What this shows.**
- **The owner is right about the catastrophe.**
  - Sending the world costs 500× the bytes of the stats, and round trips grow to seconds.
  - Past 8,192 objects Convex refuses to return the array at all.
- **Computing stats in Convex over 10k objects is feasible**: 252 ms of user code, within the 32,000-document and
  16 MiB read limits.
- **It is not free if every viewer's subscription repeats it on every tick.**
  - Any object change invalidates a query that read every object. A stats query over the whole world therefore
    re-runs every tick: 10k reads and 252 ms each time.
  - With a per-user cache key (§1.2), that cost is multiplied by the number of viewers.
  - The local backend's wall time at 10k was 7.9 s, mostly document fetch. The local backend's fetch is SQLite-bound,
    and cloud will differ, but not by enough to make 10k reads per viewer per tick sound.

**The cheapest place to compute stats is the tick.**
- Its `snapshot` already reads every object once per tick. It already computes every god's totals (`tick.ts:231`)
  and the scoreboard.
- Adding Σpayoff, counts and quadrant counts there costs almost nothing.
- Writing them as one small document per god (≤ 8 per game) lets every reader read one document.
- If a stat is needed that the tick does not compute, one shared, no-auth query over the world, run once per tick,
  is acceptable at this scale. A per-viewer one is not.

### 1.5 The `games` document's shape

Measured on real documents:
- A running game's doc is **2.1 KB**. An ended game's is 4.6 KB, of which `summary` is 2.3 KB.
- It is a flat header row: ids, short codes, phase, deadlines, counters.
- Its only nested values are bounded snapshots, taken at start and never changed during the game:
  - `settings`: 887 B, typed `v.any`;
  - `roster`: ≤ 8 entries, 242 B;
  - `summary`, the end-of-game result. It duplicates `settings` and `roster` (another reason to drop it in the
    narrowing).
- Small fixed objects: `scoreboard` (≤ 8 numbers), `stats` (4 counters), `tick` (2 numbers).

Everything that grows lives in its own table, keyed by `gameId` with indexes:
- objects, agents, deities;
- events (`objectEvents`, `tickBatches`);
- chat, catalogs.

So the table is normalised. The defect is narrower:
- **Seven fields are written about once a second**: `worldSeconds`, `lastTick`, `nextSpawn`, `nextBatch`,
  `objectCount`, `stats`, `tick`.
- They sit in the header row that every query reads, so each write invalidates every reader.

**What a frequent write to a small record costs.** The cost is not the bytes of the record. It is that every query
that *read* the record re-executes in full, whether or not its answer depends on the field that changed. Measured
over HTTP on the local backend, calling every 3 s:

| Query (reads the `games` doc for `phase` or `settings`) | While the game runs | After it ends | Cost of each forced run |
|---|---|---|---|
| `layout.current` | 6 of 6 calls re-executed | 1 executed, 5 cached | 5 docs, 59 ms (22.5 ms user code) |
| `player.myUtility` | 6 of 6 calls re-executed | 1 executed, 5 cached | 6 docs, 44 ms (14 ms user code) |

Their answers never changed, so every one of those runs was wasted.

The waste scales with:
- the number of subscriptions that read the record;
- the number of viewers;
- the tick rate.

Today about nine of each viewer's subscriptions read the `games` doc. Some of them read the whole world too.

Even with lean queries, ten metadata subscriptions per viewer, 20 viewers and one write per second make 200 wasted
executions a second, each costing about the 11–15 ms floor. That is the reason to keep values written every second
out of the record that metadata readers subscribe to.

Not measured: whether Convex also pushes an unchanged answer over the websocket. The websocket harness could not
authenticate by impersonation.

Moving them to `gameClocks` and `gameEngine` (§4.1) is a split of hot columns from a cold row, not a de-nesting.
After the split, `games` is the lean metadata record: it changes only when the metadata changes.
Typing `settings` and `summary` precisely (instead of `v.any`) is worthwhile hygiene but unrelated to performance.

---

## 2. Does the owner's pattern fit Convex's guidance?

**Short answer: yes. It is how Convex's reactivity is designed to be used, with refinements.**
- Convex's guidance rewards it as long as the writes are shaped to match.
- Convex's own performance-audit skill warns against N per-item subscriptions in general, but resolves the question
  with a cost rule. That rule favours per-item queries here, because our items change independently and only 5–10%
  per tick.
- What the pattern alone does not fix is the write side:
  - the hot `games` doc;
  - per-user cache keys;
  - aggregates derived on read.

### 2.1 What supports it

**Invalidation follows the read set, down to a document and an index range.**
- "The read set precisely records all of the data that a transaction queried… we record the index range we scanned
  in the transaction's read set" ([How Convex Works][how]).
- The subscription manager "maintains all read sets for all active subscriptions" (same source).
- A query that reads one object re-runs only when that object changes. That is the property that makes per-item
  subscriptions cheap.

**Small queries are the stated ideal.**
- Queries should be "working with less than a few hundred records" and "should aim to finish in less than 100ms"
  ([Zen of Convex][zen]).
- "Use a query for nearly every app read" (same source).

**Many subscriptions stay consistent with each other.**
- "Your app will never render in an inconsistent state where only one of the `useQuery` call sites reflects the new
  data" ([React client][react]).
- The sync worker "guarantees that all queries in the client's query set are at the same timestamp" ([How Convex
  Works][how]).
- So splitting one big query into many small ones costs no consistency. Polling or one-off reads would lose it.

**Client mechanics, from the convex-js source ([local_state.ts][localstate], [client.ts][client]).**
- Identical `(function, args)` subscriptions in one client are deduplicated by reference count. A second component
  asking for the same item sends nothing.
- Each new distinct query is one small `ModifyQuerySet` message.
- Server updates arrive in batched `Transition`s.
- No per-client subscription cap is documented ([limits][limits]).

**Convex's own game, AI Town, reads with plain `useQuery` hooks** ("the UI just uses regular `useQuery` hooks to
load that state", [AI Town ARCHITECTURE.md][aitown]).

**Reactive subscriptions fit live game state.** They are "exactly right for… a multiplayer game state"
([Optimizing OpenClaw][openclaw]).

### 2.2 Where Convex's guidance refines it

1. **Optimise total invalidation cost, not subscription count.**
   - Convex's performance-audit skill lists "a page with 20 list items, each running its own `useQuery`" as a cost
     cause. It recommends batching related data into one query "instead of N".
   - It then qualifies that: "This is not automatically better. If the combined query becomes much broader and
     invalidates much more often, several narrower subscriptions may be the better tradeoff. **Optimize for total
     invalidation cost, not raw subscription count**" ([subscription-cost.md][subcost]).
   - Its cost model is `subscriptions × invalidation_frequency × query_cost`.
   - For us, a list item renders one object, which changes about once every 10–20 ticks.
     - A visible window of 30 rows costs about 2–3 one-document re-runs per tick.
     - The page query it replaces costs a 1,000-document re-run per tick.
     - **Per-item wins by two to three orders of magnitude.**
   - Batching only wins when every item changes on every write. AI Town's case is like that: positions change
     continuously.
   - **Refinement:** use per-item queries for lists of independently changing things. Use one small query for data
     that changes together.

2. **Virtualise, so that "the component's lifetime" means "visible".**
   - Unmounting a component removes its subscription, as the owner intends.
   - `usePaginatedQuery` "keeps every loaded page subscribed" ([subscription-cost.md][subcost]), so a list must
     virtualise its rows. Only visible rows mount item components, and the skeleton keeps a bounded number of pages.
   - convex-helpers' `ConvexQueryCacheProvider` can keep an unmounted query alive for a while. Its README says this
     costs "strictly more bandwidth… for optimizing the user experience, not database bandwidth"
     ([convex-helpers][helpers]). Use it only where scroll flicker is a measured problem.

3. **A skeleton must not read hot documents.**
   - A read set covers whole documents: "Convex returns full documents — there are no field projections"
     ([OpenClaw][openclaw]).
   - A skeleton that scans `objects` to return ids re-runs whenever any object in its range changes. That is fine
     when the range is one page of an index. It is not fine when the range is the whole table.
   - So skeletons read **one page of an index** over a narrow table ("Create a lightweight table with only the fields
     your hot path needs", [OpenClaw][openclaw]; digest tables in [hot-path-rules.md][hotpath]).

4. **Split frequently-written fields from widely-read documents.**
   - "Every write to that field invalidates every subscription that reads the document, even if those subscriptions
     never use the field… the write succeeds fine, but it forces hundreds of queries to re-run for no reason"
     ([subscription-cost.md][subcost]).
   - "Consider splitting the document up into the infrequently-changing fields and the frequently updated ones"
     ([Queries that Scale][qts]).
   - This is our `games` doc exactly. It is the biggest single fix, and the owner's pattern does not imply it.

5. **Compute aggregates once per change, not once per viewer. Our tick is the place; the Aggregate component is
   not needed.**
   - Reactive counts and sums over a large table re-run on every change. Convex recommends the Aggregate component,
     or "precomputed summary rows", for leaderboards and totals ([subscription-cost.md][subcost],
     [Aggregate][aggregate]).
   - **What the Aggregate component is.**
     - A B-tree kept in the component's own tables.
     - It gives O(log n) `count`, `sum`, `max`, `indexOf` (rank) and `at(offset)`, with namespaces (one per game, or
       per game and god).
     - It is maintained by calling `insert`/`replace`/`delete` in the same mutation as each write, or through
       convex-helpers triggers.
   - **What it costs.**
     - Each object change would update one namespace per god: ≤ 8 tree updates, each O(log n) writes in the tick's
       transaction.
     - Its README warns that `count(ctx)` with no bounds "depends on the entire data structure… the query reruns"
       on every change, and that concurrent writes to the tree can conflict ([aggregate README][aggregatereadme]).
   - **What we need instead.**
     - Totals, Σpayoff, counts and quadrant counts change every tick and are needed whole. The tick already holds
       every object, so it computes them in memory (§1.4) and writes ≤ 8 small documents.
     - That is cheaper than maintaining a B-tree and reading its root.
     - Top and bottom N, and paging in sort order, come from an ordinary index (`objectViews.by_game_god_payoff`)
       with `take(n)` and `paginate`.
   - **Where the component would still earn its place.**
     - "Rank of this one object" (the `#rank` badge on a single row: `indexOf`).
     - Jumping to an arbitrary offset in a sorted list (`at(offset)`, for a scrollbar you can drag to row 1,500).
     - Neither is needed for the first version. The rank shown in a list is the row's position in its skeleton page.
     - Adopt the component only if a component needs one of these and an index page cannot serve it.
   - The Sharded Counter fits many writers to one count. Our engine is the single writer, so we have no such
     contention.

6. **Public data must not read `ctx.auth`.**
   - "If many clients request the same query, with the same arguments, they will receive a cached response"
     ([query functions][queries]).
   - The cache is keyed by user once the query reads `ctx.auth`. Convex staff say so on the forum ([Discord
     answer][discordcache]; not first-party docs), and we **measured** it (§1.2).
   - A spectator query that calls `requireViewer` is computed again for every viewer. Without auth, one execution per
     change serves them all.
   - **Refinement:** split public data from private data at the query level. Public queries carry no auth check.
     Private, per-viewer queries are small.
   - `Date.now()` in a query also defeats the cache ([subscription-cost.md][subcost]). Today `rooms.get` and
     `publicGameView` return `serverTime: Date.now()`.

7. **Use one-off reads only where live data has no value.**
   - Convex recommends point-in-time reads for "aggregate snapshots, reports, low-churn listings" ([subscription-cost.md][subcost], [OpenClaw][openclaw]).
   - Convex's React docs present them for reads "in response to a user action" ([React client][react]).
   - Ours: palette pickers, receipts, the static replay of an ended game, agents' point-in-time tool reads, CLI
     snapshots.
   - Never a one-off read to learn a value that a live component shows; that is the `owner.ts` revision bug.
   - Never a timer to re-read.

8. **Keep the tick's writes minimal.**
   - "Don't write when nothing changed… Every unnecessary write is `subscribers x docs` wasted reads" ([OpenClaw][openclaw]).
   - AI Town batches many ticks into one step per second and writes only a diff ([AI Town][aitown]).
   - Our tick already writes only changed objects. What it writes needlessly is the hot clock and lease fields, onto
     the doc everyone reads.

### 2.3 Where the sources disagree, and what is unverified

**Per-item versus batched.** AI Town batches world state, and the audit skill's fix list prefers one query over N.
Both reconcile under the skill's own rule (optimise total invalidation cost). Batching is right when items change
together; per-item is right when they change independently. Our objects change independently.

**Unverified:**
- **Billing of cached fan-out.** Do updates delivered from the cache count as function calls? The pricing page does
  not say. Staff on Discord say subscription updates count as calls. Assume every viewer × every invalidated
  subscription × every tick is billed, which makes the shared public queries of point 6 a cost lever as well.
- **Per-subscription server memory.** No published figure exists. We measure it with the gate (§3, rule R8) rather
  than assume it.

**Convex's own agent skills.** They were consulted as the task asked:
- `get-convex/agent-skills` is canonical. `convex-agent-plugins` is a Cursor packaging of the same source, both
  synced from `convex-agents@a83f907` on 2026-10-29.
- The current skills are thin on reads. The most relevant one, `convex-performance-audit`, was retired from the repo
  in commit 90ae2c3. We vendor it from history (Apache-2.0) at `.claude/skills/convex-performance-audit/`.
- Several current skills pipe remote scripts into bash (`convex-improve-convex-plugin`, `convex-add`, the router
  skill). They are not vendored.

### 2.4 The previous session's chunk design, evaluated

**The sketch.** A `chunk` field on objects, an index on `(gameId, chunk)`, and one subscription per chunk.

**The arithmetic.**
- Take 64-object chunks and a 5–10% per-tick change rate.
- A chunk is untouched in a tick with probability 0.9⁶⁴ to 0.95⁶⁴, that is 0.1–4%.
- So nearly every chunk re-runs every tick.
- A whole-world reader still reads the whole world every tick. It only splits the work into 16–32 subscriptions.
- Chunks also do not solve personalised sorting (an object's rank is per god).

**Verdict: rejected for objects.** Whole-world needs are served better:

| Need | Served by |
|---|---|
| Totals, ranks, counts | tick-written summary docs |
| Top or bottom N | an indexed `take(N)` |
| The few views that need every point (the others-care scatter) | one compact per-god digest doc, written by the tick |
| Rendered lists | the owner's skeleton + per-item pattern, virtualised |

---

## 3. Principles for this codebase

**R1. One query per component, sized to what it renders.**
- A component subscribes to the data it renders and nothing else.
- A collection is a **skeleton** plus **items**:
  - The skeleton is a paginated, indexed query that returns ids and sort keys.
  - Each item is its own `useQuery`, run by the item's component and dropped when that component unmounts.
- Lists are virtualised, so only visible items subscribe.
- Data that always changes together (a header, a standings table) is one query.

**R2. No whole-table reads in public queries.**
- A query reads one document, or one page of an index range (`withIndex(...).paginate/take(n)`, n ≤ 100).
- `collect()`, `take(>100)`, `.filter()` over a scan, and reading a document only to filter it out are not allowed
  in a public query.
- The engine's own internal reads (the tick's snapshot) and migrations are exempt.
- A bounded small set (a room's ≤16 members, a game's ≤8 deities) is allowed, with a `// bounded:` comment.

**R3. Hot fields never share a document with cold fields that other queries read.**
- A field written more often than about once a minute while a game runs lives in its own document or table.
- Examples: the tick clock, the lease, stats, per-object payoffs.
- A query that needs only cold fields never reads a hot document.

**R4. Stats are computed in Convex once per change, never sent as the world and never recomputed per viewer.**
- Computing over the whole game (≤ 10k objects) inside Convex is fine.
- What is forbidden:
  - shipping the objects to the client to compute there;
  - a per-viewer query that re-reads the world on every tick.
- Prefer the writer that already holds the data (the tick's snapshot) and have it write small result documents:
  - standings and ranks;
  - per-god totals and counts;
  - the scoreboard history.
- Otherwise use one shared (no-auth) query.
- Sort orders are indexes, not sorts on read.
- The Aggregate component is used only for what an index cannot serve: a single item's rank, or a jump to an offset.

**R5. Data that anyone may see is read without `ctx.auth`; private data is small.**
- A query whose answer does not depend on the viewer, and that the product lets anyone read, must not read
  `ctx.auth`. Convex then shares one execution across all viewers.
- Disclosure is enforced by what a query returns, never by who asks.
- Where the product restricts who may read something (today: signed-in viewers for live games; players, spectators
  and the owner for ended ones), the query keeps its check. It is then made cheap instead: one document per
  execution, so a per-viewer execution costs about the 11 ms floor.
- Per-viewer queries return only the viewer's own slice. No `Date.now()` in a query.
- **Decided by the owner (2026-11-02): sign-in is required for everything on the site.** Every query keeps its
  viewer check, so no query is shared across viewers. R1–R4 keep each per-viewer execution to a few documents.

**R6. In the app, every piece of server data is a subscription, held once and shared.**

Each piece of server data the app shows is one live subscription:
- a command-palette list;
- a picker's options;
- a receipt;
- the game's colour palette and rules;
- the deploy manifest;
- calibration tables.

That subscription is the client-side object that every component rendering that data refers to, through one hook
keyed by `(query, args)`. Convex's client already holds identical subscriptions once (reference-counted). Only
components that are mounted hold it, so a palette list subscribes while the palette is open.

When the data changes, every component showing it updates in real time. The app has:
- no one-off `convex.query` reads;
- no module-level caches of query results (`use-manifest`, `tableCache`, the trajectories store, the race and
  agents samplers);
- no timer re-reads;
- no client retry or resubscribe policy (Convex resubscribes on reconnect);
- no sampling or throttling to hide a query's cost;
- no history built by sampling (the server owns history).

An action result that pages need becomes a query over a stored document (the manifest; the calibration tables'
index). Countdown timers are not reads: they render time passing towards a deadline that comes from a subscription.
A query error is shown. If it is a limit error, it is a bug in the query.

**R7. One-off reads exist only outside the app, where there is nothing to keep live:**
- a CLI command that prints once and exits (its `--watch` mode subscribes);
- reads inside Convex functions: an agent's or MCP tool's `ctx.runQuery` in an action;
- the OAuth device flow's HTTP poll (RFC 8628; not Convex data);
- tests and scripts.

**R8. Budgets are tested** (`artifacts/engine/test/game-query-cost.test.ts`, §6 PR 1). In a 1,000-object running
game:
- every public query a page subscribes to reads **≤ 100 documents and ≤ 64 KiB**;
- every such query runs in **≤ 50 ms** of user-code time (`userExecutionTime`: median of 10 sequential uncached runs on
  the local backend while the game runs);
- every **cold** query (room, layout, my utility, past games, header) is **not invalidated by a tick**: an `onUpdate`
  subscription receives no update across 5 commits;
- every query refuses an unauthenticated caller (sign-in is required everywhere, owner decision 2026-11-02), except
  the two decided open: `version.current` (the deploy auto-update) and `auth/user.me` (null when signed out).

**R9. Every write path is checked for invalidation fan-out.**
- When adding a field to a document, ask who reads that document. If it is written often, R3 applies.
- When a page gains a component, it gains a query that obeys R1–R5 and an entry in the R8 budget table.

---

## 4. The redesign, by component

### 4.1 New and changed tables (written by the tick unless noted)

| Table | Holds | Written | Read by |
|---|---|---|---|
| `games` (header, cold) | Unchanged minus the hot fields: roomId, codes, settings, roster, spectators, phase, planningEndsAt, pauseEndsAt, endAtWorld, `instance` (objectInstance stored once at start), summary | Start, phase changes, end, summon (agentCount moves out) | Everyone |
| `gameClocks` (public, hot) | gameId, worldSeconds, lastTick, objectCount, agentCount | Every commit | The one clock component per page (shared, no auth); clients interpolate between ticks |
| `gameEngine` (internal, hot) | gameId, `tick{seq,leaseUntil}`, nextSpawn, nextBatch, stats | Every commit | The loop only. Never a public query. |
| `standings` | gameId, godId, rank, total (as disclosed to others: the batched scoreboard), at | When the scoreboard is due (every 10 world-seconds); at end | Standings, race, results, overview (public, no auth) |
| `standingsHistory` | gameId, at, totals[] (one row per scoreboard) | With `standings` | Race panel series (cursor-paged), replacing client-side sampling |
| `godTotals` | gameId, godId, own exact total, Σpayoff, quadrant counts (others-care), energy-relevant economy | Each commit that changes one of that god's objects (≤ 8 docs) | The viewer's own header and overview (per viewer, 1 doc) |
| `objectViews` | gameId, godId, objectId, netBits, peerNetBits (noisy), payoff, value (copy, for display without a join) | For each changed object, one row per roster god (≤ 8 × changed, at most about 800 patches per tick); inserted on spawn | Per-god skeletons (index `by_game_god_payoff`, `by_game_god_netBits`, `by_game_god_peer`), per-item queries, top/bottom N |
| `objects` | Unchanged for the engine; gains `publicSalience` (noisy, as disclosed) and an index `by_game_salience` | As now | Engine snapshot; the spectator skeleton and the public per-item query |
| `objectDigests` | gameId, godId, packed arrays `[objectId, ownNet, peerNet]` for the scatter (about 30 KiB at 2,000 objects) | Rewritten when that god's objects change | The others-care scatter only |
| `replays` (file storage) | The ended game's full log, written once by `endGame` (scheduled action) | Once | The replay page: one fetch, no paging loop |
| `objectEvents` | Gains index `by_game_owner_seq` | As now | The feed's "my transformations" without scanning `tickBatches` |

**Disclosure.**
- `objectViews` rows are private per `godId`. Only the owning god's query reads them, so other gods' scores never
  leave the server.
- `publicSalience` and `standings` hold only what is already disclosed: noisy sums and the batched scoreboard.
- Each new query gets an assertion in `test/game-disclosure.test.ts`.

### 4.2 Game page, spectator view (`site/pages/game.tsx`, `SpectatorView`)

| Component | Query (args) | Reads | Re-runs when |
|---|---|---|---|
| Game page router (Play, Replay or Spectate) | `games.header {code}` (public) | 1 games doc | Phase or roster changes |
| Clock and phase pill | `games.clock {gameId}` (public) | 1 `gameClocks` doc | Every commit (1 shared execution for all viewers) |
| Standings table | `games.standings {gameId}` (public) | ≤ 8 `standings` rows | Scoreboard due (every 10 s) |
| Objects skeleton | `games.objectIds {gameId, paginationOpts}` (public, `usePaginatedQuery`, virtualised) | One page of `objects.by_game_salience` | An object in the page changes |
| Object row | `games.object {objectId}` (public) | 1 object doc | That object changes (shared across viewers) |
| Chat | `rooms.chat {roomId, paginationOpts}` | One page of `chat.by_room` | New message |
| Catalog / instance | `games.instance {gameId}` (public) | 1 doc | Never during a game |
| Owner controls | `rooms.access {roomId}` (private) | room plus member | Membership changes |

`games.view`, the whole-world query, is deleted.

**Decided: sign-in is required for everything (owner, 2026-11-02).** "(public)" above means "the same for every
signed-in viewer", not anonymous.
- Each query keeps `requireViewer` and the existing room-scope and historic-game checks (`readable()` in `games.ts`).
- Each execution is per viewer, so every query is kept to 1–8 documents. That is about the 11–15 ms floor.
- `games.clock` is dropped: clients interpolate the world clock from the header's deadlines and the last standings
  time, so no per-viewer query re-runs every tick just to move a clock.

### 4.3 The dock and every panel (player view)

`player.observation` is retired as a page query. Each hook in `src/sdk/hooks.ts` maps to its own narrow query. The
hook API that stored panels and the bridge (`QUERY_REFS`) see is kept, so stored panels keep working. `useThrottled`
is removed, except for replay playback.

| Hook / component | Query | Reads |
|---|---|---|
| Shell, layout | `layout.current` (reads `games` header phase, cold) | room, member, header, layout |
| Header: phase, clocks, `self` label, energy, ready, pauseUsed, seated | `games.header` + `games.clock` + `player.self {gameId}` (deity + account) | 1 + 1 + 2 docs |
| `useLeaderboard` (overview, race, results) | `games.standings` | ≤ 8 rows |
| Race series | `games.standingsHistory {gameId, after}` (cursor-paged) | ≤ 100 rows; replaces the module-level sampler |
| `useMyAgents` (agents, forge, overview) | `player.agents {gameId}` | own agents `by_game_owner` (≤ 20) |
| Agents energy series | `player.agentSeries {gameId, after}` | Derived from `objectEvents.by_game_owner_seq` + account; replaces the sampler |
| `useInstance` (forge, what-if) | `games.instance` | 1 doc |
| `useChat` | `rooms.chat` (paged) | 1 page |
| Feed, my transformations | `player.transformations {gameId, paginationOpts}` | `objectEvents.by_game_owner_seq` page |
| Feed, public log | `player.events` (unchanged API; pages of `tickBatches`; fine at ≤ 20 docs, but each about 10 KiB) | Trim later to a per-tick public event row if it fails R8's 64 KiB |
| Objects panel | skeleton `player.objectIds {gameId, sort, paginationOpts}` over `objectViews.by_game_god_<sort>` + row `player.object {objectId}` (own `objectViews` row; value from the row) | 1 page + 1 doc per visible row |
| My card, bits over time, results: top/bottom N | `player.objectsTop {gameId, by, n ≤ 20, dir}` | `take(n)` on the index; rank is the position |
| `#rank` badges (`useObjectRanks`) | Rank comes from the skeleton position, or `player.objectRank {objectId}` (count over the index range with the Aggregate component if needed) | Removes 6 client-side whole-world sorts |
| Overview Σpayoff, others-care quadrant counts | `player.totals {gameId}` → `godTotals` (computed by the tick from its snapshot) | 1 doc |
| Others-care scatter | `player.objectDigest {gameId}` → `objectDigests` | 1 doc (about 30 KiB) |
| What-if (one object) | `player.object {objectId}` | 1 doc |
| `useMyCard`, `useEvaluator` | `player.myUtility` (cold now) | as today |
| Sandboxed stored panels | The same narrow queries through the bridge; the bridge's rate limit stays (untrusted frames) | — |

### 4.4 Room page, home and replay

| Page | Change |
|---|---|
| Room (`room.tsx`) | `rooms.get` stays one query. It reads the room, members, setup and the cold `games` header. It stops re-running per tick once the clock leaves `games`. Chat moves to its own paged `rooms.chat` component. `utilityCatalog` moves to its own `rooms.catalog` query, because it is large and static. `serverTime: Date.now()` is dropped: clocks use `games.clock`, or a skew estimate from a `version`-style shared query. `rooms.history` gains the index `games.by_room_phase` instead of take-200-and-filter. |
| Home (`home.tsx`) | `rooms.list` is already narrow. Cold header only. `memberCount` stored on the room. |
| Replay | `endGame` schedules an action that writes the full replay log to file storage once (`replays.storageId` on the game). The page fetches it once from `GET /api/replay/<roomId>/<gameId>`, which checks the caller's Convex JWT like `player.replay` (never a storage URL: anyone holding one could download it). This is a legitimate one-off read of an immutable record: no paging loop, no retry. Playback keeps its client-side fold (it is a player, not a query). |
| Owner (`owner.ts`) | `owner.settings` takes the revision the user saw (`useRoomInfo().revision`). No one-off `rooms.get`. |

### 4.5 External player SDK (`lib/player-client`) and MCP

**Live clients (`watchState`, `pnpm player state --watch`).** They subscribe with `onUpdate` to the same narrow
queries the dock uses:
- header + clock;
- self;
- agents;
- standings;
- transformations;
- objects top N;
- `player.objectIds` + `player.object` for listed objects.

The CLI's output throttle stays; it limits printing, not reading.

**Observation protocol v3 for agents and MCP tools: one-off, point-in-time reads.**
- The protocol keeps its shape: a composite is the right interface for an agent's single turn.
- It is rebuilt server-side from the small documents:
  - header, clock, self, totals, standings, agents;
  - objects from `objectViews` with a **server-side** cap (`objectsLimit`, default 50, sorted by the agent's chosen
    key) instead of `take(2100)` followed by `capObjects` on the client.
- A full-world read stays available, explicitly, as a paged tool (`list_objects` with a cursor), never as one query.
- `observation` is versioned. The narrow v3 is wire-compatible, with the object list now capped. If the cap changes
  agents' behaviour it becomes v4, and the change is documented in `docs/engine-api.md`.

**`player.board` and `player.series` (agent tools; point-in-time).**
- `board` reads every object plus one event per object.
- Rebuild it as a paged read over `objectViews`, using the current version when `world` is now. Historical worlds
  read `objectEvents` pages.
- Each page obeys R2.

---

## 5. Schema changes (widen → migrate → narrow)

Each step follows CLAUDE.md "Schema migrations" with `@convex-dev/migrations`.

| Change | Widen (PR that introduces it) | Migrate | Narrow (a later PR, after dev and prod report `success`) |
|---|---|---|---|
| Hot fields out of `games` | Add `gameClocks` and `gameEngine`. Add `games.instance` as optional. The loop writes the new docs and **stops writing** the hot fields on `games`. Readers read the clock doc, falling back to `games.*`. | `splitGameHotFields`: for every game, create `gameClocks`/`gameEngine` from its fields if missing, store `instance`, and unset the hot fields (`undefined`). Idempotent. | Remove the hot fields from the `games` validator. Make `instance` required. Remove the fallbacks. (Hot fields and fallbacks: done, the migration is removed.) |
| `standings`, `standingsHistory` | New tables. The tick writes them when the scoreboard is due. Readers fall back to the clock's scoreboard. | `backfillStandings`: from the clock's scoreboard, for every game | `games.scoreboard` dropped with the hot fields; the clock fallback in `games.standings` goes later |
| `objectViews`, `godTotals`, `objectDigests` | New tables. The tick maintains them for changed objects. A game without rows (started before the deploy) is filled by the migration. | `backfillObjectViews`: per game (paged per object), write every god's row from `objects.scores` | None (read models; `objects.scores` stays as the engine's truth) |
| `objects.publicSalience` + index | Optional field. The tick writes it. | `backfillPublicSalience` | Make required (done; the migration is removed) |
| `objectEvents.by_game_owner_seq`, `games.by_room_phase` | Indexes only | None | None |
| `replays` | Optional `games.replayStorageId`. `endGame` writes it. | `backfillReplays`: for ended games, schedule the writer action (bounded batches) | None (the replay page falls back to paging only until the backfill is done; then the fallback is removed) |

---

## 6. PR sequence

Each PR is test-first and goes into `develop`, merged per CLAUDE.md. The probe (`probe-query-times.ts`, folded into
PR 1's gate) re-measures before and after each PR, and the PR description quotes the numbers.

1. **Principles and the gate.**
   - Vendor `convex-performance-audit`.
   - CLAUDE.md "Reading data from Convex" and the memory rule.
   - `test/game-query-cost.test.ts`:
     - R8's four checks, driven by a budget table `test/query-budgets.ts` that lists every page query;
     - the read and time numbers come from `npx convex logs --jsonl` with `cachedResult` excluded;
     - today's offenders are listed as *known debt* with their measured ceilings, so the gate ratchets down PR by PR
       and fails on any new offender or any regression.
2. **Split the `games` doc** (R3).
   - `gameClocks`, `gameEngine`, `games.instance`; the loop writes them.
   - Migration `splitGameHotFields`.
   - Expected: `rooms.get`, `layout.current`, `myUtility`, `rooms.history`, `rooms.list` and `games.resolve` stop
     re-running per tick. The gate's cold-query check passes for them.
   - Drop `serverTime: Date.now()`.
3. **Public read model for the spectator page** (R1, R4, R5).
   - `standings` (+ history) written by the tick.
   - `objects.publicSalience` + index.
   - Public, no-auth `games.header`, `games.clock`, `games.standings`, `games.instance`, `games.objectIds`,
     `games.object`, `rooms.chat`, `rooms.catalog`.
   - The spectator page is rebuilt from them, virtualised. `game.tsx` routes on `games.header`. `games.view` is
     removed.
   - Disclosure tests; every new query keeps its viewer check (sign-in required everywhere).
4. **Per-god object read model** (R1, R2, R4).
   - `objectViews`, `godTotals` and `objectDigests` maintained by the tick, plus the backfill migration.
   - `player.objectIds` / `player.object` / `objectsTop` / `totals` / `objectDigest`.
   - The objects panel becomes skeleton + virtualised rows.
   - `objectsPage` is removed.
5. **The dock off the observation** (R1, R6).
   - The SDK hooks map to the narrow queries (header, self, agents, standings, instance, chat, transformations).
   - `useObjectRanks` and `useThrottled` are removed.
   - The race and agents histories come from the server (`standingsHistory`, `agentSeries`).
   - Panels' unit tests are updated; `e2e:panels` runs.
6. **The SDK and MCP.**
   - `watchState` uses the narrow queries.
   - The observation is rebuilt from the read model with a server-side object cap.
   - `board` and `series` are paged.
   - `engine-api.md` and `mcp.test.ts` are updated.
7. **Replay precompute.** File-storage replay written at end, plus the backfill. The paging loop and its retry are
   removed.
8. **Subscriptions everywhere in the app; remove the workarounds** (R6, R7).
   - One shared hook per `(query, args)`.
   - The command palette's lists, pickers, `receipts.get` and `stored-frame`'s `myUtility` become subscriptions.
   - The manifest and the calibration tables' index become queries over stored documents (no action calls, no
     module caches).
   - The trajectories module store becomes a subscription per cursor window.
   - Remove `live-retry.ts`, `useLive`'s retry and kept answer, `CoreBoundary`'s remount loop, and the `owner.ts`
     one-off revision read.
   - A grep check in the app's unit tests fails on `convex.query(`, `useConvex().query` or `setInterval` around a
     Convex read in `artifacts/player-web/src`.
   - The gate's known-debt list is empty.
9. **Narrow.** After dev and production report every migration `success`: remove `games`' hot fields and
   `scoreboard`, the readers' fallbacks, and `player.observation`'s page-query export (if no client still uses it).

PRs 2 and 3 deliver most of the relief: every per-tick re-run of cold queries goes away, and the spectator page
becomes shared. PR 4 is the largest; it needs the tick's extra writes measured (≤ 800 row patches per tick) against
the commit's time budget, using the existing `probe:concurrent`.

### 6.1 Results so far (2026-11-03; released to production at 15:51 AEDT)

The figures below were measured by the query-cost gate in each PR, in a running game with 1,000 objects on the local
backend: documents and KiB read per execution, and median user-code ms. "Cached" means the query was answered from
the cache across 5 tick commits.

**Landed:**

| PR | Change | Rule |
|---|---|---|
| #155 | Query-cost gate and budget table | R8 |
| #158 | `games` split into `gameClocks` and `gameEngine`, with a migration | R3 |
| #161 | Sign-in required everywhere | — |
| #154, #156, #157 | Palette lists as subscriptions; no dock remount loop; guard against one-off reads | R6 |
| #159, #160, #162 | Stored replays, served behind sign-in | R7 |
| #163 | Spectator read model, with tick-written standings | R1, R4 |
| #166 | Manifest and calibration as subscriptions | R6 |
| #169 | Gate reliability | — |
| #173 | The observation reads its own transformations through an index | R2 |

**Measured before and after:**

| Query | Before | After |
|---|---|---|
| `games.view` (spectator page; the query that hit the 1 s limit) | 1,019 docs, 566 KiB, 56 ms, every tick for every viewer | **Removed**, replaced by 8 small queries |
| Spectator queries (#163): `games.header`, `standings`, `standingsHistory`, `instance`, `object`, `rooms.chat` | — | 4–8 docs, 3–6 KiB, about 10 ms each; header, instance and chat cached |
| `games.objectIds` (spectator skeleton page) | — | 54 docs, 32 KiB, 9 ms |
| Metadata queries (#158): `rooms.get`, `rooms.list`, `rooms.history`, `games.resolve`, `layout.current`, `myUtility`, `assistant.*` | Re-executed on every tick commit, for every viewer | **Cached across ticks** (all 22 cold queries); 4–9 docs, ≤ 7.5 KiB, 16–35 ms when they do run |
| `player.observation` (the dock) | 1,062 docs, 792 KiB, 126 ms | 1,185 docs, 688 KiB, 119 ms (#173: −104 KiB per player per tick; small index rows replace 15 large batches) |
| `manifest.get` | Action, cached by hand in the browser | Live query: 5 docs, 56 KiB |

**Still debt** (listed in `test/query-budgets.ts`, ratcheting down):
- `player.observation`: whole world. The fix is moving the dock off it (PR 5).
- `player.objectsPage`: whole world. The fix is the per-god read model (PR 4).
- `player.game`: an ended game's final state; static once ended.
- `player.events` and `player.trajectories`: up to 50 `tickBatches` per call, 300–650 KiB depending on load.
- `setups.list`: the whole shared setup catalogue.

**Held or postponed to Thursday 2026-11-05** (owner's decision, to protect the evening release):

| Item | Status |
|---|---|
| Removing `useLive`'s retry (#171) | Ready, but held. Without the retry, a query over 1 s on a loaded backend leaves the page on an error until reconnect. Merge it after the dock leaves the observation. |
| Trajectory windows plus a live tail (PR 8's trajectories item) | Not started |
| Per-god object read model (PR 4, branch `c2-object-views`) | Built, but the per-object row sync doubled tick commit time (298 → 667 ms at 1,000 objects, 100 Hz). Needs a cheaper write before it can merge. |
| The dock off the observation (PR 5); the SDK and MCP (PR 6); `setups.list` paging | Not started |
| Narrowing `games`' hot fields and their fallbacks | Done (2026-11-05): the fields left the validator, `game/state.ts`'s fallbacks and `splitGameHotFields` are gone. |
| Narrowing `objects.publicSalience` | Done (required, no fallbacks). |
| Narrowing `objectEvents.index` and `cost`, and removing the old-scan fallback (#173) | Waits for the same. |

**Process rule added on the way** (`.claude/skills/selective-testing`): each change runs its own selective set of
suites, once, when it is ready to merge. CI on `develop` is the full net.

---

## 7. Sources

[how]: https://stack.convex.dev/how-convex-works
[zen]: https://docs.convex.dev/understanding/zen
[react]: https://docs.convex.dev/client/react
[queries]: https://docs.convex.dev/functions/query-functions
[limits]: https://docs.convex.dev/production/state/limits
[qts]: https://stack.convex.dev/queries-that-scale
[openclaw]: https://stack.convex.dev/optimizing-openclaw
[subcost]: https://github.com/get-convex/agent-skills/blob/ec1e6baae7d86c7843c22938c75979c016f5c6e9/skills/convex-performance-audit/references/subscription-cost.md
[hotpath]: https://github.com/get-convex/agent-skills/blob/ec1e6baae7d86c7843c22938c75979c016f5c6e9/skills/convex-performance-audit/references/hot-path-rules.md
[aitown]: https://github.com/a16z-infra/ai-town/blob/main/ARCHITECTURE.md
[aggregate]: https://www.convex.dev/components/aggregate
[aggregatereadme]: https://github.com/get-convex/aggregate/blob/main/README.md
[helpers]: https://github.com/get-convex/convex-helpers/blob/main/README.md
[localstate]: https://github.com/get-convex/convex-js/blob/main/src/browser/sync/local_state.ts
[client]: https://github.com/get-convex/convex-js/blob/main/src/browser/sync/client.ts
[discordcache]: https://discord-questions.convex.dev/m/1397010727637614684

**Convex documentation**
- [How Convex Works][how]: read sets, the subscription manager, the sync worker.
- [The Zen of Convex][zen].
- [React client][react]: consistency of `useQuery` call sites; one-off queries.
- [Query functions][queries]: caching.
- [Limits][limits].
- [Pagination](https://docs.convex.dev/database/pagination): page sizes shrink and grow;
  [fully reactive pagination](https://stack.convex.dev/fully-reactive-pagination).

**Stack articles**
- [Queries that Scale][qts].
- [Optimizing OpenClaw][openclaw] (Seth Raphael).
- [Help, my app is overreacting](https://stack.convex.dev/help-my-app-is-overreacting): stable queries.

**Convex agent skills**
- `convex-performance-audit` (retired upstream at 90ae2c3; vendored here). Its references:
  - [subscription-cost.md][subcost];
  - [hot-path-rules.md][hotpath];
  - `occ-conflicts.md`;
  - `function-budget.md`.
- Current skills read: `convex-advisor`, `convex-cost`, `convex-reviewer`, `convex-expert`, `convex-suggest`.

**Components and source code**
- [Aggregate component][aggregate] and its [README][aggregatereadme];
  [Sharded Counter](https://github.com/get-convex/sharded-counter/blob/main/README.md).
- [convex-helpers README][helpers]: `ConvexQueryCacheProvider`, `useStableQuery`, `paginator`.
- convex-js [local_state.ts][localstate] and [client.ts][client]: dedupe and query-set messages.
- [AI Town ARCHITECTURE.md][aitown]: steps, history buffers, diffs, plain `useQuery` reads.

**Forum**
- Convex staff on cache keys and `ctx.auth`: [Discord][discordcache]. Not first-party docs; confirmed by our own
  measurement in §1.2.
