---
name: Room assistant trust boundary
description: Human delegation, workspace trust and live authentication test limits.
---
The room assistant is the same approving human, not an AI competitor or a verified
model/workspace identity. Same-OS-identity editors and processes are trusted.

**Why:** The user explicitly scoped this as human delegation and excluded isolation
from other workspace editors, host delegation and persistent renewal.

**How to apply:** Keep labels self-reported, grants room-bound and short-lived;
never imply the bridge proves which model or chat made a command.

Synthetic browser login helpers may not override this project's fixed Replit OIDC
discovery endpoint.

**Why:** A browser pilot reached the real Replit sign-in screen despite setting
synthetic claims. Fixture tests alone cannot demonstrate a real browser approval.

**How to apply:** Report the live-auth blocker honestly; do not extract cookies or
weaken authentication to make a pilot pass.
