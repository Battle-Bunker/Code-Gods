# Status: locks, the player's side (player-web), as of the 16 Nov pause

Written from the session's own context on 19 Nov, with no new investigation. Labels: **built** (made and tested here),
**seen narrowly** (read in one place, not verified further), **guess**.

## 1. The task

Build the player's side of the owner's locks (docs/engine-v2/locks.md) in `artifacts/player-web`, behind the room
setting `locks`:
- see each lock on an object in plain words, with its energy, drain and time left, and a mark in the board or list;
- create a lock (first from structured choices; changed on 16 Nov to programs, see §4), add or take energy, all priced
  before the press;
- warn while a move is composed (What if) which lock it breaks and what removing it costs;
- draw locks through the existing annotations system;
- show lock events in replay and on the end page, attributed only after the game ends.

The server, the affordances and the agent API belonged to the locks core session.

## 2. Merged and unmerged

- **Merged: PR #1068** (squash into develop, 16 Nov about 01:53 UTC). **Built.** It is not reachable in a game; nothing
  wires it.
  - `artifacts/player-web/src/panes/locks-model.ts`, tested in `test/locks-model.test.ts`: `lockTitle` (the name, else
    the program's first comment), `lastsText`, `breakLine`, `fundLine`. Taking energy away is charged to the taker.
  - `artifacts/player-web/src/panes/locks-ui.tsx`: `LocksSection`, `LockMark` (an SVG padlock with an aria-label),
    the add/take form and `LockCreate` (starters, code editor, check before pay). Props only, no data hooks.
  - `artifacts/player-web/src/components/code-editor.tsx`: the forge's language choice and code box, extracted so lock
    predicates reuse the agent editor. The forge kept its testids, and `e2e:game` passed.
  - `lib/v2-views` `ExpandedFace` takes an optional `locks` prop, and `lockMarks(locks, site)` turns each lock into
    focus marks plus one note, "Lock: <words>" (term `lock:<id>`). Locks are listed under the parts and never join the
    parts, the points tree or the moves. Agreed with the line-annotations and grid-annotations sessions; tested in
    `test/faces.test.tsx`.
  - `artifacts/player-web/locks.html` with `src/gallery/locks/main.tsx`: the components on fixtures.
- **Unmerged:**
  - `claude/locks-player`: the same commits before a rebase; stale, do not use.
  - `claude/locks-ui`: the branch PR #1068 merged from.
  - `claude/locks-wire`: never created.
  - Other sessions' related branches: `claude/e2e-locks` (Parity C's draft e2e) and `claude/locks-agents` (core's agent
    API). **Seen narrowly.**
  - The deploy run for #1068 on develop was never checked.

## 3. The plan not yet carried out

1. Once core's `lock.list/create/fund/drain/check` affordances landed: subscribe one query per object for lock ids and
   one per lock (R1–R9), and compute energy now in the browser with `lockEnergyAt` (energy is settled lazily, so it is
   cold data).
2. One line (`panes/object.tsx`): `LocksSection` and `LockCreate`, gated on the `locks` setting, and the face's `locks`
   prop from the lock rows' element reads.
3. What if: `text-lock-breaks` built from the `breaks` of `object.quote`/`whatIf` (the browser cannot run predicate
   programs).
4. Lines list: `LockMark` with testid `mark-locks-<number>`.
5. Run Parity C's `e2e/locks.ts` on the wiring branch before merging.
6. Replay, the end page and the lock actions in My agents were W-panels' share.

Testids promised to Parity C: those in locks-ui.tsx, plus `text-lock-breaks` and `mark-locks-N`.

## 4. Obstacles and lessons

- **The design moved under the work.** Core first landed a predicate language (`lib/v2-core/src/locks.ts`, PR #1025).
  Then the owner ruled that predicates are programs with the agents' degrees of freedom, priced by description length
  plus information read. The builder from parts was dropped. **Seen narrowly** (relayed by the coordinator).
- **named-symbols rule.** `artifacts/player-web/test/named-symbols.test.ts` fails any pictograph (🔒) in player-facing
  source unless a title or aria-label sits on the same line. Mark notes cannot carry one, so write the word "Lock".
  **Built.**
- **House number format.** `num` always shows 2 decimals ("120.00 energy"); write tests against that. **Built.**
- **Tooling.**
  - After a pull that adds a package, run `pnpm install --frozen-lockfile`, or tests fail with ERR_MODULE_NOT_FOUND.
  - Typecheck with root `pnpm run typecheck`; a per-package `tsc` fails on project refs.
  - Force-push after a rebase was refused by the permission classifier; push to a new branch instead.
  - `code-review` with no target diffed far too much; pass `origin/develop...HEAD`.
  **Built.**
- **No CI on PRs**, only the deploy on develop. **Seen narrowly.**

## 5. What the 16–17 Nov scoring rebuild made obsolete (guess)

- Anything that prices locks in "bits of information under the stationary law" (`informationContent`, `lockFee`, and the
  `info` fields shown in `LockCreate` and `LocksSection`) probably changes, if energy became bits of surprise. The
  components take numbers as props, so the wording may survive.
- The face's `locks` prop and `lockMarks` do not depend on scoring and should survive.
- The predicate language in `lib/v2-core/src/locks.ts` was already superseded by programs before the pause.
