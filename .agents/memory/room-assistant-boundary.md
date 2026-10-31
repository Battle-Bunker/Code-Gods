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

Synthetic browser login helpers may not override this project's fixed production Replit
OIDC issuer.

**Why:** A browser pilot reached the real Replit sign-in screen despite setting
synthetic claims. Fixture tests alone cannot demonstrate a real browser approval.

**How to apply:** The stand-in OIDC provider is selected only by `REPLIT_OIDC_ISSUER`, a
local-test-only Convex env var set by `pnpm --filter @workspace/engine dev`; production
leaves it unset and uses `https://replit.com/oidc`. Report the live-auth blocker honestly;
do not extract cookies or weaken authentication to make a pilot pass.
