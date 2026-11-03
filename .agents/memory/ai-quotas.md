# AI quotas, no approvals (owner's rule, 2026-11-03)

- No approval step for AI token use. Each room has two configurable per-game token quotas, default 300,000 each:
  `aiQuota` (all AI players of a game together) and `assistantQuota` (each player's assistant). 0 = none.
- The owner sets them (`rooms.setAiQuotas`, owner command "quotas", MCP `set_ai_quotas`), also during a game.
  The USD ceilings and call rate limits stay.
- AI (AI seats, assistant turns) only in rooms whose owner is an administrator (`ADMIN_EMAILS`), for now. The gate
  runs when tokens are spent, not at room creation.
