# Common rules for every builder subagent (read fully)

Repo: /home/user/Code-Gods (pnpm monorepo; Convex engine in artifacts/engine, web app in artifacts/player-web, libs in lib/*).
Read first: CLAUDE.md, artifacts/player-web/AGENTS.md, docs/production-readiness-backlog.md §3 and §2.9, and
.claude/skills/code-gods-testing/SKILL.md + .claude/skills/selective-testing/SKILL.md.

Context: a persona study found first-time players cannot make a first scoring move or understand the score.
Goal of the whole effort: a brand-new player goes from creating a room to seeing their own agent make a scoring
move and understanding the score change in under two minutes, and reaches the end of a first game in about five.
The game stays about writing small agents.

## Shared working tree: several agents edit this same checkout at the same time
- Edit ONLY the files in your ownership list (plus new files you create, plus tests for your change). If you need a
  change in someone else's file, make the smallest possible edit and list it in your report, or describe it for the lead.
- NEVER run git commands that change state (no commit, stash, checkout, reset, rebase, branch, add, push, worktree). Read-only git is fine.
  The lead commits and pushes.
- Other agents' half-finished edits may break a typecheck or a test in files you do not own: ignore those, do not fix them, mention them.
- The local engine is ALREADY running (do not start or stop it; do not run `test:auth`, which needs it stopped):
  cloud http://127.0.0.1:3210, site http://127.0.0.1:3211. `convex dev` watches artifacts/engine/convex and re-pushes on save.
  Baseline user-study walks are running against it until 11:30 UTC: do NOT save any change under artifacts/engine/convex/ or to
  lib code the engine bundles (lib/game-core, lib/game-types, lib/game-utilities existing files) before 11:30 UTC (`date -u`).
  New files, tests and artifacts/player-web edits are fine at any time (the site walkers use is a static snapshot).
- Do not run `pnpm --filter @workspace/engine run deploy-static` (the lead does, between walks). Do not run the whole `test:game`,
  the multi-client `e2e`, or `playwright install`.
- Siblings on other branches are editing: the Objects panel and object views (`src/core/panels/objects.tsx`, lib/object-views), the leaderboard
  (`race.tsx`), the "My agents" energy meter and power-share control (add lines, do not restructure), mutators on the default board
  (`add(cell,k)` may replace `set` for numbers), and the default rule pool (eight beginner families: mirrormancer, magic_eighteen,
  opposite_nines, two_pair, spread_three, strangers, leapfrog, crosswise_threes; they may not exist on this checkout yet). Keep diffs
  in those areas minimal so rebases are easy.
- Convex read rules (CLAUDE.md): do not change how pages read data beyond what a fix needs; no new integrated page queries. Schema changes
  follow the widen/migrate/narrow rules; avoid schema changes if you can.
- Tests first (test-driven: write the failing test, see it fail, make it pass), at the cheapest layer. Run only the test files you touch,
  individually. Engine live tests: from artifacts/engine,
  `node --experimental-transform-types --disable-warning=ExperimentalWarning --test test/<file>.test.ts`.
  Known flake to ignore: game-deploy-survival "pinned tables".
- Copy style: plain words a non-programmer understands; no em dashes; use they/them for people. No model names anywhere.
- Deadline: finish and report by the time given in your brief. Ship something small and working rather than something large and unfinished.
  If you run out of time, stop at a consistent state and say exactly what is done and what is not.

## Final report (your last message; the lead reads only this)
1. What you changed, file by file (one line each), including any file outside your ownership.
2. Tests added and the exact commands you ran with pass/fail counts.
3. Anything unfinished, unverified, or that the lead must do (e.g. e2e to update, copy to check).
Keep it under 40 lines.

## Round 2 additions (12:00 UTC)
- The "11:30 rule" is gone. New rule: live engine tests (`test/game-*.test.ts`) end every game on the shared local engine when a test
  file finishes, and the machine has 4 cores with ONE agent sandbox worker per language. Run live engine tests only until 12:35 UTC,
  one file at a time, never a whole suite; after 12:35 UTC run nothing heavy (no live tests, no sandbox unit tests such as
  test/unit/example-agents.test.ts, no builds, no Playwright) because timed persona walks are running. Unit tests of single small files and tsc are fine.
- Vocabulary is fixed: `@workspace/ui-kit/core` exports SCORE_WORDS / SCORE_LINES: "rule score" (what the goal card counts), "✨ rarity"
  (the only thing "bits" names), "points" (leaderboard), "⚡ energy".
- Report deadline for round 2: 12:35 UTC.
