---
name: Code Gods product intent
description: Standing product constraints for the game and player environment.
---
Code Gods aims to elicit human technical understanding through political negotiations about executable transformations, despite unrestricted frontier AI assistance. Players use the Replit developer interface and may freely modify their client and analytics with Agent during play.

**Why:** The user wants technical fluency to be causally important to negotiation, not artificial limits on AI assistance.

**How to apply:** Keep server authority separate from freely customizable player clients in the same repo. The server UI is a common display and owner control panel, not a player gameplay editor. Video-call politics is external and out of scope.

Individual opponents' object utilities are not directly shared: clients receive their own utility, the sum of other gods' utilities and their product (the score). Public leaderboards show player total scores.

**Why:** The user explicitly specified aggregate-only opponent information.

**How to apply:** Preserve these disclosure boundaries throughout events, snapshots, history and analytics; do not claim aggregate values prevent mathematical inference.

The user approved sandbox-compatible computational libraries for the MVP: supported Python computational modules and TypeScript's ECMAScript built-ins, with documented exclusions and no host access.

**Why:** Full native standard-library compatibility would require additional isolated execution infrastructure.

**How to apply:** Do not expose Node, browser or server capabilities to game agents. Publish the actual tested runtime/module contract rather than promise all standard-library APIs.

Require at least three players per game; additional slots can be populated by autonomous AI players. All players, including AI, can participate in a global public chat channel; no private chats are allowed.

**Why:** The user explicitly added these requirements.

**How to apply:** Enforce the minimum on the server, distinguish AI identities from Replit human identities, and give bots the same information and action permissions as human players. Do not implement private messaging.

Use parallel subtasks for this project; the main agent should act as coordinator and remain responsive.

**Why:** The user explicitly requested this working arrangement.

**How to apply:** Delegate implementation aggressively with clear file ownership and contracts. The user reiterated this after the main agent took on too much implementation; retain coordination and final integration checks.

Implement persistence with Replit's built-in PostgreSQL from the start.

**Why:** The user explicitly requires this database for Code Gods.

**How to apply:** Keep authoritative persistent state in the project's built-in PostgreSQL throughout server and client integration; do not substitute an in-memory-only or external database.

Rooms do not have names. They are identified by a short code derived from their GUID.

**Why:** The user explicitly corrected the room-name field and reiterated this requirement.

**How to apply:** Do not introduce room-name inputs, API properties, or display titles; use the GUID-derived short code.

Show a room's creation date and owner prominently alongside its ID wherever rooms are listed.

**Why:** The user explicitly requested these identifying details.

**How to apply:** Preserve this information in any future room-list surfaces without introducing room names.

Private development-preview access is separate from Code Gods authentication. The user confirmed that granting an additional account editor access allowed it through the preview gate.

**Why:** Replit's preview permissions can block a player before the game's login runs.

**How to apply:** Distinguish preview access failures from game authentication failures. Editor access is a development workaround, not a player permission model: it also grants source-code editing access.

Private publishing can block headless client device approval before Code Gods authentication runs.

**Why:** A live connection attempt was redirected to Replit's `__replshield`; following that redirect produced misleading header/referrer errors instead of a game API response.

**How to apply:** Inspect redirects without following them when connecting a new published server. For the no-static-secret player protocol, use public deployment visibility with the app's own Replit login and room authorization; changing visibility requires the owner's decision.

Use full names from verified Replit identities to label human players, not just first names.

**Why:** First names do not sufficiently distinguish the game's players.

**How to apply:** Combine given and family names for display while preserving Replit subject IDs as the actual identity keys.

Grammar, utility-selector and complexity-function options are always pre-authored in deployed code.

**Why:** The user explicitly requires dropdown choices rather than arbitrary identifier text inputs.

**How to apply:** Populate selectors from the server's supported options, filter compatibility, and reject unknown identifiers server-side.

Fund Code Gods AI players through user-supplied Anthropic or OpenAI API keys, not Replit-managed inference credits.

**Why:** The user selected direct provider billing and subsequently requested both Anthropic and OpenAI model choices.

**How to apply:** Keep the key in server-side Secrets, enforce room usage budgets, and do not silently fall back to a Replit-billed provider.

AI-player templates are persistent admin-editable named records with provider/model selection and prompts capped at 10,000 characters; Sonnet 5.5 is the requested default.

**Why:** The user wants to author agents after deployment, not keep fixed code-only personalities.

**How to apply:** Gate authoring by an environment-configured verified-email allowlist. Seed defaults once and preserve edits/deletions across restarts. Do not save allowlisted personal emails in memory.

Deploy on Autoscale with at most one server instance. Close connections after 30 minutes without human activity.

**Why:** The user requires Autoscale for affordable compute and explicitly ruled out multiple simultaneous instances.

**How to apply:** Do not require Reserved VM or build distributed coordination. Centralize inactivity handling; heartbeats, bots, and passive polling must not prevent sleep. Preserve committed state across restarts and offer explicit wake after idle.

Interaction speed is an upper limit; perform interactions as fast as available capacity permits, parallelized over four cores.

**Why:** The user rejected recovery pauses caused by trying to catch up to a fixed interaction schedule during the pilot.

**How to apply:** Do not accumulate interaction debt or stop the game for throughput overload. The interaction cap defaults to 100 Hz and is configurable up to 1,000 Hz; the user explicitly corrected confusion between default and maximum. Keep concurrent transformations consistent and benchmark higher rates for headroom.

Agent interactions have a configurable compute budget defaulting to 5 ms; compilation and interpreter startup must not be repeated inside that hot path.

**Why:** The user rejected hundreds of milliseconds of isolation overhead per simple function call and wants thousands of interactions per second. Time and randomness are explicitly allowed read-only capabilities.

**How to apply:** Measure whole-engine throughput, not only function timing; separate preparation cost from guest computation and retain enforced resource/capability limits rather than relying on Python-level name hiding.

Queue database writes asynchronously with bounded buffering and batching rather than blocking every interaction on its own database write.

**Why:** The user explicitly requested high-throughput event-system persistence alongside a configurable interaction-rate cap.

**How to apply:** Preserve write order, flush on graceful shutdown, apply backpressure instead of unbounded queues, and clearly distinguish acknowledged durable actions from any uncommitted interaction window.

Call them **utility functions**, never "value functions". "Value" means an object's value (the T instance).

**Why:** The user explicitly wants the technical concept of utility invoked.

**How to apply:** Use utility/ownUtility/othersUtilitySum/score in code, protocol, UI and docs.

Utility functions must be heterogeneous, simple to state, and accompanied by a plain-language incentive summary. There is a large repertoire of unrelated families per object type (lib/game-utilities). Assignment is pure random per god for now ("Divine Lottery"), behind a selector interface for future balancing.

**Why:** The user rejected a uniform schema with one varying parameter, and rejected complicated rule code with validation boilerplate. Fairness is meant to come from many games, not in-game balancing (for now). Beginners must understand their incentives without reading code.

**How to apply:** New families need short Python/TypeScript bodies with no input validation, a summary, and an exemplar reaching ≥0.99. Random spawned objects must score near zero (mean <0.02); near-1 utility needs rare, structured values. The tests in lib/game-utilities enforce this.

Every object in a world is unique. A transformation onto any existing value (including the object's own) fails entirely, and spawns redraw.

**Why:** The user explicitly requires uniqueness.

**How to apply:** Enforce it in the engine's commit path and spawner, not in clients.
