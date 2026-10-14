---
name: Code Gods product intent
description: Standing product constraints for the game and player environment.
---
Code Gods aims to elicit human technical understanding through political negotiations about executable transformations, despite unrestricted frontier AI assistance. Players use the Replit developer interface and may freely modify their client and analytics with Agent during play.

**Why:** The user wants technical fluency to be causally important to negotiation, not artificial limits on AI assistance.

**How to apply:** Keep server authority separate from freely customizable player clients in the same repo. The server UI is a common display and owner control panel, not a player gameplay editor. Video-call politics is external and out of scope.

Individual opponents' object valuations are not directly shared: clients receive their own value, the sum of other values and their product. Public leaderboards show player total scores.

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

**How to apply:** Delegate isolated packages with clear contracts and retain authoritative-server integration and progress communication in the main session.

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

Use full names from verified Replit identities to label human players, not just first names.

**Why:** First names do not sufficiently distinguish the game's players.

**How to apply:** Combine given and family names for display while preserving Replit subject IDs as the actual identity keys.

Grammar, value-generator and complexity-function options are always pre-authored in deployed code.

**Why:** The user explicitly requires dropdown choices rather than arbitrary identifier text inputs.

**How to apply:** Populate selectors from the server's supported options, filter compatibility, and reject unknown identifiers server-side.

Fund Code Gods AI players through a user-supplied Anthropic API key, not Replit-managed inference credits.

**Why:** The user explicitly selected direct Anthropic billing for the game's autonomous players.

**How to apply:** Keep the key in server-side Secrets, enforce room usage budgets, and do not silently fall back to a Replit-billed provider.
