# Status: locks (defending a predicate with energy), 16 November 2026

Labels: **built** (merged or on a branch, with tests run), **seen narrowly** (observed once or in one setting),
**guess** (not checked).

## 1. What I was asked to do
Lead the owner's lock mechanic (16 Nov; CLAUDE.md "Defence by locks"): a lock on an object carries a predicate the
object meets and holds energy. A move that would break the predicate is refused until someone drains the lock. Creation
and upkeep cost in proportion to the predicate's complexity, and anyone offered the object may list locks and add or
take energy. Deliverables: a spec, then engine + server + affordances + agent API behind a room setting `locks`, then
checks (unit tests for the owner's examples, a live test, exact replay, the energy gate unaffected, a table simulation).

## 2. Merged and unmerged
- Merged into develop: #1015 (spec `docs/engine-v2/locks.md`), #1025 (`lib/v2-core/src/locks.ts`: predicate
  language, information content, lock arithmetic), #1044 (agent API: EngineHost ops `locks`/`lock`/`fund`/`drain`,
  `runAct` under locks, both guest languages, helper `allowed`, `lib/v2-agents/src/locks.ts` lockInfo/lawDraw),
  #1084 and #1086 (docs only: locks.md §0 and owner decisions 47–48, verbatim). **built**. Nothing on develop calls the
  lock code: the game behaves as before.
- Unmerged branch `claude/locks-server` (no PR): room setting `locks` (overridesV, game settings, lobby, rooms.ts zod,
  configure-form question), table `v2Locks`, `convex/v2/locks.ts` + `lockWire.ts`, tick passes locks and records
  `input.lockSeen`, commit re-runs each act under `lockedAct`, decay sweep, retirement ends locks, events of kind
  `lock`, public query `v2/locks:ofObject` with an R8 row, `artifacts/engine/test/v2-locks.test.ts`. **built** before a
  rebase (live test passed; engine unit, player-web, affordances, game, query-cost and commit-clause suites passed);
  after the rebase onto develop (~01:56 UTC 16 Nov) the live test saw no acts at all. Unexplained: probably a stale
  local dev engine (**guess**).

## 3. Unfinished plan (concrete next steps)
1. Follow owner decision 48: delete the predicate language (parse/canonical/plainWords/informationContent in v2-core
   locks.ts; lockInfo/lawDraw in v2-agents). Make a predicate a program in the agent sandbox: `check(state) → bool`, run
   with a step cap, deterministic, no other-object reads.
2. Complexity = the agent rules (program description length + information read). Create fee = rate_c × complexity;
   upkeep = rate_u × complexity per world second; both room settings with configure questions.
3. Keep `lockedAct` (funds/drains → each call checked → new locks on the reached state), the act order, the lazy upkeep,
   the events and `lockSeen`: they carry over. Swap only the predicate check and the pricing.
4. Re-verify `claude/locks-server` against a freshly restarted dev engine, then merge it behind `locks`.
5. Still to build: lock.list/create/fund/drain/check affordances (by hand, from the player's store), ready-made example
   predicates (prime y-intercept, gradient −2, floor on the intercept), a table-harness option for the competitive
   sessions, and a short-decay hook for browser tests.

## 4. Obstacles and lessons the docs do not already say
- Under π's heavy-tailed integer code, a floor on a large value carries little information: `si.c >= 1013` measured
  7.8 bits while the state c = 1013 reads in ~512 bits. So law-mass pricing makes floor locks very cheap (**seen
  narrowly**, whole-number lines). Measured: `si.m = -2` 5.1, `si.c is prime` 3.9, `tri.area is square` 5.8 bits.
- Floors near small or negative c carry ~0.1–1 bit, so locks there decay very slowly. The live test needed a 0.02
  opening amount for decay to show within a minute (**seen narrowly**).
- A predicate checked on every call (not only at the act's end) is what makes "a higher prime in a single step" hold.
  "Step" = one call is my reading, not the owner's (**guess** at intent).
- Lock ops in a tick can be renumbered or clipped at commit (another act got there first). The branch records what was
  applied and marks the act `charged`, so re-execution skips it, as for other overridden acts.
- A Node action (tick.ts) must not import a Convex file that defines queries: pure helpers went into `lockWire.ts`.
- A short `fullChargeSeconds` override starves summons (capacity = power × fullCharge), so it cannot speed decay in tests.
- Rebasing onto a busy develop needs `pnpm install` before typecheck. The Python sandbox needs
  `pnpm --filter @workspace/v2-sandbox setup:python && build:python` before the agents' tests.
- Code review found real bugs, worth keeping as tests: an `onlyIfBetter([])` act dropping lock changes, and decayed
  unswept rows hiding live locks behind a page limit.

## 5. Obsolete after the scoring rebuild of 16–17 Nov
- The information-content pricing (law-mass estimate) and the predicate language are obsolete by owner decision 48
  regardless (**built** knowledge).
- If energy became "bits of surprise" and utilities one number, the fee/upkeep units and `lockSpend` accounting beside
  `W + βW²` likely need re-deriving. The commit clause and othersAfter interplay may differ too (**guess**: I did not
  see the rebuild).
- The move-refusal path and act order are independent of scoring and should survive (**guess**).
