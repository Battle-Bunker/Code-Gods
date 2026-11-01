/**
 * The catalogue of EVERY public Convex function (docs/ui-redesign.md §2.1): one place that forks into the human API
 * (titles and tooltips for buttons, menus and the command palette in both apps) and the AI API (the registry's tool
 * descriptions, hence MCP, the CLI and the in-client assistant).
 *
 * `PublicFunctionPath` is derived from the generated `api` type, so a public function added without an entry here
 * fails the typecheck (a missing key), and an entry for a removed function fails too (an excess key). The runtime
 * test (test/catalog.test.ts) adds the completeness rules the type system cannot state: every player/owner entry
 * reaches the assistant through a tool or says `why` not, and has a palette command or says why not.
 *
 * Pure data: no React, no Convex server code (the api import is type-only).
 */
import type { FunctionReference } from "convex/server";
import type { api } from "@workspace/engine/convex/_generated/api";
import type { GROUPS, ToolName } from "./tools.ts";

type Paths<T, P extends string = ""> = { [K in keyof T & string]: T[K] extends FunctionReference<any, "public"> ? `${P}${K}` : Paths<T[K], `${P}${K}.`> }[keyof T & string];
/** "rooms.join" | "auth.credentials.list" | "agent.connect.pending" | … (module path with dots, then the export). */
export type PublicFunctionPath = Paths<typeof api>;
type Kinds<T, P extends string = ""> = { [K in keyof T & string]: T[K] extends FunctionReference<infer Ty, "public"> ? [`${P}${K}`, Ty] : Kinds<T[K], `${P}${K}.`> }[keyof T & string];
/** The registered kind of one public function, from the generated api. */
export type FunctionKind<P extends PublicFunctionPath> = Extract<Kinds<typeof api>, [P, unknown]>[1];

export type Audience = "player" | "owner" | "infrastructure" | "admin" | "test";
export type PaletteGroup = "play" | "view" | "room" | "owner" | "account" | "help";
export type PaletteSurface = "player" | "engine";
export type Confirm = "none" | "inline" | "summary" | "modal";
export interface PaletteSpec {
  label: string;
  group: PaletteGroup;
  keywords?: readonly string[];
  surfaces: readonly PaletteSurface[];
  /** none: run on Enter; inline: press Enter again; summary: a card first; modal: the alert dialog. Default none. */
  confirm?: Confirm;
}
export interface CatalogEntry {
  kind: "query" | "mutation" | "action";
  audience: Audience;
  /** ≤ 60 / ≤ 240 characters; a verb-first title; one plain sentence, never model instructions. */
  human: { title: string; tooltip: string };
  /** ≤ 600 characters, written for a model: what it does, when to use it, what comes back. */
  ai: { description: string };
  /** The registry tools that reach this function (through its `As` twin); [] when none. */
  tools: readonly ToolName[];
  palette: PaletteSpec | null;
  /** Required (by the runtime test) when the audience is player or owner and `tools` or `palette` is empty. */
  why?: string;
}
export const CATALOG_LIMITS = { title: 60, tooltip: 240, description: 600 } as const;

const P: readonly PaletteSurface[] = ["player"], E: readonly PaletteSurface[] = ["engine"], BOTH: readonly PaletteSurface[] = ["player", "engine"];
const NO_SELF_DRIVE = "The assistant does not drive itself; the human sends, stops and configures it from the assistant pane.";
const SUBSCRIPTION = "A live subscription a page renders; there is nothing to run.";

export const CATALOG: { readonly [K in PublicFunctionPath]: CatalogEntry & { kind: FunctionKind<K> } } = {
  // ----- activity -----
  "activity.touch": {
    kind: "mutation", audience: "player",
    human: { title: "Wake the game", tooltip: "Counts as human activity and resumes a game parked after 30 idle minutes." },
    ai: { description: "Record human activity for the deployment. Games park after 30 minutes without a human (no ticks, no AI turns); this resumes them. Call it when the observation says the game is parked or recovering for lack of activity; harmless otherwise." },
    tools: ["wake_engine"], palette: { label: "Wake the game", group: "play", keywords: ["wake", "parked", "idle", "resume"], surfaces: P },
  },
  "activity.status": {
    kind: "query", audience: "infrastructure",
    human: { title: "Show activity status", tooltip: "When a human was last active and whether games are parked." },
    ai: { description: "Deployment-wide activity: the last human activity time and whether games are parked. The observation already says when a game is parked." },
    tools: [], palette: null, why: SUBSCRIPTION,
  },
  // ----- agent/connect (MCP OAuth approval; reached from an OAuth redirect only) -----
  "agent.connect.pending": {
    kind: "query", audience: "infrastructure",
    human: { title: "Review a connection request", tooltip: "Shows which app wants to connect, with which rights, before you approve it." },
    ai: { description: "The engine UI's /connect page reads a pending OAuth authorization request: client name, redirect host, requested permission and the rooms the human may bind it to." },
    tools: [], palette: null, why: "Reached only from an OAuth redirect; approvals keep their consent page.",
  },
  "agent.connect.approve": {
    kind: "mutation", audience: "infrastructure",
    human: { title: "Approve the connection", tooltip: "Lets this app act as you in one room with the rights shown." },
    ai: { description: "Approve an OAuth connection request for one room and one permission (owner rights need explicit consent). The /connect page calls it with the completion secret it generated." },
    tools: [], palette: null, why: "Consent is given on the /connect page only.",
  },
  "agent.connect.deny": {
    kind: "mutation", audience: "infrastructure",
    human: { title: "Deny the connection", tooltip: "Sends the app away without any access." },
    ai: { description: "Deny a pending OAuth connection request; the client's redirect receives error=access_denied." },
    tools: [], palette: null, why: "Consent is given on the /connect page only.",
  },
  // ----- aiTemplates -----
  "aiTemplates.catalog": {
    kind: "query", audience: "owner",
    human: { title: "Browse AI players", tooltip: "The AI players an owner can seat, with their provider and model." },
    ai: { description: "The public AI player library (ids, names, providers, models; no prompts): the choices for add_ai. Owner tool get_ai_catalog returns it." },
    tools: ["get_ai_catalog"], palette: null, why: "The choices behind 'Add an AI player…', not a command of its own.",
  },
  "aiTemplates.adminList": {
    kind: "query", audience: "admin",
    human: { title: "Open the AI library", tooltip: "Every AI player template with its prompt, for admins." },
    ai: { description: "Admin only: the full AI player templates including prompts and revisions, for the /admin/agents page." },
    tools: [], palette: null, why: "Admin page data; the palette navigates to the library instead.",
  },
  "aiTemplates.create": {
    kind: "mutation", audience: "admin",
    human: { title: "Add an AI player template", tooltip: "Creates a named AI player with a provider, model and prompt (admins only)." },
    ai: { description: "Admin only: create an AI player template (name, provider, model, prompt ≤ 10,000 characters)." },
    tools: [], palette: { label: "Add an AI player template", group: "account", keywords: ["admin", "ai", "template", "new"], surfaces: E },
  },
  "aiTemplates.update": {
    kind: "mutation", audience: "admin",
    human: { title: "Edit an AI player template", tooltip: "Changes a template's name, model or prompt; send its current revision." },
    ai: { description: "Admin only: edit an AI player template by id with its current revision (optimistic concurrency)." },
    tools: [], palette: { label: "Edit an AI player template…", group: "account", keywords: ["admin", "ai", "template"], surfaces: E },
  },
  "aiTemplates.remove": {
    kind: "mutation", audience: "admin",
    human: { title: "Delete an AI player template", tooltip: "Removes a template from the library; seated copies keep playing." },
    ai: { description: "Admin only: delete an AI player template by id and revision." },
    tools: [], palette: { label: "Delete an AI player template…", group: "account", keywords: ["admin", "ai", "template", "remove"], surfaces: E, confirm: "modal" },
  },
  // ----- assistant -----
  "assistant.send": {
    kind: "mutation", audience: "player",
    human: { title: "Ask the assistant", tooltip: "Sends your message; the assistant answers and acts as you with the rights you chose." },
    ai: { description: "Start an assistant turn for the human in a room (≤ 4,000 characters); the first send creates their revocable assistant credential. While a turn is active the message is queued for it (at most 5): it joins the turn after its current step's tool results, or starts the next turn; a waiting card is declined by it. clientId makes a retry the same message. FORBIDDEN while the owner's allowance is 0; CONFLICT for a thread of an earlier game (each game starts a fresh conversation) or another thread than the busy one." },
    tools: [], palette: { label: "Ask the assistant…", group: "help", keywords: ["ask", "assistant", "help", "ai"], surfaces: P }, why: NO_SELF_DRIVE,
  },
  "assistant.editQueued": {
    kind: "mutation", audience: "player",
    human: { title: "Edit a queued message", tooltip: "Changes a message waiting for your assistant before it reads it." },
    ai: { description: "Change the text of one of the human's queued assistant messages; a delivered one changes nothing." },
    tools: [], palette: null, why: "Edited on the queued message in the assistant pane.",
  },
  "assistant.removeQueued": {
    kind: "mutation", audience: "player",
    human: { title: "Remove a queued message", tooltip: "Takes back a message your assistant has not read yet." },
    ai: { description: "Remove one of the human's queued assistant messages before it is delivered; a delivered one stays." },
    tools: [], palette: null, why: "Removed on the queued message in the assistant pane.",
  },
  "assistant.sendQueued": {
    kind: "mutation", audience: "player",
    human: { title: "Send held messages", tooltip: "Sends the messages you queued before you stopped the assistant." },
    ai: { description: "Start a turn with the human's queued messages that a Stop held (the assistant must be idle in this game)." },
    tools: [], palette: null, why: "Sent from the held messages in the assistant pane.",
  },
  "assistant.cancel": {
    kind: "mutation", audience: "player",
    human: { title: "Stop the assistant", tooltip: "Stops the current answer and cancels a waiting card; messages you queued stay held until you send." },
    ai: { description: "Cancel the human's active assistant turn: the running step stops at its next flush or between tool calls." },
    tools: [], palette: { label: "Stop the assistant", group: "help", keywords: ["stop", "cancel", "assistant"], surfaces: P }, why: NO_SELF_DRIVE,
  },
  "assistant.confirm": {
    kind: "mutation", audience: "player",
    human: { title: "Decide a confirmation", tooltip: "Approves or denies an action the assistant asked permission for." },
    ai: { description: "Approve or deny one tool call waiting on a confirmation card (public chat, summons, destroys, pauses, panel deletion, owner actions). Unanswered cards are denied after 2 minutes." },
    tools: [], palette: null, why: "Decided on the confirmation card in the assistant pane, never elsewhere.",
  },
  "assistant.setPrefs": {
    kind: "mutation", audience: "player",
    human: { title: "Set assistant preferences", tooltip: "Lets summons the assistant validated run without a card up to this many bits (0 asks every time)." },
    ai: { description: "Set the human's assistant preference for a room: auto-approve summons up to N bits when the same turn validated the source at that cost (0 = always ask)." },
    tools: [], palette: { label: "Auto-approve summons up to…", group: "help", keywords: ["assistant", "summon", "approve", "preferences"], surfaces: P }, why: NO_SELF_DRIVE,
  },
  "assistant.status": {
    kind: "query", audience: "player",
    human: { title: "Show assistant status", tooltip: "Whether the assistant is on, its allowance, model, credential and active turn." },
    ai: { description: "The assistant pane's status subscription: enabled, allowance used, model, credential, active turn and preferences." },
    tools: [], palette: null, why: SUBSCRIPTION,
  },
  "assistant.threads": {
    kind: "query", audience: "player",
    human: { title: "Switch conversation", tooltip: "Your assistant conversations in this room's current game, newest first." },
    ai: { description: "The human's assistant threads in a room's current game (titles and times), for the conversation picker; gameId reads an earlier game's (or \"lobby\")." },
    tools: [], palette: { label: "Switch assistant conversation…", group: "help", keywords: ["thread", "conversation", "history"], surfaces: P }, why: NO_SELF_DRIVE,
  },
  "assistant.transcript": {
    kind: "query", audience: "player",
    human: { title: "Show this game's conversation", tooltip: "Your assistant conversation in this game: a new game starts with none." },
    ai: { description: "The assistant pane's subscription: the human's conversation in one game of the room (the named thread when it is theirs in that game, else the game's active or latest one; none when the game has none), with its turns, messages and tool calls. A thread of another game is never returned." },
    tools: [], palette: null, why: SUBSCRIPTION,
  },
  "assistant.thread": {
    kind: "query", audience: "player",
    human: { title: "Show a conversation", tooltip: "One conversation's messages, tool calls and confirmation cards." },
    ai: { description: "One assistant thread's turns, messages and tool calls, readable by its human only." },
    tools: [], palette: null, why: SUBSCRIPTION,
  },
  // ----- auth -----
  "auth.credentials.list": {
    kind: "query", audience: "infrastructure",
    human: { title: "Show connected apps", tooltip: "Every app, connector and assistant acting as you, with its room, rights and expiry." },
    ai: { description: "The human's active credentials (device, OAuth and assistant) with room, permission, label and expiry. whoami covers the calling credential." },
    tools: [], palette: { label: "Show connected apps", group: "account", keywords: ["credential", "connections", "apps", "revoke"], surfaces: E },
  },
  "auth.credentials.revoke": {
    kind: "mutation", audience: "infrastructure",
    human: { title: "Revoke a connected app", tooltip: "Cuts that app's access on its next call; you can reconnect it later." },
    ai: { description: "Revoke one of the human's credentials by id; takes effect on the next call." },
    tools: [], palette: { label: "Revoke a connected app…", group: "account", keywords: ["credential", "disconnect", "revoke"], surfaces: E, confirm: "inline" },
  },
  "auth.device.pending": {
    kind: "query", audience: "infrastructure",
    human: { title: "Review a device code", tooltip: "Shows what a player app asks for before you approve its code." },
    ai: { description: "The /device page reads a pending device-flow request by user code: room, permission, label, expiry." },
    tools: [], palette: null, why: "The /device page's data; approval keeps its consent page.",
  },
  "auth.device.approve": {
    kind: "mutation", audience: "infrastructure",
    human: { title: "Approve a device code", tooltip: "Gives the player app a credential for the room and rights shown." },
    ai: { description: "Approve a device-flow request (owner rights need explicit consent); the app then receives its credential." },
    tools: [], palette: null, why: "Consent is given on the /device page only.",
  },
  "auth.device.deny": {
    kind: "mutation", audience: "infrastructure",
    human: { title: "Deny a device code", tooltip: "Refuses the player app; it gets nothing." },
    ai: { description: "Deny a pending device-flow request by user code; the player app's poll then answers denied." },
    tools: [], palette: null, why: "Consent is given on the /device page only.",
  },
  "auth.testing.probe": {
    kind: "query", audience: "test",
    human: { title: "Probe authentication", tooltip: "A test-only check of the signed-in identity on local deployments." },
    ai: { description: "Test fixture: echoes the viewer on local deployments; refused in production." },
    tools: [], palette: null, why: "Test only.",
  },
  "auth.user.me": {
    kind: "query", audience: "infrastructure",
    human: { title: "Show who I am", tooltip: "Your name, god id and, for a player app, its room and rights." },
    ai: { description: "The signed-in human: subject, name, admin flag and, for a player credential, its room, permission and label. whoami adds the credential's expiry." },
    tools: ["whoami"], palette: { label: "Show who I am", group: "account", keywords: ["account", "identity", "credential", "expiry"], surfaces: BOTH },
  },
  // ----- code (analytics runs; docs/assistant/code-execution.md) -----
  "code.objects.list": {
    kind: "query", audience: "player",
    human: { title: "Show my stored objects", tooltip: "What your assistant's scripts saved for you: keys, sizes and how much of your store is used." },
    ai: { description: "The human's object store (the only persistence a run_code script has; this game's objects and the saved scripts/, which stay across games): keys under a prefix with sizes and times (never values), the store's usage and its limits." },
    tools: ["list_code_objects"], palette: null, why: "Objects are written and read by the assistant's scripts; there is nothing to run by hand.",
  },
  "code.runs.list": {
    kind: "query", audience: "player",
    human: { title: "Show my code runs", tooltip: "The analytics scripts your assistant ran for you in this game, newest first, with its budget." },
    ai: { description: "The human's recent analytics code runs in this room's current game (runId, title, language, status, datasets, CPU and timing), newest first, and this game's run budget (runs and CPU seconds used and left)." },
    tools: ["list_code_runs"], palette: null, why: "The code-output panel lists and shows runs; the assistant starts them.",
  },
  "code.runs.get": {
    kind: "query", audience: "player",
    human: { title: "Show a code run", tooltip: "One analytics run's source, result table and printed output." },
    ai: { description: "One of the human's code runs (default: the latest of this room's current game; the assistant reaches no earlier game's): its source, datasets, status or error, CPU time, the result JSON and printed output (a prefix when large, with a URL of the whole)." },
    tools: ["get_code_run"], palette: null, why: "Rendered by the code-output panel, which the assistant opens with open_panel.",
  },
  // ----- commands -----
  "commands.submit": {
    kind: "action", audience: "player",
    human: { title: "Send a game command", tooltip: "Validate, summon or destroy an agent, mark yourself ready, chat publicly or use your pause." },
    ai: { description: "Submit one v3 command envelope as the human: validate, summon, destroy, ready, chat or pause. The engine checks permission, phase, energy and idempotency and returns a receipt {accepted, message, validation?}. Replaying an identical envelope returns its receipt; a reused commandId with other content is CONFLICT." },
    tools: ["validate_agent", "summon_agent", "destroy_agent", "set_ready", "send_chat", "pause_game"],
    palette: { label: "Send a game command…", group: "play", keywords: ["validate", "summon", "destroy", "ready", "chat", "pause"], surfaces: P },
  },
  // ----- games -----
  "games.resolve": {
    kind: "query", audience: "player",
    human: { title: "Open a game by code", tooltip: "Finds a game's page from its code, current or historical." },
    ai: { description: "Resolve a game code to the public game view plus a status (current, historical, unavailable). The assistant reads the room's games with list_games and get_game_history." },
    tools: [], palette: null, why: "Resolves a code for the game page; the room's games reach the assistant through list_games and get_game_history.",
  },
  "games.view": {
    kind: "query", audience: "player",
    human: { title: "Watch a game", tooltip: "The public view of a game: salience, standings, roster and winners." },
    ai: { description: "The public, non-private view of one game for the shared display. Private per-god data is never in it; the assistant uses get_observation for the human's own view." },
    tools: [], palette: null, why: "The public game page's subscription; the human's private view is get_observation.",
  },
  // ----- layout -----
  "layout.current": {
    kind: "query", audience: "player",
    human: { title: "Show the dock layout", tooltip: "The panes you see in this room, as every open client of yours renders them." },
    ai: { description: "The human's dock layout for the room: panes (built-in panels with parameters, stored panels, the assistant), their arrangement, who set each built-in panel, and repair warnings. get_layout returns it with the built-in panel catalogue." },
    tools: ["get_layout", "load_skill"], palette: null, why: "The dock's own subscription; the assistant reads it with get_layout.",
  },
  "layout.set": {
    kind: "mutation", audience: "player",
    human: { title: "Arrange the dock", tooltip: "Moves, resizes, adds or closes panes; every open client of yours follows." },
    ai: { description: "Store the human's whole dock layout for the room (drags, the panel menu, presets), compare-and-set with ifUpdatedAt, at most 12 writes a minute. Assistants use the pane operations open_panel, set_panel_params, move_pane and close_pane instead." },
    tools: ["open_panel", "set_panel_params", "move_pane", "close_pane"],
    palette: { label: "Arrange the dock…", group: "view", keywords: ["layout", "pane", "panel", "dock", "move", "split", "reset"], surfaces: P },
  },
  // ----- manifest -----
  "manifest.get": {
    kind: "action", audience: "infrastructure",
    human: { title: "Show server info", tooltip: "Object types, offered instantiations, options, runtimes and whether AI players are funded." },
    ai: { description: "The deployment's manifest: object types with their offered instantiations, pre-authored option lists, runtimes and AI funding status. get_rules includes what a player needs of it; list_setups lists the game setups." },
    tools: ["get_rules"], palette: { label: "Show server info", group: "help", keywords: ["version", "manifest", "runtimes", "instantiations"], surfaces: E },
  },
  "version.current": {
    kind: "query", audience: "infrastructure",
    human: { title: "Show deployed versions", tooltip: "The engine UI, player client and engine functions builds now live, so open pages can update themselves." },
    ai: { description: "Per site (engine UI, player client, functions): the live build id, when it was deployed and the recent build ids. Clients compare their own build with it to update after a deploy (lib/player-client/src/update.ts); agents need nothing from it." },
    tools: [], palette: null,
  },
  "calibration.node.tables": {
    kind: "action", audience: "infrastructure",
    human: { title: "Load calibration tables", tooltip: "The calibration tables of a utility and its defence goal, for scoring values in the browser." },
    ai: { description: "The calibration tables (ordinal to surprisal bits) of one or two draws of a game's instantiation, as JSON text. The player client's evaluator uses them to score hypothetical values exactly as the engine does; evaluate_value does this server-side for agents." },
    tools: [], palette: null, why: "The player client's evaluator loads these itself; agents score values with evaluate_value.",
  },
  // ----- owner -----
  "owner.settings": {
    kind: "action", audience: "owner",
    human: { title: "Choose the next game's setup", tooltip: "Puts the next game on a game setup, or changes the room's setup; running games keep theirs." },
    ai: { description: "Owner: the next game's setup and AI token budget, with the room's revision (CONFLICT when stale). setupId (any setup) applies its settings. settings (fields to change; languages lists the languages agents may be written in, an object type moves its default shape) edits the room's setup if the human owns it, else their new copy \"<name>'s copy\", which the room then runs; the result's setup.note says which." },
    tools: ["update_settings"], palette: { label: "Choose the next game's setup…", group: "owner", keywords: ["setup", "configuration", "settings", "world"], surfaces: BOTH },
  },
  "owner.start": {
    kind: "action", audience: "owner",
    human: { title: "Start the game", tooltip: "Deals secret goals and spawns the world for 3 to 8 players; planning begins at once." },
    ai: { description: "Owner: launch the next game (3–8 gods seated): deals utility functions, spawns the starting objects and begins planning. On a shape new to this server it may first return {status: \"preparing\", ready, total, message}: the rule tables are being computed and the game starts by itself when they are (rooms.get `preparing`). Idempotent per requestId." },
    tools: ["start_game"], palette: { label: "Start the game", group: "owner", keywords: ["launch", "begin", "play"], surfaces: BOTH, confirm: "summary" },
  },
  "owner.command": {
    kind: "action", audience: "owner",
    human: { title: "Run an owner action", tooltip: "Settings, start, resume, end, add or remove an AI player, in one call." },
    ai: { description: "Owner: one entry point for settings, start, resume, endGame, addAi and removeAi with a requestId; the owner tools map onto it one to one." },
    tools: ["update_settings", "start_game", "resume_game", "end_game", "add_ai", "remove_ai"], palette: null,
    why: "The assistant's single owner entry point; humans use the direct owner functions.",
  },
  // ----- panels -----
  "panels.list": {
    kind: "query", audience: "player",
    human: { title: "Show my panels", tooltip: "Your stored panels with version, author and whether each is on." },
    ai: { description: "The human's stored UI panels (slug, title, version, author, enabled, add-pane hints), across rooms." },
    tools: ["list_panels"], palette: { label: "Show my panels", group: "view", keywords: ["panels", "custom", "stored"], surfaces: P },
  },
  "panels.code": {
    kind: "query", audience: "player",
    human: { title: "View a panel's source", tooltip: "The TSX, compiled code and diagnostics of one panel version." },
    ai: { description: "One stored panel's TSX source, compiled code and diagnostics (default: the current version; the last 20 are kept)." },
    tools: ["get_panel"], palette: { label: "View a panel's source…", group: "view", keywords: ["panel", "source", "code", "tsx"], surfaces: P },
  },
  "panels.save": {
    kind: "action", audience: "player",
    human: { title: "Make a panel", tooltip: "Saves TSX as a panel you can open as a pane; a syntax error saves nothing." },
    ai: { description: "Create or update a stored panel from TSX importing only react, react/jsx-runtime and @sdk and exporting definePanel({...}). Compiled on save: a syntax error returns diagnostics with line and column and commits nothing. Every open client of the human can show it in a pane (open_panel)." },
    tools: ["save_panel"], palette: { label: "Make a panel…", group: "view", keywords: ["panel", "custom", "build", "tsx", "chart"], surfaces: P },
  },
  "panels.rollback": {
    kind: "mutation", audience: "player",
    human: { title: "Roll back a panel", tooltip: "Makes an older version current again, as a new version." },
    ai: { description: "Make an older version of a stored panel current again (recorded as a new version)." },
    tools: ["rollback_panel"], palette: { label: "Roll back a panel…", group: "view", keywords: ["panel", "version", "undo"], surfaces: P, confirm: "inline" },
  },
  "panels.setEnabled": {
    kind: "mutation", audience: "player",
    human: { title: "Turn a panel on or off", tooltip: "Hides a panel in every client without deleting it, or shows it again." },
    ai: { description: "Enable or disable a stored panel everywhere (it stays stored). Assistants open or close panes instead." },
    tools: [], palette: { label: "Turn a panel on or off…", group: "view", keywords: ["panel", "hide", "show", "enable"], surfaces: P },
    why: "The assistant opens and closes panes with open_panel and close_pane; hiding a panel for good is the human's choice.",
  },
  "panels.remove": {
    kind: "mutation", audience: "player",
    human: { title: "Delete a panel", tooltip: "Deletes a panel and all its versions; this cannot be undone." },
    ai: { description: "Delete a stored panel and all its versions." },
    tools: ["delete_panel"], palette: { label: "Delete a panel…", group: "view", keywords: ["panel", "remove", "delete"], surfaces: P, confirm: "inline" },
  },
  // ----- player -----
  "player.observation": {
    kind: "query", audience: "player",
    human: { title: "Inspect the raw observation", tooltip: "Your private view of the game as the engine sends it, once per tick." },
    ai: { description: "The human's private v3 observation: phase, energy and utility card, objects with their own bits and the peers' aggregate, agents, recent transformations, leaderboard, chat and the object instance. The start for anything about the current game." },
    tools: ["get_observation", "load_skill"], palette: { label: "Inspect the raw observation", group: "view", keywords: ["json", "debug", "observation"], surfaces: P },
  },
  "player.events": {
    kind: "query", audience: "player",
    human: { title: "Open the event log", tooltip: "Spawns, transformations and phase changes of the current game, as they affect you." },
    ai: { description: "The human's projected event log of a game by batch cursor: spawns, transformations (own bits and peer aggregates) and phase changes." },
    tools: ["get_events"], palette: { label: "Open the event log", group: "view", keywords: ["events", "log", "transformations", "feed"], surfaces: P },
  },
  "player.history": {
    kind: "query", audience: "player",
    human: { title: "Replay a past game's log", tooltip: "The event log of a game of this room; past games open for their players." },
    ai: { description: "The same projected event log for a game of the room, finished games included, from a seq cursor. A past game (not the room's current one) is readable only by the gods who played in it and the room owner." },
    tools: ["get_game_history"], palette: { label: "Replay a past game's log…", group: "view", keywords: ["replay", "history", "past game"], surfaces: P },
  },
  "player.replay": {
    kind: "query", audience: "player",
    human: { title: "Replay a game I played", tooltip: "Everything that happened in an ended game you played in, fully revealed: every player's goal, every agent's code, every move." },
    ai: { description: "One page of an ENDED game's replay, fully revealed (hiding applies only while a game is live): on the first page every god's utility descriptor, card and AI seat and the end deadline; then every event in full (each god's net bits after each change, whose agent acted, every agent's source, each act's seed) and the chat. Page with afterSeq = nextCursor, chatAfter = chatCursor until done. Players of that game only; refused while it is live." },
    tools: ["get_replay"], palette: null,
    why: "The replay view opens from the room's game list and the results panel (docs/replay-design.md §7); there is nothing to run from the palette.",
  },
  "player.game": {
    kind: "query", audience: "player",
    human: { title: "Open a game of this room", tooltip: "One game of this room, live or as it ended; past games open for their players and the owner." },
    ai: { description: "One game of the room by id or code: its public world (final once ended), standings, winners and chat, whether it is current and whether the human was seated." },
    tools: [], palette: null, why: "The player client's game page (/rooms/:room/games/:game); the assistant reads past games through list_games and get_game_history.",
  },
  "player.trajectories": {
    kind: "query", audience: "player",
    human: { title: "Open my points over time", tooltip: "Per-object series of your bits, the others' total and your payoff." },
    ai: { description: "Per-object series over the game of the human's net bits, the peer aggregate and payoff: which objects are rising or falling for them." },
    tools: ["get_trajectories"], palette: { label: "Open my points over time", group: "view", keywords: ["chart", "trajectories", "over time", "trend"], surfaces: P },
  },
  "player.series": {
    kind: "query", audience: "player",
    human: { title: "Open the utility series", tooltip: "Every change to every object this game, with your bits and the others' total before and after." },
    ai: { description: "The game's public transformation log as the human sees it: every spawn and transformation (unattributed while live; the human's own marked mine), with the value before and after, the human's own bits and the OTHER gods' summed bits before and after (noisy while live, peerNoiseBits; exact after the end). The data for inferring the other gods' rules." },
    tools: ["get_utility_series"], palette: null, why: "An analytics feed paged by the assistant or a stored panel; the human reads it through panels, not a button.",
  },
  "player.board": {
    kind: "query", audience: "player",
    human: { title: "Board at a moment", tooltip: "Every object as it was at a world time, with your bits and the others' total." },
    ai: { description: "The board at a world time (default now): every object that existed then with its value, version, the human's own bits, the others' summed bits and the human's payoff, from each object's last change at or before that time." },
    tools: ["get_board_at"], palette: null, why: "Takes a world time chosen during analysis; panels and the assistant call it.",
  },
  "player.myUtility": {
    kind: "query", audience: "player",
    human: { title: "Open my secret goal", tooltip: "Your own utility descriptor and the settings to evaluate it; nobody else's." },
    ai: { description: "The human's own utility descriptor (family, parameters, defence goal) with the game's settings and instantiation; null when not seated. Never another god's." },
    tools: ["get_my_utility"], palette: { label: "Open my secret goal", group: "view", keywords: ["utility", "goal", "card", "incentives"], surfaces: P },
  },
  // ----- receipts -----
  "receipts.get": {
    kind: "query", audience: "player",
    human: { title: "Check a command's status", tooltip: "Whether a command you sent was received, is pending or failed." },
    ai: { description: "The receipt of one of the human's commands by commandId: the engine's result, or null when it never arrived." },
    tools: ["get_receipt"], palette: { label: "Check a command's status…", group: "play", keywords: ["receipt", "pending", "command"], surfaces: P },
  },
  // ----- rooms -----
  "rooms.create": {
    kind: "mutation", audience: "player",
    human: { title: "Create a room", tooltip: "Opens a new room on the First steps setup with you as owner, ready to share its invite link." },
    ai: { description: "Create a room owned by the signed-in human (browser only). It runs the system's First steps setup (setup {id, name}); optional assistantBudget (tokens per human per game, 0 = off) and assistantModel turn the in-client assistant on at creation." },
    tools: [], palette: { label: "Create a room", group: "room", keywords: ["new room", "host", "create"], surfaces: E },
    why: "A credential is bound to one existing room; rooms are created in the browser.",
  },
  "rooms.list": {
    kind: "query", audience: "player",
    human: { title: "Show my rooms", tooltip: "Rooms you can see, with owner, creation date, players and phase." },
    ai: { description: "The rooms list for the signed-in human (code, owner, created, members, phase)." },
    tools: [], palette: null, why: SUBSCRIPTION,
  },
  "rooms.get": {
    kind: "query", audience: "player",
    human: { title: "Show the room", tooltip: "Members, settings, chat, budgets and the active game of a room." },
    ai: { description: "A room's public state: settings and revision, members and AI seats, chat, budgets, object instance, the active game and `preparing` (the next game's rule tables being computed: ready of total). get_rules gives a player the rules part; get_room_state gives the owner all of it." },
    tools: ["get_rules", "get_room_state", "load_skill"], palette: null, why: SUBSCRIPTION,
  },
  "rooms.join": {
    kind: "mutation", audience: "player",
    human: { title: "Join this room", tooltip: "Takes a seat; joining mid-game makes you a spectator until the next game." },
    ai: { description: "Join a room as the signed-in human (browser only)." },
    tools: [], palette: { label: "Join this room", group: "room", keywords: ["join", "seat", "member"], surfaces: BOTH },
    why: "Membership precedes any credential: the human joins in the browser before an assistant can act for them there.",
  },
  "rooms.leave": {
    kind: "mutation", audience: "player",
    human: { title: "Leave this room", tooltip: "Gives up your seat; you can join again later." },
    ai: { description: "Leave a room (browser only; not while seated in a running game)." },
    tools: [], palette: { label: "Leave this room", group: "room", keywords: ["leave", "exit"], surfaces: E, confirm: "inline" },
    why: "Leaving would revoke the very credential the assistant acts through.",
  },
  "rooms.setReady": {
    kind: "mutation", audience: "player",
    human: { title: "Mark me ready", tooltip: "Tells the room you are ready for the next game; it gates nothing." },
    ai: { description: "Mark the human ready (or not) in the room lobby; advisory. set_ready does the same through the command path." },
    tools: ["set_ready"], palette: { label: "Mark me ready", group: "play", keywords: ["ready", "not ready"], surfaces: E },
  },
  "rooms.chatHistory": {
    kind: "query", audience: "player",
    human: { title: "Show older chat", tooltip: "Earlier public messages than the ones on screen." },
    ai: { description: "The room's public chat paged backwards from a cursor (older than the observation's recent chat)." },
    tools: ["get_chat"], palette: { label: "Show older chat", group: "view", keywords: ["chat", "history", "scroll back"], surfaces: BOTH },
  },
  "rooms.history": {
    kind: "query", audience: "player",
    human: { title: "Show past games", tooltip: "Finished games of this room with their standings and winners." },
    ai: { description: "The room's finished games, newest first, with public results (leaderboard, winners, settings)." },
    tools: ["list_games"], palette: { label: "Show past games", group: "room", keywords: ["history", "results", "past games"], surfaces: BOTH },
  },
  "rooms.approveAiBudget": {
    kind: "mutation", audience: "owner",
    human: { title: "Set AI spending", tooltip: "Approves the AI players' token budget and the assistant allowance per player per game." },
    ai: { description: "Owner: approve the AI seats' token budget (frozen during games), the in-client assistant allowance per human per game (0 = off) and the assistant's model. update_settings covers the AI budget." },
    tools: ["update_settings"], palette: { label: "Set AI spending…", group: "owner", keywords: ["budget", "tokens", "billing", "assistant allowance"], surfaces: E, confirm: "summary" },
  },
  "rooms.addAi": {
    kind: "mutation", audience: "owner",
    human: { title: "Add an AI player", tooltip: "Seats an AI player from the library between games; it spends the room's AI budget." },
    ai: { description: "Owner: seat an AI player from the library (aiTemplates.catalog / get_ai_catalog) between games." },
    tools: ["add_ai"], palette: { label: "Add an AI player…", group: "owner", keywords: ["bot", "ai seat", "add"], surfaces: BOTH, confirm: "summary" },
  },
  "rooms.removeAi": {
    kind: "mutation", audience: "owner",
    human: { title: "Remove an AI player", tooltip: "Unseats an AI player between games." },
    ai: { description: "Owner: remove an AI seat by its member id between games." },
    tools: ["remove_ai"], palette: { label: "Remove an AI player…", group: "owner", keywords: ["bot", "kick", "remove"], surfaces: BOTH, confirm: "inline" },
  },
  "rooms.endActiveGame": {
    kind: "mutation", audience: "owner",
    human: { title: "End the game now", tooltip: "Ends the running game for everyone; its final standings are recorded." },
    ai: { description: "Owner: end the active game now; its final state is recorded like any other ending. With no game running, ends a preparation (the next game computing its rule tables)." },
    tools: ["end_game"], palette: { label: "End the game now", group: "owner", keywords: ["stop", "finish", "end"], surfaces: BOTH, confirm: "modal" },
  },
  "rooms.resume": {
    kind: "mutation", audience: "owner",
    human: { title: "Resume the game", tooltip: "Restarts a game stopped in recovery." },
    ai: { description: "Owner: resume a game stopped in recovery (e.g. after the safety stop or idle parking)." },
    tools: ["resume_game"], palette: { label: "Resume the game", group: "owner", keywords: ["recovery", "unpause", "resume"], surfaces: BOTH },
  },
  // ----- setups -----
  "setups.list": {
    kind: "query", audience: "player",
    human: { title: "Browse game setups", tooltip: "Every game setup: the system's, then everyone's by name, each with its owner." },
    ai: { description: "Every game setup (one shared collection): the system's (system: true, nobody may edit them), then everyone's by name, each with id, name, ownerName, mine, editable (= mine) and summary; get_setup has one's settings. update_settings with a setupId puts the next game on any of them; duplicate_setup copies one to edit." },
    tools: ["list_setups"], palette: null, why: "The Setup combobox and Choose the next game's setup list them; there is nothing to run on its own.",
  },
  "setups.get": {
    kind: "query", audience: "player",
    human: { title: "Show a game setup", tooltip: "One setup's complete settings, whoever owns it." },
    ai: { description: "One game setup by id (any: setups are shared) with its owner, whether it is the human's, and its complete settings." },
    tools: ["get_setup"], palette: null, why: "The configuration page shows a setup; there is nothing to run on its own.",
  },
  "setups.save": {
    kind: "action", audience: "player",
    human: { title: "Save a game setup", tooltip: "Saves a setup you own under its name, or a new one of yours." },
    ai: { description: "Save complete, valid settings as a named setup (name ≤ 40 characters, unique among the human's own): a new one, or over one the human owns (setupId; FORBIDDEN for the system's or another human's: duplicate it first). Changes no room. Returns the setup with its id." },
    tools: ["save_setup"], palette: null, why: "A setup is a whole configuration: it is saved from the configuration page, where the settings are edited.",
  },
  "setups.duplicate": {
    kind: "mutation", audience: "player",
    human: { title: "Duplicate a game setup", tooltip: "Makes your own copy of a setup, named \"<name>'s copy\", to edit." },
    ai: { description: "Copy any setup (system, another human's or the human's own) as a new setup the human owns, named \"<name>'s copy\" (then \" 2\", \" 3\" if taken) unless a name is given. Changes no room. Returns the copy with its id, ready for save_setup." },
    tools: ["duplicate_setup"], palette: null, why: "Every row of the Setup combobox has its Duplicate button, which opens the copy on the configuration page.",
  },
  "setups.remove": {
    kind: "mutation", audience: "player",
    human: { title: "Delete a game setup", tooltip: "Deletes one of your setups; rooms that run it keep its settings." },
    ai: { description: "Delete one of the human's own setups by id (FORBIDDEN for the system's or another human's). Rooms that run it keep its settings and show it as deleted." },
    tools: ["delete_setup"], palette: null, why: "Your setup's configuration page has its Delete in the review section.",
  },
};

export const CATALOG_PATHS = Object.keys(CATALOG) as PublicFunctionPath[];

/** Every function a registry tool names is a public function (a renamed or removed one fails the typecheck here). */
type ToolFunctions = (typeof GROUPS)[number][number]["functions"][number];
const _toolFunctionsExist: [ToolFunctions] extends [PublicFunctionPath] ? true : never = true;
void _toolFunctionsExist;
export const catalogEntry = (path: PublicFunctionPath): CatalogEntry => CATALOG[path];
/** The entries with a palette command on a surface. */
export const paletteEntries = (surface: PaletteSurface) =>
  CATALOG_PATHS.filter(path => CATALOG[path].palette?.surfaces.includes(surface)).map(path => ({ path, entry: CATALOG[path] as CatalogEntry, palette: CATALOG[path].palette! }));
