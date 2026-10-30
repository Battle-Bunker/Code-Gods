# Code Gods: notes for Claude Code

## How work ships (the owner's standing instruction)

- **Ship every task all the way.** Take each requested task to a pull request into `develop` and merge
  it yourself. The owner does not review pull requests; they give feedback only on the app's behaviour
  when they test it.
- **You own code quality.** Before merging:
  - review your own diff (the `code-review` skill at an effort that fits the change);
  - fix what it confirms;
  - run every affected test suite (`.claude/skills/code-gods-testing/SKILL.md`);
  - make sure the root `pnpm run typecheck` passes;
  - make sure CI is green, if any runs.
- **Branches.** Branch from `develop` and target `develop`. Never push to or merge into `main` unless
  the owner asks.
- **Write tests as you develop:** efficient, discerning, test-first. Follow the `test-driven-development`
  skill (vendored from obra/superpowers) and this repo's `code-gods-testing` skill. Test the behaviour
  that would break, at the cheapest layer that can catch it.

## Orientation

- Product rules and history: `.agents/memory/*.md`.
- Architecture: `docs/convex-migration-plan.md`.
- API: `docs/engine-api.md`.
- Pilot and deploy: `PILOT.md`.
- Running locally (no Convex account needed): `pnpm --filter @workspace/engine dev`. It starts the official
  CLI's local Convex backend plus a stand-in Replit OIDC provider.
