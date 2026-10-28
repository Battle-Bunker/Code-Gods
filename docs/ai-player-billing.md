# AI-player billing

Code Gods uses direct Anthropic or OpenAI API billing for autonomous players.
The engine reads `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` from the Convex deployment's
environment variables (`npx convex env set --prod NAME VALUE`). AI seats run inside the
engine (`artifacts/engine/convex/ai`), so player apps never need a key. Never put keys in
client configuration, public snapshots, room settings, logs, or source control. There is no Replit-credit or alternate-provider fallback.

The engine's model catalog (`convex/lib/aiModels.ts`) uses these standard USD rates per million text tokens:

| Model | Input | Output |
| --- | ---: | ---: |
| `claude-sonnet-5-5` (default) | 2 | 10 |
| `claude-opus-5-5` | 4 | 20 |
| `gpt-4.1-mini` | 0.40 | 1.60 |

References: https://platform.claude.com/docs/en/about-claude/models/overview,
https://platform.claude.com/docs/en/about-claude/pricing and
https://developers.openai.com/api/docs/pricing.md.
No tools, prompt caching, extended thinking, or other separately billed features
are requested. Review model availability and rates before changing this config.

The SDK connects explicitly to `https://api.anthropic.com` or
`https://api.openai.com/v1`, never an environment-selected proxy. SDK retries are
disabled so ambiguous failures cannot silently multiply billed attempts.
Controller budget reservations remain consumed on failures and cancellations.
Requests have an abort signal, a timeout, and an output-token ceiling.

The room approval control authorizes usage against the **engine operator's**
provider account. It does not charge each room owner separately. Token budgets
are usage limits, not prepaid balances. Every call first commits a conservative
input/output reservation in a Convex mutation (`ai/seats.ts:reserve`) on the room and the
daily usage record. Gates are:

- The room owner's explicitly approved token budget, reset in usage at game start.
- USD 2 reserved per game, across all its AI seats.
- USD 5 reserved across all rooms of the deployment per UTC calendar day.
- At most six reservations per room per rolling minute.

Input estimates count UTF-8 bytes plus framing allowance; output is capped at
8,192 tokens. USD reservations are never refunded, whether the call succeeds, fails
or is cancelled. After a trustworthy provider usage report, only the unused part of
the reserved token allowance is returned to the room's token budget. A failed
reservation prevents the provider call. Reservation state is stored in Convex, so it
survives game restarts, redeploys and idle parking. These are conservative application
limits, not a guarantee about an external provider's future pricing; use provider
account spending controls too. Any eligible room owner can allocate the shared
host allowance: there is no separate host-admin approval queue for each room.

The initial library seeds `sonnet-strategist` (“Sonnet Strategist”) once.
Administrators manage named templates with a vetted model and at most 10,000
characters of strategy text. Owners select a library template via `aiAgentId`;
the definition/revision is copied into the seat and then the game's roster.
Subsequent library edits/deletion do not change those snapshots. The strategy is
appended beneath the immutable protocol/security policy, never substituted for it.
Private administrator strategy text is not exposed in public room projections.

Provider availability is exposed through the manifest (`manifest.get`) as non-secret
metadata only. `configured` indicates that the deployment's key env var is set, not that
the API key was validated by its provider. `live: true` indicates that the
controller integration is installed, not that a paid request was tested or that
funding is available. Adding a key or loading the manifest makes no inference
requests. Actual calls begin only for active AI games with successful reservations.

Tests use injected mock providers (`lib/ai-player`) or the engine's offline `mock`
provider, enabled only by the env var `CODE_GODS_AI_MOCK=1` on a local deployment.
They do not use a real key or spend paid tokens. Production must not set
`CODE_GODS_AI_MOCK`.
