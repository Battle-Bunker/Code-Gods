---
name: Room assistant trust boundary
description: Human delegation through a room credential in the environment's secret store, workspace trust and live authentication test limits.
---
The room assistant is the same approving human, not an AI competitor or a verified
model/workspace identity. Same-OS-identity editors and processes are trusted.

**Why:** The user scoped this as human delegation and excluded isolation
from other workspace editors. They subsequently explicitly requested full room-owner
delegation, including configuration, game start and playing as themselves, and onboarding
that stores the scoped credential in Replit Secrets.

**How to apply:** The assistant uses a room-scoped, revocable credential (`read`, `act` or
`owner`; up to 7 days) from `pnpm player connect`, held as the secret
`CODE_GODS_CREDENTIAL` (the environment's secret store, e.g. Replit Secrets, or `.env.local`) and
exchanged for 10-minute JWTs on every call. There is no
persistent bridge or daemon: each `pnpm player assistant` command is one stateless engine
call. Revocation is from the engine UI's player page or `pnpm player assistant disconnect`,
and takes effect on the next call. Owner grants still need the current room owner's
explicit consent, and read/act grants never inherit owner powers; a stronger grant is a new
`connect`, never an upgrade. Labels are self-reported: never imply the credential proves
which model or chat made a command. Never print, paste or commit the credential.

Humans sign in with Google only (Better Auth served by the Convex deployment). Synthetic
sign-in helpers may never reach a production deployment.

**Why:** An earlier browser pilot reached the real provider's sign-in screen despite setting
synthetic claims. Fixture tests alone cannot demonstrate a real browser approval.

**How to apply:** The stand-in OIDC server (`scripts/fake-oidc.mjs`) is a Better Auth
generic OAuth provider "fake" that exists only when `CODE_GODS_TEST_FIXTURES=1` or
`CODE_GODS_DEV=1` AND `CODE_GODS_FAKE_OIDC_URL` are set, which only
`pnpm --filter @workspace/engine dev` does on a local deployment; production sets none of them
and offers Google alone. Admin needs a verified Google email on `CODE_GODS_ADMIN_EMAILS`
(the fake provider counts only under fixtures). Report the live-auth blocker honestly; do not
extract cookies or weaken authentication to make a pilot pass.
