---
name: Reading data from Convex
description: One query per component (skeleton + per-item), no whole-table reads, hot fields split out, derived state written by the tick, public queries without ctx.auth, subscriptions only, budgets tested.
---
Every page reads Convex through small per-component subscriptions; never one integrated query for a page.

**Why:** The owner, 2026-11-02: "You should never be doing one giant integrated query for everything in Convex. Use
nested queries that sync the properties needed to render one component at a time ... one query for a paginated
collection skeleton and another for each individual item within it, run by the component that renders each item and
discarded whenever that component gets torn down." Measured at 1,000 objects: page queries read 1,000–2,000 docs
each, re-ran for every viewer on every tick (the tick patches the `games` doc that every query read), nothing was
shared between viewers (`requireViewer` keys the cache per user), one hit the 1 s limit, and the client grew retry and
throttle workarounds. Convex's guidance agrees, refined: optimise total invalidation cost
(subscriptions × invalidation frequency × query cost), split hot fields from widely read docs, precompute aggregates
on the write path.

**How to apply** (rules R1–R9, `docs/convex-read-architecture.md` §3):
- A component subscribes to what it renders. Collections are a paginated, indexed skeleton of ids plus one `useQuery`
  per item in the item's component; lists are virtualised. Data that changes together is one query.
- Public queries read one doc or one index page (≤ 100): no `collect()`, no scan-then-filter, no reading every object.
- A field written more than about once a minute during a game lives apart from cold fields others read (the clock and
  lease are not on `games`).
- Standings, totals, ranks, counts, sort orders and histories are written by the writer (the tick) as small docs.
- Data anyone may see is read without `ctx.auth` so Convex shares one execution across viewers; where the product
  restricts readers, keep the check and make each execution one cheap doc; private queries return only the viewer's
  slice; no `Date.now()` in a query.
- Changing data is shown only through subscriptions: no timer re-reads, no client retry/resubscribe policy, no
  throttling or sampling to hide a query's cost, no client-built history. One-off reads only for user-action lookups,
  immutable records, and agents' or CLIs' point-in-time reads.
- Every page query has an entry in the query-cost gate: ≤ 100 docs, ≤ 64 KiB, ≤ 50 ms in a 1,000-object game; cold
  queries are not invalidated by a tick; public queries are served from cache to a second user.
- The vendored `convex-performance-audit` skill (`.claude/skills/`) is Convex's own audit workflow; the repo's rules
  take precedence.
