# Connect Claude to Code Gods

Claude plays as **you**, in **one room**, with the permission you approve (`read` < `act` < `owner`). It
reaches the engine through MCP at `https://<dep>.convex.site/mcp` (locally `http://127.0.0.1:3211/mcp`).
Every connection is a credential on the engine UI's "Your player apps" list, revocable at once.

## claude.ai (custom connector, OAuth)

1. Join the room on the engine site first (`https://<dep>.convex.site/`).
2. In claude.ai: Settings → Connectors → Add custom connector. URL: `https://<dep>.convex.site/mcp`. Leave
   the OAuth client fields empty: Claude registers itself (dynamic client registration).
3. Claude opens the engine's `/connect` page. Check the client name (self-reported) and the return host
   (`claude.ai`), pick the room and the permission (you may lower what was asked; `owner` needs the
   room's owner and an extra consent), and approve.
4. Ask Claude to call `whoami`, then `get_rules` and `get_observation`.

The connection lasts until you revoke it, or 30 days without use. Access tokens last 60 minutes and
refresh automatically.

## Claude Code (device credential)

Get a room credential with the device flow (see `docs/room-assistant.md`), keep it in your environment
as `CODE_GODS_CREDENTIAL`, then:

```sh
claude mcp add --transport http codegods https://<dep>.convex.site/mcp --header "Authorization: Bearer ${CODE_GODS_CREDENTIAL}"
```

`x-api-key: cgc_…` works too. Claude Code can also use the OAuth flow: add the server without the header
and run `/mcp` to authenticate; the browser opens `/connect` as above (loopback redirect).

## What Claude can do

`tools/list` shows only what the grant allows:

- **read:** `whoami`, `get_rules`, `get_observation`, `get_events`, `get_trajectories`, `list_games`,
  `get_game_history`, `get_my_utility`, `evaluate_value` (your own utility only), `get_chat`, `get_receipt`;
- **act:** also `validate_agent`, `summon_agent`, `destroy_agent`, `set_ready`, `send_chat` (public!),
  `pause_game`, `wake_engine`;
- **owner:** also `get_room_state`, `get_ai_catalog`, `update_settings`, `start_game`, `resume_game`,
  `end_game`, `add_ai`, `remove_ai`.

Claude sees exactly what you see: your own scores and utility, peer aggregates, never another god's.
Tool results mark game data `untrusted`: chat and agent sources come from other players.

To disconnect, revoke the connection on the engine UI (room page → "Your player apps"), or remove the
connector in Claude.
