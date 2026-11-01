# Code Gods in a claude.ai artifact

A claude.ai artifact page can be a Code Gods client. It reaches the engine through the player's **Code Gods
connector** (a claude.ai custom connector pointing at `https://<deployment>.convex.site/mcp`), so it acts as
that player, in the one room and with the one permission they approved on the engine's `/connect` page.

It is a **slow dashboard plus click-driven actions**, not a 1 Hz console: data refreshes about every 30
seconds, and every action is an explicit click. To change the page, ask Claude: it edits the HTML and
republishes the artifact, and the open page updates in place.

| File | What it is |
|---|---|
| `template.html` | The page source: markup, styles and the app script. It imports `core.js`. |
| `core.js` | The page's pure logic: view model, error classification, command retry state machine, Ask prompt. |
| `build.mjs` | Inlines `core.js` into `dist/template.html`, the single file you publish (`dist/` is not committed). |
| `probe.html` | Checks whether an artifact could also render stored panels (see [Probe](#probe)). |
| `core.test.js` | Unit tests (`node --test`). |
| `smoke.mjs`, `dev/claude-stub.js` | A browser smoke run against a local stand-in for the artifact runtime. |

## Set it up (player)

1. **Join the room** on the engine site, `https://<deployment>.convex.site/`.
2. **Add the connector.** In claude.ai: Settings → Connectors → Add custom connector. Name it **Code Gods**
   and use the URL `https://<deployment>.convex.site/mcp`. Leave the OAuth fields empty.
3. **Approve it.** claude.ai opens the engine's `/connect` page. Pick the room and the permission: `act` to
   chat, summon and set ready from the page; `read` gives a watch-only dashboard. Details:
   [`docs/connect-claude.md`](../../docs/connect-claude.md).
4. **Ask Claude to publish the page.** In Claude Code (or any session with this repo), run
   `pnpm run build:artifact`, then publish `clients/claude-artifact/dist/template.html` as an artifact with
   these capabilities (`core.manifest()` returns the same object):

   ```json
   {
     "mcp": { "servers": [{ "server": "Code Gods", "tools": ["whoami", "get_observation", "get_receipt", "send_chat", "validate_agent", "summon_agent", "set_ready"] }] },
     "sample": {}
   }
   ```

   `sample` is optional. Leave it out and the "Ask Claude" box stays hidden.
5. **Open the artifact in claude.ai.** The first call asks you to allow the Code Gods connector for this page.

If you named the connector something else, change `SERVER` in `core.js` (or the `SERVER` constant near the
top of the published page's script) and the `server` in the capabilities to that name.

## What the page does

- **Watches** `get_observation` (the first 50 objects) and `whoami` with `watchTool(…, {refetchInterval: 30000})`.
  It shows the phase and its clock, your energy, the leaderboard with your row marked, objects sorted by your
  payoff with your net bits and your peers' aggregate, your agents, and the chat tail. "Updated N s ago"
  comes from the result's `cache.storedAt`. **Refresh** calls `invalidate()`, so the watches refetch at once.
- **Acts** with `callTool` (never cached):
  - `send_chat` shows the exact message and asks again before sending, because chat is public;
  - `validate_agent` and `summon_agent` take the source from the text box, with a fresh UUID `commandId` per new
    intent and `waitMs` 45 s (below the runtime's ~130 s reply budget);
  - `set_ready` appears in the lobby and after a game.
- **Retries safely.** A command that fails with an unclear outcome (`server_unavailable`, `upstream_error`,
  `cancelled`) may have run. The page then asks `get_receipt` for that `commandId` once by itself, which is a read.
  - `received`: the command finished.
  - `pending`: still running. The page shows a **Check result** button that asks again.
  - `failed` or `not_found`: the page shows **Resend (same command)**. It resends the identical call with the
    same `commandId`, and the engine never applies a command twice.
  While a command's outcome is open (summon or validate, chat, ready), the page will not start another one of that kind. **Forget this command** clears it.
- **Handles each failure on its own.** Every runtime error code gets its own message and fix (reconnect,
  add the connector, choose one, needs approval, not allowed, transient). Denials withdraw the shown data;
  transient failures keep the last good data with its age. `approval_required` shows an **Allow and load**
  button.
- **Ask Claude** (when `sample` is declared and allowed) sends one memoryless prompt: instructions, your
  question, then the current observation JSON marked untrusted. It spends the viewer's own Claude usage.
- **Treats game data as untrusted text.** Chat, labels, values and agent sources are written by players.
  The page renders them with `textContent` only, never `innerHTML`, and the Ask prompt tells Claude not to
  follow instructions found in them.

## Limits

- **About 30 seconds per refresh at best.** The runtime clamps `refetchInterval` to a ~30 s floor and pauses
  polling while the page is hidden, catching up when it returns. There is no WebSocket or push, and the
  artifact cannot open any other network connection: everything goes through the connector.
- **Actions are explicit clicks.** The page never writes on a timer. The only unattended call is the receipt
  check after an unclear failure.
- **One room, one permission** per connector authorization. To play another room, approve the connector again.
- For real-time play (1 Hz), use the hosted client at `/client/` or a dev container.

## Customize it (instructions for Claude)

A player asks: "add a chart of my payoff over time", "show only objects where my peers disagree", "add a pause
button". Edit the page and republish to the same artifact.

- Read [`docs/panels.md`](../../docs/panels.md) for what the game data means (scoring in bits, payoff, peer
  aggregates, agents' energy and acts) and [`docs/engine-api.md`](../../docs/engine-api.md) (the MCP section)
  for the tools and their arguments.
- **Every tool the page calls must be in the manifest.** Write calls as `call("tool_name", input)`,
  `watch("tool_name", input, handler)` or `core.newCommand("tool_name", …)`, and add the tool to
  `MANIFEST_TOOLS` and to the publish call's `capabilities`. A tool outside the manifest rejects
  `not_in_manifest`. Good additions: `get_trajectories` for payoff over time, `get_events`,
  `evaluate_value`, `destroy_agent` and `pause_game` (both need a fresh `commandId` and a confirm step).
- **Keep game data as text.** Build elements with `el()` or `textContent`. A chart is fine: draw it with SVG
  or canvas from numbers, and set labels with `textContent`.
- **Reads go in watches; writes go in clicks.** A new view of the game is a `watch(...)` with
  `refetchInterval` 30 s (several sections can share one watched call). A new action is a `callTool` behind a button.
  Public or costly actions confirm first, inside the page, because `confirm()` does not work in artifacts.
- **Hold history in the page.** A chart over time can keep points in memory from each observation, or read
  `get_trajectories`, which has the whole game.
- When editing the repo copy, change `template.html` / `core.js`, run `pnpm run test:artifact`, rebuild, and
  publish `dist/template.html`. When editing a player's published page directly, the `core` block is inline
  near the top of its script.

## Probe

`probe.html` answers an open question: could an artifact render the player's **stored panels**
(`panel-runtime.js`)? The player client runs each panel's compiled code with `new Function` in a sandboxed
frame and talks to it over `postMessage` and a transferred `MessagePort`. The probe checks, in whatever runtime
shows it:

- `new Function` and `eval` in the page;
- a sandboxed (`allow-scripts`) frame from a `blob:` URL and from `srcdoc`, each with a `postMessage` round trip,
  a `MessagePort` round trip and `new Function` inside the frame;
- a Worker from a `blob:` URL;
- any CSP violation reports.

To run it, ask Claude to publish `clients/claude-artifact/probe.html` as an artifact, optionally with
`capabilities: {db: {}}`. Open it in claude.ai and read the table. With `db` declared, it also saves the results
to the store document `probe/latest`, which Claude can read back with `ArtifactData`. In a plain local
browser every check passes (`pnpm run smoke:artifact` checks that). The claude.ai result is not known yet.

## What was verified, and what was not

Verified locally:

- `pnpm run test:artifact`: 25 unit tests of `core.js` and the build. They cover the manifest against the
  registry's `tools.schema.json` and the tools the page calls, the tool inputs against their JSON Schemas,
  envelope unwrapping, every error code, the view model, the retry state machine, the Ask prompt bound, and the
  build's output evaluating to the same exports.
- `pnpm run smoke:artifact`: 13 Playwright checks in Chromium against `dev/claude-stub.js`, a local stand-in that
  follows `mcp.d.ts` and `sample.d.ts`. They cover the no-connector message, watches and rendering,
  markup-as-text, the chat confirm, an ambiguous summon or chat checking and resending the same `commandId`, validate,
  Refresh, Ask, phone width in dark mode, and the probe page.

Not verified (needs a live claude.ai check):

- the real runtime: connector consent prompts, `watchTool` cadence and replay, `cache.storedAt`, and
  `invalidate()` re-delivering to watches;
- the real engine behind the connector (the stub answers from fixtures);
- `sample` consent and streaming;
- the publish skeleton and CSP around the page;
- the probe's results inside claude.ai.
