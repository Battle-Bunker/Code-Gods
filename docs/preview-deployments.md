# Preview deployments

A preview is a separate copy of the whole app (its own Convex deployment, its own URL, empty data) built from one
branch, so you can try a branch without touching dev. The index of what there is to try: `docs/design-explorations.md`.

## Once (about five minutes)

1. **Preview deploy key.** Convex dashboard → the Code Gods project → **Settings** (project settings, not a
   deployment's) → **Preview Deploy Keys** → **Generate Preview Deploy Key**. Copy it.
2. **Two GitHub secrets.** GitHub → the repository → Settings → Secrets and variables → Actions → **New repository
   secret**:
   - `CONVEX_PREVIEW_DEPLOY_KEY`: the key from step 1.
   - `PREVIEW_SIGN_IN_CODE`: a passphrase you choose, at least 12 characters. You type it to sign in on a preview.

Nothing to change in the Google console. Until `CONVEX_PREVIEW_DEPLOY_KEY` exists the Preview workflow does nothing.

Optional secrets: `PREVIEW_ANTHROPIC_API_KEY` and `PREVIEW_OPENAI_API_KEY` (without them a preview has no AI players
and no assistant), `CONVEX_TEAM_ACCESS_TOKEN` (Convex dashboard → team settings → Access Tokens; lets a preview be
deleted the moment its pull request closes).

## Try a branch

- **A branch with a pull request:** add the label `preview` to the pull request (the first time, type `preview` in
  the label box and choose "Create new label"). About 5 minutes later a comment on the pull request gives the URL.
  Every later push to the branch updates the same preview: same URL, data kept.
- **Any branch:** GitHub → Actions → **Preview** → **Run workflow** → type the branch name. The URL is in the run's
  summary (and on the branch's pull request, if it has one).

**Sign in:** press Sign in on the preview, type the passphrase, pick a player. **Ada Admin** is an admin (sees the
admin-only setups); Alice, Bob, Carol, Dan and Erin are ordinary players. To play several seats, use a private
window or another browser profile per player.

**Remove it:** take the `preview` label off, or close or merge the pull request (or Run workflow with "remove"
ticked). Without `CONVEX_TEAM_ACCESS_TOKEN` the preview simply stops being updated and Convex deletes it by itself;
to delete it at once: Convex dashboard → that preview deployment → Settings → Delete deployment.

## What differs from dev

- **Data starts empty**: no rooms, no players, no history. The system setups, calibration tables and the Python
  runtime are loaded, as on dev.
- **Sign-in is the passphrase page, not Google.** Players are the six test players above, not real accounts.
- **No AI provider keys** unless you add the two optional secrets: AI players and the assistant will not work.
- **The preview is the branch merged with the latest `develop`**, so an old branch still gets current fixes. A branch
  that conflicts with `develop` cannot be previewed until it is updated (GitHub does not run the workflow for a
  conflicting pull request; the manual run says so).

## Limits and cost (Convex's, checked 2026-11-11)

- A preview is **deleted automatically 5 days after it is created** (14 days on the Professional plan and above); the
  date can be changed per deployment in its dashboard settings. Re-adding the label makes a fresh one.
- Each preview counts toward the team's deployment limit: **40 on Free and Starter**, 300 on Professional.
- Previews are included on the free plan; their usage (function calls, storage: about 30 MB of tables and runtime per
  preview) counts toward the team's normal quota. A game left running on a preview keeps ticking like anywhere else.
- A deploy takes about 5 minutes of GitHub Actions time.

## How sign-in was decided

Google only redirects to addresses registered in advance, with no wildcards, and Convex gives every preview its own
hostname. The options:

| Option | Needs from you | Why not (yet) |
|---|---|---|
| **Passphrase page on the preview (built)** | one secret | Not your real account; anyone with the passphrase and a preview URL can sign in as a test player, admin included, on that preview only. Previews hold no real data and no provider keys unless you add them. |
| Sign in with Google through dev (Better Auth's "OAuth proxy") | a shared secret on dev and in GitHub, the Google client in GitHub secrets, new sign-in code on dev and production | Changes what dev and production run; not documented with Convex's Better Auth component; could not be tested without the keys. |
| Register each preview in the Google console | a console edit per preview | Friction every time. |
| A fixed preview address | Convex custom domains (Professional plan) and DNS | Cost, and one address means one preview at a time. |

**Risk of the built option, plainly:** the passphrase is the only lock on a preview. Keep it out of pull requests
and chat. If it leaks, change the `PREVIEW_SIGN_IN_CODE` secret; each preview picks the new one up at its next
deploy. The passphrase sign-in cannot be switched on for dev or production: their deploy stops if the variable
`PREVIEW_SIGN_IN_CODE` is ever set on them, and without that variable the sign-in pages do not exist.

## How it works (for whoever maintains it)

`.github/workflows/preview.yml`: `gate` decides deploy / remove / nothing; `deploy` runs
`npx convex deploy --preview-name <branch name, made safe>` with the preview key, asks Convex for that preview's
URL and admin key (`.github/scripts/preview.mjs credentials`), then runs `artifacts/engine/scripts/preview-setup.mjs`
against exactly that deployment: generated secrets where missing (Better Auth secret and signing keys, player JWT
keys, season salt), the passphrase, the migrations, calibration tables, system setups, runtime bundle, the static
site, a health check. The sign-in itself: `artifacts/engine/convex/auth/preview.ts` and `previewRoutes.ts`.

**Tested:** the helper scripts' logic (`pnpm run test:ci-scripts`, `test/unit/preview-*.test.ts`); the sign-in end to
end on a local backend (`pnpm --filter @workspace/engine test:auth`) and in a browser with the real app; the whole of
`preview-setup.mjs` against a local backend through the same URL + admin key route the workflow uses.

**Not tested (needs the preview deploy key):** creating a real preview with `--preview-name`; the request that asks
Convex for the preview's admin key (copied from what the Convex CLI 1.48 sends for `--preview-name`; if Convex
changes it, the "Point the following steps at the preview" step fails with Convex's message and nothing else is
touched); deleting with a team access token; the workflow's own trigger conditions on GitHub. If the first real run
fails, the failing step's name says which of these it was.
