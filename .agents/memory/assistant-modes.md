# Assistant modes, no per-action approvals (owner's rule, 2026-11-03)

- No approval card for any assistant action. The player picks one mode per room (kept across its games), named exactly:
  **Autopilot** (plays on its own, without being prompted), **On request** (the default: acts, mutations allowed, only
  in response to the player's messages) and **Read-only** (answers questions with read-only tools; never mutates).
- Read-only is enforced server-side in the tool dispatch (assistant/step.ts, rules.ts allowedInMode), not just the prompt.
- Autopilot: a scheduled tick chain per (room, player) (assistant/autopilot.ts), restarted on game start/resume; turns
  in the game's thread labelled "(autopilot)", paid from the player's per-game assistant quota (stops at its last tenth),
  stopping at game end, idle parking and the admin-only AI gate; no wake_engine. A player's message preempts it.
- Owner powers stay the credential's grant (read/act/owner), orthogonal to the mode.
