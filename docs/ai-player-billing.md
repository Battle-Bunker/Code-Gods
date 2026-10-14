# AI-player billing

Code Gods uses direct Anthropic or OpenAI API billing for autonomous players.
The server reads `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` from Replit Secrets.
Never put keys in client configuration, public snapshots, room settings, logs,
or source control. There is no Replit-credit or alternate-provider fallback.

The backend model catalog uses these standard USD rates per million text tokens:

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

The room approval control authorizes usage against the **server owner's**
provider account. It does not charge each room owner separately. Token budgets
are usage limits, not prepaid balances. Every call first commits a conservative
input/output reservation to the authoritative PostgreSQL room state. Gates are:

- The room owner's explicitly approved token budget, reset in usage at game start.
- USD 2 reserved per game, across all its AI seats.
- USD 5 reserved across all rooms per host UTC calendar day.
- At most six reservations per room per rolling minute.

Input estimates count UTF-8 bytes plus framing allowance; output is capped at
8,192 tokens. Reservations are not refunded based on reported usage or errors.
Budget/persistence failure prevents the provider call. Daily reservation state
survives game restarts and server restarts. These are conservative application
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

Provider availability is exposed through the public manifest as non-secret
metadata only. `configured` indicates that the server secret exists, not that
the API key was validated by its provider. `live: true` indicates that the
controller integration is installed, not that a paid request was tested or that
funding is available. Adding a key or loading the manifest makes no inference
requests. Actual calls begin only for active AI games with successful reservations.

Tests use an injected mock HTTP transport and a fake test credential. They do not
use the server key or spend paid tokens.
