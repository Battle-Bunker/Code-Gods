/**
 * The player client's command palette list (docs/ui-redesign.md §2.5): one command per catalogue entry offered on the
 * player surface (commandsFromCatalog), bound to the same paths the panels use, plus the client's own `ui.*` commands
 * (dock, panels, assistant, links, glossary). Pure over a state snapshot and the actions the app wires
 * (core/palette/use-commands.ts); tested in test/palette-commands.test.ts.
 *
 * Gating mirrors the old console's disabled buttons: no game command before the observation, with a read-only
 * connection, while another command runs, or while an uncertain outcome waits for its identical retry; the pause
 * only while running and unused; destroy only with an agent. Owner commands need the owner and the right moment.
 * Hand-offs pre-fill the assistant's composer and never send; with the assistant off they are unavailable.
 */
import { CATALOG, type CatalogEntry, type PublicFunctionPath } from "@workspace/player-client/catalog";
import { PANELS, PANEL_IDS, type PanelId, type Phase } from "@workspace/player-client/panels";
import type { Pane } from "@workspace/player-client/layout";
import type { Command as GameCommand } from "@workspace/player-client";
import { GLOSSARY, GLOSSARY_IDS, availabilityFor, commandsFromCatalog, type Availability, type Command, type PaletteContext, type Performer, type PickOption } from "@workspace/ui-kit";

export type PaletteState = {
  /** Undefined until the observation arrives. */
  phase: Phase | undefined;
  hasObservation: boolean;
  permission: "read" | "act" | "owner";
  isOwner: boolean;
  seated: boolean;
  ready: boolean;
  pauseUsed: boolean;
  agents: readonly { id: string; label: string }[];
  /** A command whose outcome is unknown waits for its identical retry (the banner under the header). */
  unknownOutcome: boolean;
  /** A game command is in flight. */
  busy: boolean;
  assistantOn: boolean;
  roomCode?: string;
  gameCode?: string;
  panes: readonly { id: string; kind: Pane["kind"]; label: string; closable: boolean }[];
  /** The pane the palette was opened for. */
  scopePaneId: string | null;
  storedPanels: readonly { slug: string; title: string; enabled: boolean; currentVersion: number }[];
  filePanels: readonly string[];
  safeMode: boolean;
  presets: readonly PickOption[];
  aiSeats: readonly PickOption[];
};

export type PaletteActions = {
  /** A game command through the shared command runner (commands.submit; an unknown outcome keeps its envelope). */
  submit(command: GameCommand): Promise<unknown>;
  wake(): Promise<unknown>;
  join(): Promise<unknown>;
  whoami(): void;
  receipt(commandId: string): Promise<unknown>;
  copyObservation(): void;
  owner: {
    start(): Promise<unknown>; resume(): Promise<unknown>; endGame(): Promise<unknown>;
    addAi(templateId: string): Promise<unknown>; removeAi(godId: string): Promise<unknown>; preset(presetId: string): Promise<unknown>;
    aiCatalog(): Promise<readonly PickOption[]>;
  };
  panels: { open(slug: string): void; openFile(id: string): void; setEnabled(slug: string, enabled: boolean): Promise<unknown>; remove(slug: string): Promise<unknown>; rollback(slug: string): Promise<unknown> };
  assistant: {
    cancel(): Promise<unknown>; setAutoApprove(bits: number): Promise<unknown>; threads(): Promise<readonly PickOption[]>; openThread(id: string): void;
    newThread(): void; setPermission(permission: "read" | "act" | "owner"): void; focus(): void; handoff(draft: string): void;
  };
  dock: {
    /** Show a panel: activate an open pane of it, else add one by the placement rule. */
    show(panelId: PanelId): void;
    change(paneId: string, panelId: PanelId): void;
    close(paneId: string): void;
    dockAssistant(side: "left" | "right" | "bottom"): void;
    preset(name: "stacked" | "side-by-side" | "two-panels"): void;
    reset(): void;
    maximise(paneId: string): void;
    /** Show the forge panel in edit mode. */
    forgeEdit(): void;
  };
  links: { roomPage(): string; gamePage(): string | null; copyRoomLink(): void; safeMode(on: boolean): void };
  notify(text: string): void;
};

const OK: Availability = { ok: true };
const no = (reason: string, fix?: string, hidden?: boolean): Availability => ({ ok: false, reason, ...(fix ? { fix } : {}), ...(hidden ? { hidden } : {}) });
const both = (...checks: Availability[]): Availability => checks.find(c => !c.ok) ?? OK;
const pick = (title: string, options: readonly PickOption[] | (() => Promise<readonly PickOption[]> | readonly PickOption[]), onPick: (id: string) => unknown): Performer =>
  ({ kind: "form", page: { kind: "pick", title, options: typeof options === "function" ? options : () => options, onPick } });
const local = (run: () => void): Performer => ({ kind: "local", run });
const submit = (run: () => Promise<unknown>): Performer => ({ kind: "submit", run });
const live = (phase: Phase | undefined) => phase === "planning" || phase === "running" || phase === "paused";

/** The old console's `gameplay`: an observation, rights to act, nothing in flight, no outcome left unknown. */
function gameplay(s: PaletteState): Availability {
  if (!s.hasObservation) return no("Waiting for the game to load.");
  if (s.permission === "read") return no("This connection is read-only.", "Reconnect with act rights.");
  if (s.unknownOutcome) return no("A command's outcome is unknown.", "Retry it or dismiss it first, under the header.");
  if (s.busy) return no("Another command is still running.");
  return OK;
}
const assistantOn = (s: PaletteState): Availability =>
  s.assistantOn ? OK : no("Your assistant is off in this room.", "The room owner turns it on in the room's AI budget.");
const betweenGames = (s: PaletteState): Availability => (live(s.phase) ? no("Only between games.", "End the current game first.") : OK);

export function playerCommands(s: PaletteState, a: PaletteActions): Command[] {
  const scope = (ctx: PaletteContext) => s.panes.find(p => p.id === (ctx.scope?.paneId ?? s.scopePaneId));

  // ----- catalogue rows -----
  const gameOptions = (): PickOption[] => [
    { id: "ready", label: s.ready ? "Mark me not ready" : "Mark me ready" },
    ...(s.phase === "running" && !s.pauseUsed ? [{ id: "pause", label: "Use my one pause", detail: "Stops the world for everyone; once per game." }] : []),
    { id: "editor", label: "Write agent code (validate, summon)" },
    { id: "chat", label: "Say something publicly", detail: "Opens Public chat." },
    ...s.agents.map(agent => ({ id: `destroy:${agent.id}`, label: `Destroy ${agent.label}`, detail: "Free; it cannot be undone." })),
  ];
  const runGameOption = (id: string) => {
    if (id === "ready") return a.submit({ type: "ready", ready: !s.ready });
    if (id === "pause") return a.submit({ type: "pause" });
    if (id === "editor") return a.dock.forgeEdit();
    if (id === "chat") return a.dock.show("public-chat");
    if (id.startsWith("destroy:")) return a.submit({ type: "destroy", agentId: id.slice("destroy:".length) });
  };
  const storedOptions = (filter: (p: PaletteState["storedPanels"][number]) => boolean, label: (p: PaletteState["storedPanels"][number]) => string) =>
    () => s.storedPanels.filter(filter).map(p => ({ id: p.slug, label: label(p), detail: `v${p.currentVersion}` }));
  const field = (title: string, label: string, onSubmit: (value: string) => unknown, validate?: (value: string) => string | null, placeholder?: string): Performer =>
    ({ kind: "form", page: { kind: "field", title, label, placeholder, validate, onSubmit } });

  const BIND: { [P in PublicFunctionPath]?: { performer: Performer; available?: () => Availability } } = {
    "activity.touch": { performer: submit(() => a.wake()) },
    "assistant.send": { performer: { kind: "handoff", draft: "" }, available: () => assistantOn(s) },
    "assistant.cancel": { performer: submit(() => a.assistant.cancel()), available: () => assistantOn(s) },
    "assistant.setPrefs": {
      performer: field("Auto-approve summons", "Up to how many bits (0 asks every time)", v => a.assistant.setAutoApprove(Number(v)),
        v => (/^\d+(\.\d+)?$/.test(v.trim()) ? null : "A number of bits, 0 or more."), "0"),
      available: () => assistantOn(s),
    },
    "assistant.threads": { performer: pick("Past conversations", () => a.assistant.threads(), id => a.assistant.openThread(id)), available: () => assistantOn(s) },
    "auth.user.me": { performer: local(() => a.whoami()) },
    "commands.submit": { performer: pick("Send a game command", gameOptions, runGameOption), available: () => gameplay(s) },
    "layout.set": {
      performer: pick("Arrange the dock", [
        { id: "stacked", label: "Stacked: panels on top, assistant below" }, { id: "side-by-side", label: "Side by side: assistant on the right" },
        { id: "two-panels", label: "Two panels and the assistant" }, { id: "reset", label: "Reset layout" },
      ], id => (id === "reset" ? a.dock.reset() : a.dock.preset(id as "stacked"))),
    },
    "owner.settings": { performer: pick("Next game's setup", () => s.presets, id => a.owner.preset(id)), available: () => betweenGames(s) },
    "owner.start": { performer: submit(() => a.owner.start()), available: () => betweenGames(s) },
    "panels.list": { performer: pick("Open one of your panels", storedOptions(p => p.enabled, p => p.title), slug => a.panels.open(slug)) },
    "panels.code": {
      performer: pick("Which panel?", storedOptions(() => true, p => p.title), slug => a.assistant.handoff(`Show me the source of my panel "${slug}" and explain what it does.`)),
      available: () => assistantOn(s),
    },
    "panels.save": { performer: { kind: "handoff", draft: "Build me a panel that shows ", tool: "save_panel" }, available: () => assistantOn(s) },
    "panels.rollback": {
      performer: pick("Roll back which panel?", storedOptions(p => p.currentVersion > 1, p => `${p.title} to v${p.currentVersion - 1}`), slug => a.panels.rollback(slug)),
      available: () => (s.storedPanels.some(p => p.currentVersion > 1) ? OK : no("None of your panels has an older version.", undefined, true)),
    },
    "panels.setEnabled": {
      performer: pick("Turn a panel on or off", storedOptions(() => true, p => `${p.enabled ? "Turn off" : "Turn on"} ${p.title}`),
        slug => a.panels.setEnabled(slug, !s.storedPanels.find(p => p.slug === slug)?.enabled)),
      available: () => (s.storedPanels.length ? OK : no("You have no stored panels yet.", "Ask your assistant to make one.")),
    },
    "panels.remove": {
      performer: pick("Delete which panel?", storedOptions(() => true, p => p.title), slug => a.panels.remove(slug)),
      available: () => (s.storedPanels.length ? OK : no("You have no stored panels.", undefined, true)),
    },
    "player.observation": { performer: local(() => a.copyObservation()), available: () => (s.hasObservation ? OK : no("Waiting for the game to load.")) },
    "player.events": { performer: local(() => a.dock.show("feed")) },
    "player.history": {
      performer: { kind: "handoff", draft: "Replay the log of our last finished game and tell me what decided it.", tool: "get_game_history" },
      available: () => assistantOn(s),
    },
    "player.trajectories": { performer: local(() => a.dock.show("bits-over-time")) },
    "player.myUtility": { performer: local(() => a.dock.show("my-card")) },
    "receipts.get": {
      performer: field("Check a command's status", "Command id", v => a.receipt(v.trim()), v => (v.trim().length >= 8 ? null : "Paste the command's id.")),
    },
    "rooms.join": { performer: submit(() => a.join()), available: () => no("You're already in this room.", undefined, true) },
    "rooms.chatHistory": { performer: local(() => a.dock.show("public-chat")) },
    "rooms.history": { performer: local(() => a.dock.show("results")) },
    "rooms.addAi": { performer: pick("Add an AI player", () => a.owner.aiCatalog(), id => a.owner.addAi(id)), available: () => betweenGames(s) },
    "rooms.removeAi": {
      performer: pick("Remove which AI player?", () => s.aiSeats, id => a.owner.removeAi(id)),
      available: () => both(betweenGames(s), s.aiSeats.length ? OK : no("No AI player is seated.")),
    },
    "rooms.endActiveGame": { performer: submit(() => a.owner.endGame()), available: () => (live(s.phase) ? OK : no("No game is running.")) },
    "rooms.resume": { performer: submit(() => a.owner.resume()), available: () => (s.phase === "paused" ? OK : no("The game is not stopped.")) },
  };
  const fromCatalog = commandsFromCatalog(CATALOG, (path: PublicFunctionPath, _entry: CatalogEntry) => BIND[path]?.performer ?? null, "player")
    .map(command => {
      const extra = BIND[command.id as PublicFunctionPath]?.available;
      const entry = CATALOG[command.id as PublicFunctionPath] as CatalogEntry;
      return extra ? { ...command, available: (ctx: PaletteContext) => both(availabilityFor(entry, ctx), extra()) } : command;
    });

  // ----- ui.* rows -----
  const ui = (id: string, title: string, tooltip: string, group: Command["group"], performer: Performer, extra: Partial<Command> = {}): Command =>
    ({ id, human: { title, tooltip }, group, performer, available: () => OK, ...extra });
  const always = (check: () => Availability) => ({ available: () => check() });

  const builtInRows = PANEL_IDS.map(id => id === "what-if"
    ? ui(`ui.panel.add.${id}`, `Add panel: ${PANELS[id].title}`, `${PANELS[id].blurb} Your assistant sets it up: it needs an object and a move.`, "view",
      { kind: "handoff", draft: "Show me in the What if… view what this move would do: ", tool: "open_panel" }, { keywords: [id, "panel", "view"], ...always(() => assistantOn(s)) })
    : ui(`ui.panel.add.${id}`, `Add panel: ${PANELS[id].title}`, PANELS[id].blurb, "view", local(() => a.dock.show(id)), { keywords: [id, "panel", "view", "show"] }));

  const paneRows: Command[] = [
    ui("ui.pane.change", "Change this panel…", "Pick what this pane shows; your assistant sets its details.", "view",
      pick("Show in this pane", PANEL_IDS.filter(id => id !== "what-if").map(id => ({ id, label: PANELS[id].title, detail: PANELS[id].blurb })),
        id => { if (s.scopePaneId) a.dock.change(s.scopePaneId, id as PanelId); }),
      { keywords: ["panel", "dropdown", "view"], available: ctx => (scope(ctx)?.kind === "panel" ? OK : no("Open the palette from a built-in panel's pane.", undefined, true)) }),
    ui("ui.pane.close", "Close pane", "Removes this pane; add it again from the palette.", "view", local(() => { if (s.scopePaneId) a.dock.close(s.scopePaneId); }), {
      keywords: ["remove", "hide"],
      available: ctx => {
        const pane = scope(ctx);
        if (!pane) return no("Open the palette from a pane.", undefined, true);
        if (pane.kind === "assistant") return no("The assistant pane stays; drag it smaller instead.");
        return pane.closable ? OK : no("The last panel stays; change it instead.");
      },
    }),
    ui("ui.pane.maximise", "Maximise or restore this pane", "Gives this pane the whole dock, or puts it back.", "view", local(() => { if (s.scopePaneId) a.dock.maximise(s.scopePaneId); }),
      { keywords: ["zoom", "full screen", "maximize"], available: ctx => (scope(ctx) ? OK : no("Open the palette from a pane.", undefined, true)) }),
    ui("ui.assistant.right", "Move assistant right", "Your assistant beside the panels, on the right.", "view", local(() => a.dock.dockAssistant("right")), { keywords: ["layout", "side"] }),
    ui("ui.assistant.bottom", "Move assistant to the bottom", "Your assistant below the panels.", "view", local(() => a.dock.dockAssistant("bottom")), { keywords: ["layout", "below"] }),
    ui("ui.assistant.left", "Move assistant left", "Your assistant beside the panels, on the left.", "view", local(() => a.dock.dockAssistant("left")), { keywords: ["layout", "side"] }),
    ui("ui.layout.stacked", "Layout: Stacked", "Panels on top, your assistant below.", "view", local(() => a.dock.preset("stacked")), { keywords: ["preset", "default"] }),
    ui("ui.layout.side-by-side", "Layout: Side by side", "Panels on the left, your assistant on the right.", "view", local(() => a.dock.preset("side-by-side")), { keywords: ["preset"] }),
    ui("ui.layout.two-panels", "Layout: Two panels", "Two panels stacked on the left, your assistant on the right.", "view", local(() => a.dock.preset("two-panels")), { keywords: ["preset"] }),
    ui("ui.layout.reset", "Reset layout", "Back to one panel on top and your assistant below.", "view", local(() => a.dock.reset()), { keywords: ["default", "layout"] }),
  ];

  const assistantRows: Command[] = [
    ui("ui.assistant.focus", "Focus assistant", "Puts the cursor in your assistant's message box.", "help", local(() => a.assistant.focus()), { shortcut: "Ctrl+`", keywords: ["chat", "ask"] }),
    ui("ui.assistant.new", "New conversation", "Starts a fresh conversation with your assistant.", "help", local(() => a.assistant.newThread()), { keywords: ["thread", "clear"], ...always(() => assistantOn(s)) }),
    ui("ui.assistant.settings", "Assistant settings…", "What your assistant may do as you; it asks before anything public or costly.", "help",
      pick("Your assistant may", [
        { id: "act", label: "Play for me", detail: "Asks before anything public or costly." },
        { id: "read", label: "Only look" },
        ...(s.isOwner ? [{ id: "owner", label: "Play for me, with owner powers", detail: "Each owner action still asks you." }] : []),
      ], id => a.assistant.setPermission(id as "read" | "act" | "owner")),
      { keywords: ["permission", "rights", "assistant"], ...always(() => assistantOn(s)) }),
  ];

  const gameRows: Command[] = [
    ui("ui.forge.edit", "Write agent code…", "Opens the agent editor: write or paste code, validate it for free, then summon.", "play", local(() => a.dock.forgeEdit()),
      { keywords: ["forge", "editor", "summon", "validate", "paste"] }),
    ui("ui.ready", s.ready ? "Mark me not ready" : "Mark me ready", "Tells the room whether you're ready for the next game; it gates nothing.", "play",
      submit(() => a.submit({ type: "ready", ready: !s.ready })), { keywords: ["ready"], ...always(() => gameplay(s)) }),
    ui("ui.pause", "Use my one pause…", "Stops the world for everyone, once per game.", "play", submit(() => a.submit({ type: "pause" })), {
      confirm: "modal", keywords: ["pause", "stop", "negotiate"],
      available: () => both(gameplay(s), s.phase === "running" ? OK : no("Only while the world runs."), s.pauseUsed ? no("You used your pause this game.") : OK),
    }),
    ui("ui.destroy", "Destroy an agent…", "Removes one of your agents for free; spent energy is not refunded.", "play",
      pick("Destroy which agent?", () => s.agents.map(agent => ({ id: agent.id, label: agent.label })), id => a.submit({ type: "destroy", agentId: id })), {
        confirm: "inline", keywords: ["kill", "remove", "agent"],
        available: () => both(gameplay(s), s.agents.length ? OK : no("You have no agents.")),
      }),
    ui("ui.chat", "Say publicly…", "Posts to everyone in the room, at once and without your assistant.", "play",
      field("Say to everyone", "Message (everyone reads it)", text => a.submit({ type: "chat", text: text.trim() }), v => (v.trim() ? (v.length > 2000 ? "At most 2,000 characters." : null) : "Write something first."), "Say to everyone…"),
      { keywords: ["chat", "message", "public", "negotiate"], ...always(() => gameplay(s)) }),
  ];

  const linkRows: Command[] = [
    ui("ui.room.copy-link", "Copy room link", "The room page's link, to invite people.", "room", local(() => a.links.copyRoomLink()),
      { keywords: ["invite", "share", "url"], ...always(() => (s.roomCode ? OK : no("Waiting for the room."))) }),
    ui("ui.room.open", "Open room page", "The room on the engine site: members, setup and past games.", "room", { kind: "navigate", to: () => a.links.roomPage() },
      { keywords: ["room", "lobby", "members"], ...always(() => (s.roomCode ? OK : no("Waiting for the room."))) }),
    ui("ui.game.open", "Open game page", "The public view of this game, for a big screen.", "room", { kind: "navigate", to: () => a.links.gamePage() ?? a.links.roomPage() },
      { keywords: ["game", "public", "spectate"], ...always(() => (s.gameCode ? OK : no("No game yet."))) }),
    ui("ui.safe-mode", s.safeMode ? "Leave safe mode" : "Safe mode: your panels off", s.safeMode ? "Loads your panels again." : "Reloads with built-in panels and your assistant only.", "help",
      local(() => a.links.safeMode(!s.safeMode)), { keywords: ["panels", "broken", "safe"] }),
    ui("ui.glossary", "Explain a term…", "What a word in this game means.", "help",
      pick("Explain a term", GLOSSARY_IDS.map(id => ({ id, label: GLOSSARY[id].term, detail: GLOSSARY[id].gloss })), id => {
        const { term, gloss } = GLOSSARY[id as keyof typeof GLOSSARY];
        if (s.assistantOn) a.assistant.handoff(`Explain "${term}" in this game, with an example from my situation.`);
        else a.notify(`${term}: ${gloss}`);
      }), { keywords: ["glossary", "help", "what is", "meaning"] }),
  ];

  const ownPanelRows: Command[] = [
    ...s.storedPanels.filter(p => p.enabled).map(p => ui(`ui.stored-panel.${p.slug}`, `Open your panel: ${p.title}`, "One of your stored panels, in a pane.", "view",
      local(() => a.panels.open(p.slug)), { keywords: ["panel", p.slug] })),
    ...s.filePanels.map(id => ui(`ui.file.${id}`, `Open file panel: ${id}`, `src/panels/${id}.tsx in a pane, live as you edit.`, "view",
      local(() => a.panels.openFile(id)), { keywords: ["panel", "file", id] })),
  ];

  return [...fromCatalog, ...builtInRows, ...paneRows, ...assistantRows, ...gameRows, ...linkRows, ...ownPanelRows];
}
