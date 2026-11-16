# Locks: hand-over (16 November 2026, Melbourne time)

Branch: `claude/locks-programs` (from `develop` at 2ef3ba28). **Nothing is merged; nothing on this branch has passed a
test run.** The session was stopped part-way through part 1 of five. Read `docs/engine-v2/locks.md` §0 first (the
owner's words); §2, §3 and §5 of that file still describe the deleted predicate language and are to be rewritten.

## What is on this branch

Written, not yet run green:

- `lib/v2-core/src/locks.ts`: rewritten. The predicate language, its parser, plain words and the law-mass information
  content are **deleted**. What is left is pure and synchronous: `LockProgram` (`language`, `source`, `words`),
  `lockProgram` (shape check), `PredicateRunner` (injected), `lockFee` / `lockRate` (from `LockRates`),
  `applyLockChanges`, `lockRefusal`, `actRunner` (per-act memo and cap), `lockedAct`, `commitLocks`.
- `lib/v2-agents/src/predicates.ts` (replaces `locks.ts`): `predicateRunner`, `predicateBoxes`, `predicateBits`,
  `PREDICATE_LIMITS`, `READY_PREDICATES` (prime y-intercept; gradient equals a value; a floor on the y-intercept; both
  languages).
- `lib/v2-sandbox`: `createSandbox({ execution: "inline" })` now returns an `InlineSandbox` with `actSync` (the same
  body as `act`, synchronous). Guest `offer.lock(source, amount, words)` in both languages; `guest.gen.ts` regenerated;
  `agent-api.ts` `LocksReply` / `LockReply` changed.
- `lib/v2-agents/src/host.ts`, `act.ts`: on the new core. `ActRecord.lockChecked` is new.
- `lib/v2-agents/test/locks.test.ts`: rewritten for programs (tests first). `lib/v2-linear/test/locks.test.ts` (the
  language's tests) deleted.

State of checks: root `pnpm run typecheck` last failed on one line (`TextEncoder` in v2-core, since replaced by a
character count; **not re-run**). The other errors in that run were the cascade from v2-core not building. The lock
tests have **never run**: this container has no Python bundle (`lib/v2-sandbox/dist/python-runtime.bin.gz`). Build it
once: `pnpm --filter @workspace/v2-sandbox setup:python && pnpm --filter @workspace/v2-sandbox build:python`.

## Decisions made, and why

1. **How a predicate runs.** It is an agent program whose entry is `predicate(offer)` returning true or false. The
   runner appends a small `agent(offer)` wrapper (`ENTRY` in predicates.ts) that maps true to `[]` and false to `null`,
   so the sandbox and both engines are unchanged. Seed fixed at "0"; `usedRandom` is a failure. Its host
   (`PredicateHost`) answers only `view` and `element`, through an `EngineHost`, so reads are priced exactly as an
   agent's; every other request is an error (a predicate has no rule, energy or moves, and must be a function of the
   object's state alone for replay).
2. **Why synchronous.** An agent's `quote` is a synchronous host call, and a truthful quote must check locks, so a check
   runs inside another act. Hence `actSync` and **separate** inline sandboxes for predicates (`predicateBoxes`): the
   Python engine is one WASM instance restored per act and is not re-entrant. Not yet verified: QuickJS re-entrancy when
   the agent and the predicate are both TypeScript and share the `getQuickJS` singleton module (the tests cross the
   languages; add a same-language case, and if it fails give predicates their own module).
3. **Complexity** = `summonBits(language, source).bits` (the function that prices agents, on the author's source, the
   wrapper excluded) + the read bits of the run on the state the lock is made on. Fixed on the lock at creation. The
   vocabulary was deliberately not changed (adding `predicate` would shift every agent's price), so the entry name costs
   its spelling, about 47 bits, on every lock.
4. **Prices.** Fee = `createPerBit` × bits (burned, the opening amount on top); upkeep = `upkeepPerBit` × bits per world
   second, from the lock's own energy. Two room settings, not yet added: intended names `lockCreatePerBit` (default
   power ÷ 64, the summon price's scale: 0.0625 at power 4) and `lockUpkeepPerBit` (default the create rate ÷
   fullChargeSeconds, so a lock re-pays its fee once per full-charge period). Resolve them into the game's settings at
   start so events and replay carry them.
5. **A program that errors** (throws, passes its limit, returns a non-boolean, uses randomness, asks for more than the
   object). At creation: no lock, and the act fails. On a later check: it counts as **not met**, so the move is
   refused. This cannot free an object (an attacker picks the candidate state, so "error passes" would let a state that
   times out the program through), and it cannot trap one beyond what a `false` does, because a drain never runs the
   program.
6. **Bounds on the move path.** Source ≤ 1,024 characters (so `locks()` with 8 sources fits one 16 KiB host message); 8
   locks an object; per check 20,000 steps, 8 host calls, 250 ms backstop (`PREDICATE_LIMITS`); 64 distinct (program,
   state) checks an act, quotes included (`actRunner`: it counts checks asked for, not programs run, so it is the same
   on every machine; past it a check fails and the move is refused); a process-wide memo in `predicateRunner`.
7. **The commit runs no program.** The tick (Node) runs every check, in order, on its running view. The act record
   carries `lockChecked` (the locks its calls were checked against) and `locks` (changes as applied). The mutation calls
   `commitLocks`: funds and drains again (drains re-clipped), then refuses a move if any lock live now is not in
   `lockChecked` (made or refilled since), then appends new locks renumbered. A skip that makes a lock must also match
   the object's version (not yet written).
8. **Humans never move objects** (`object.quote`: "agents make the changes"). So by hand there are only lock
   operations: `lock.create` and `lock.check` must be actions (they run the sandbox, like `agent.summon`); `lock.fund`
   and `lock.drain` mutations; `lock.list` a query. The move warning needs an action too (planned: `lock.test`, object
   and calls in, the locks that refuse out), because `object.quote` is a query.

## Not started

- Part 1 remainder: run and fix the tests; `fake-host.ts`, `primer.ts` and helper docs for the new `offer.lock`;
  rewrite locks.md §2, §3, §5, §7.
- Part 2, server: port `origin/claude/locks-server` (0582c3ca) onto the new core. `v2Locks` needs `language`, `source`,
  `words`, `programBits`, `readBits`, `bits` in place of `predicate` and `info`; `recheck` becomes `commitLocks`; the
  tick builds a `predicateRunner` (a second sandbox per language in `runtime.ts`) and records `lockSeen` without
  sources (replay joins them from the `lock` create events); re-verify `test/v2-locks.test.ts` with a program agent.
- Part 3, affordances; part 4, screens (`origin/claude/locks-player` holds the unwired components, written for the
  language: `words` now comes from the author, and the create form picks from `READY_PREDICATES` or the code editor);
  part 5, the browser test (`origin/claude/e2e-locks` is a draft).
- locks.md, to report rather than patch: (a) a lock can attack (knock an object, then lock it where it fell); (b) upkeep
  by complexity alone defends any height at a flat fee ("at least 1,000,000" is as short as "at least 10"; the read
  bits grow only with the logarithm of the value). The option within the owner's words: upkeep as a rate on the energy
  held, the rate proportional to complexity. Both are conjecture until played.

## How this could be wrong

- Fixing the read bits at creation lets a program read little where it is made and more elsewhere. A cap on later reads
  was rejected because a floor lock reads more bits at higher values and would then refuse upward moves.
- The 250 ms backstop is wall time: a check that hits it is not replay-exact. The step limit is meant to bind first.
- The per-check overhead (a fresh QuickJS runtime and the guest library each run) is unmeasured.
