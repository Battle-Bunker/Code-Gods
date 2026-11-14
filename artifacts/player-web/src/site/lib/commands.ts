/**
 * The site pages' command list (docs/research/ui-redesign/palette-and-pages.md §2.8): every catalogue entry with an
 * engine palette spec, bound to a performer here (or excluded with a stated reason), plus the client-only `ui.*`
 * commands of the same human shape. The page buttons, their tooltips and the palette rows all come from here, so a
 * button and its palette row never disagree. Pure: the app passes its state and actions in.
 */
import { CATALOG, paletteEntries, type PublicFunctionPath } from "@workspace/player-client/catalog";
import { gamePath, roomPath, ruleGalleryPath } from "./routes.ts";
import {
  commandsFromCatalog, explainTermCommand, glossaryCommands, liveOptions, shortcutsCommand,
  type Availability, type Command, type PaletteContext, type PaletteGroup, type PaletteSection, type Performer, type PickOption,
} from "@workspace/ui-kit/core";
import type { GridRendererId } from "@workspace/object-views";
import { countWord, firstName } from "./next-step.ts";
import { openBidding } from "./bidding.ts";
export { STEP_IDS } from "./next-step.ts";

/** Client-only commands: the human text every button and palette row of these actions uses. */
export const UI_COMMANDS = {
  "ui.nav.home": { title: "Your rooms", tooltip: "Every room you created or joined, with its owner and creation date.", group: "room", section: "goto", keywords: ["home", "rooms", "list"] },
  "ui.nav.ruleGallery": { title: "Rule gallery", tooltip: "Every rule with picture-by-picture explanations, for a board you pick: try their settings and read their code.", group: "help", section: "goto", keywords: ["rules", "gallery", "families", "utility", "goals", "browse"] },
  "ui.nav.room": { title: "Room page", tooltip: "The room this game belongs to: its players, chat and next game.", group: "room", section: "goto", keywords: ["lobby", "back"] },
  "ui.nav.game": { title: "Watch live game", tooltip: "The shared view of the running game: leaderboard, objects and chat.", group: "room", section: "goto", keywords: ["arena", "spectate", "live"] },
  "ui.nav.pastGame": { title: "Open a past game…", tooltip: "The final results of a finished game of this room.", group: "room", section: "goto", keywords: ["results", "history"] },
  "ui.nav.configure": { title: "Configure the room's setup", tooltip: "Every setting of the game setup this room runs, on one page, each explained.", group: "owner", section: "actions", keywords: ["advanced", "settings", "configure", "setup"] },
  "ui.newSetup": { title: "New setup…", tooltip: "Makes your own copy of the room's current setup and opens it on the configuration page.", group: "owner", section: "actions", keywords: ["duplicate", "copy", "new", "configuration", "setup"] },
  "ui.nav.device": { title: "Approve a device code…", tooltip: "Review and approve the code a player app printed.", group: "account", section: "settings", keywords: ["device", "code", "connect", "cli"] },
  "ui.nav.admin": { title: "AI library", tooltip: "The AI players owners can seat, with their models and prompts.", group: "account", section: "settings", keywords: ["admin", "templates", "agents"] },
  "ui.copyInviteLink": { title: "Copy invite link", tooltip: "Copies this room's link; anyone who opens it can sign in and join.", group: "room", section: "actions", keywords: ["share", "invite", "link"] },
  "ui.addAiPlayer": { title: "Add AI player", tooltip: "Seats one AI player in the next game; it draws on the room's AI players' quota.", group: "owner", section: "actions", keywords: ["bot", "ai seat", "add", "computer"] },
  "ui.practiceGame": { title: "Play a practice game with AI players", tooltip: "Fills the empty seats with AI players and starts the game at once, so you can try the game by yourself.", group: "owner", section: "actions", keywords: ["solo", "alone", "practice", "practise", "bots", "try"] },
  "ui.connectInstructions": { title: "Connect a player app…", tooltip: "How to connect your own player app or coding agent to this room.", group: "account", section: "settings", keywords: ["cli", "connect", "credential", "replit", "codespaces"] },
  "ui.copyRules": { title: "Copy game rules for an AI", tooltip: "Copies this room's rules as text you can paste into any AI assistant.", group: "help", section: "help", keywords: ["rules", "prompt", "copy"] },
  "ui.help.scoring": { title: "How scoring works", tooltip: "Your rule score, ✨ rarity, and why what the others want decides your points.", group: "help", section: "help", keywords: ["points", "bits", "payoff", "score"] },
  "ui.help.howToPlay": { title: "How to play", tooltip: "The game in 90 seconds.", group: "help", section: "help", keywords: ["rules", "intro", "tutorial"] },
  "ui.auth.signIn": { title: "Sign in with Google", tooltip: "Sign in with your Google account to create or join rooms.", group: "account", section: "settings", keywords: ["login", "log in"] },
  "ui.auth.signOut": { title: "Sign out", tooltip: "Signs you out of this browser.", group: "account", section: "settings", keywords: ["logout", "log out"] },
  "ui.objects.renderer": { title: "Show grids as tiles", tooltip: "Draws every grid as coloured tiles with a pattern or letter per colour. Remembered in this browser.", group: "view", section: "views", keywords: ["grid", "tiles", "digits", "display", "compact", "colour"] },
} as const satisfies Record<string, { title: string; tooltip: string; group: PaletteGroup; section: PaletteSection; keywords: readonly string[] }>;
export type UiCommandId = keyof typeof UI_COMMANDS;

/** Catalogue entries with an engine palette spec that this app does not bind, and why (the parity test checks both). */
export const EXCLUDED: Partial<Record<PublicFunctionPath, string>> = {
  "rooms.chatHistory": "The room and game pages show the recent chat; paging back is the dock's (get_chat).",
};

/** A button's or link's tooltip: the catalogue's human tooltip, or the ui command's. One source for both apps' copy. */
export function tooltipFor(key: PublicFunctionPath | UiCommandId): string {
  return key in UI_COMMANDS ? UI_COMMANDS[key as UiCommandId].tooltip : CATALOG[key as PublicFunctionPath].human.tooltip;
}
export function titleFor(key: PublicFunctionPath | UiCommandId): string {
  return key in UI_COMMANDS ? UI_COMMANDS[key as UiCommandId].title : CATALOG[key as PublicFunctionPath].palette?.label ?? CATALOG[key as PublicFunctionPath].human.title;
}

export interface CmdRoom {
  id: string; shortCode: string; ownerId: string; ownerName: string;
  members: readonly { id: string; name: string; kind: string; ready: boolean; spectator?: boolean; provider?: string }[];
  activeGame: { shortCode: string; phase: string; roster: readonly { id: string }[] } | null;
  /** The room's owner is an administrator: AI seats, the assistant and the quotas are available (rooms.get `aiEnabled`). */
  aiEnabled: boolean; aiQuota: number; assistantQuota: number;
  /** The next game is preparing its rule tables (rooms.get `preparing`). */
  preparing?: { error?: string } | null;
  /** The next game's players are bidding for their rules (rooms.get `bidding`); End cancels the bidding. */
  bidding?: { error?: string } | null;
}
export interface CmdGame { shortCode: string; status: string; roomShortCode?: string | null; roster?: readonly { id: string }[]; ownerId?: string | null }
export interface Template { id: string; name: string; provider: string; model: string }
/** A subscription's current state, as the shared query hook reports it: no data while it loads. */
export type Live<T> = { data: T | undefined; error: Error | null };
/** A setup as a page of the catalogue lists it (setups.page): no owner's name (setups.row has it) and no settings. */
export interface SetupLike { id: string; name: string; summary: string; system: boolean; mine: boolean }

export interface EngineScope {
  user: { id: string; name: string; isAdmin: boolean } | null;
  room?: CmdRoom | null;
  game?: CmdGame | null;
  /** manifest.aiFunding.configured; undefined while the manifest loads. */
  aiConfigured?: boolean;
  /** The setup the room runs (room.setup.id), unless it was deleted. */
  currentSetup?: string;
  minPlayers: number;
  maxPlayers: number;
  /** This browser's start of the room is pending (@workspace/player-client/start): the click registered, the room has not changed yet. */
  starting?: boolean;
  /** How this viewer sees grids (lib/object-views' Grid renderer); digits when absent. */
  gridRenderer?: GridRendererId;
  /** The app is signed in with the engine site's own session (managing credentials needs it). Default true. */
  siteSession?: boolean;
}

export interface EngineActions {
  navigate(to: string): void;
  openTab(url: string): void;
  copy(text: string, what: string): void;
  login(): void;
  logout(): void;
  createRoom(): void;
  join(): Promise<unknown>;
  leave(): Promise<unknown>;
  setReady(ready: boolean): Promise<unknown>;
  /** Watch (true) or play the next game; `godId` sets another member's (owner). */
  setSpectator(spectator: boolean, godId?: string): Promise<unknown>;
  start(): Promise<unknown>;
  resume(): Promise<unknown>;
  startWorldNow(): Promise<unknown>;
  endGame(): Promise<unknown>;
  /** Seat an AI player: the library's default one, or the one chosen (`templateId`). */
  addAi(templateId?: string): Promise<unknown>;
  /** Seat AI players in the seats a game still needs, then start it. */
  practiceGame(): Promise<unknown>;
  removeAi(godId: string): Promise<unknown>;
  /** Put the next game on a setup at once (the app offers Undo). */
  applySetup(id: string): Promise<unknown>;
  /** Copy a setup as the viewer's own and open the copy on the room's configuration page. */
  duplicateSetup(id: string): Promise<unknown>;
  /*
   * The palette's lists: hooks over the app's shared subscription hook (useLive), called by a pick page while it is
   * shown, so each list is live while it is on screen and dropped after.
   */
  useTemplates(): Live<readonly Template[]>;
  useAdminTemplates(): Live<readonly Template[]>;
  usePastGames(): Live<readonly { shortCode: string; startedAt: number; winners: readonly { name: string }[] }[]>;
  useCredentials(): Live<readonly { credentialId: string; label?: string | null; kind?: string; permission: string; roomCode?: string | null }[]>;
  /** The first page of the setup catalogue (setups.page): the system's, then everyone's by name; with a query, the server's search. */
  useSetups(query: string): Live<readonly SetupLike[]>;
  revoke(credentialId: string): Promise<unknown>;
  openSheet(sheet: "ai-quotas" | "connected-apps" | "scoring" | "past-games"): void;
  rulesText(): string | null;
  /** The server's facts (a hook: the system setups' names are a subscription). */
  useServerInfo(): readonly string[];
  whoAmI(): readonly string[];
  /** setObjectRenderer("Grid", id): every grid this viewer sees redraws. */
  setGridRenderer(id: GridRendererId): void;
  origin: string;
}

export function paletteContextFor(scope: EngineScope): PaletteContext {
  const { user, room, game } = scope;
  const role: PaletteContext["role"] = !user ? "visitor"
    : room && room.ownerId === user.id ? "owner"
    : room?.activeGame?.roster.some(r => r.id === user.id) ? "seated"
    : room?.members.some(m => m.id === user.id) ? "member" : "signed-in";
  const phase = room?.activeGame ? (room.activeGame.phase === "recovery" ? "paused" : room.activeGame.phase) : game ? (game.status === "active" ? "running" : "ended") : room ? "lobby" : undefined;
  return { role, admin: !!user?.isAdmin, assistantOn: false, ...(phase ? { phase: phase as PaletteContext["phase"] } : {}) };
}

const ok: Availability = { ok: true };
const no = (reason: string, extra: Partial<Extract<Availability, { ok: false }>> = {}): Availability => ({ ok: false, reason, ...extra });

/** Every command of the site pages' palette for this scope. */
export function engineCommands(scope: EngineScope, act: EngineActions): Command[] {
  const { user, room, game } = scope;
  const isOwner = !!user && !!room && room.ownerId === user.id;
  const me = room?.members.find(m => m.id === user?.id);
  const running = room?.activeGame ?? null;
  const seated = !!user && !!running?.roster.some(r => r.id === user.id);
  const roomCode = room?.shortCode ?? game?.roomShortCode ?? null;
  const aiOff = scope.aiConfigured === false;
  const notAdminRoom = !!room && !room.aiEnabled;
  const adminOnly = "AI is only available in rooms run by an administrator for now.";
  const ais = room?.members.filter(m => m.kind === "ai") ?? [];
  const players = room?.members.filter(m => !m.spectator).length ?? 0;
  const bidding = !!openBidding(room) && !running;

  // State checks layered over the catalogue's audience rule (which stays first: "Only the room owner…").
  const needRoom = (a: Availability) => (!room ? no("Open a room first.", { hidden: true }) : a);
  const ownerOnly = (a: () => Availability): Availability => (!room ? no("Open a room first.", { hidden: true }) : !user ? no("Sign in first.", { hidden: true })
    : !isOwner ? no(`Only the owner, ${room.ownerName}, can do this.`) : a());
  const lobby = (a: Availability): Availability => (running ? no(`Changes wait until game ${running.shortCode} ends.`) : a);

  const addAi = (): Availability => (aiOff ? no("AI players are not set up on this server.", { hidden: true })
    : notAdminRoom ? no(adminOnly, { hidden: true })
    : ownerOnly(() => lobby(players >= scope.maxPlayers ? no(`The next game is full (${scope.maxPlayers} players).`) : ok)));
  // A practice game: the owner plays, AI players take the seats a game still needs, and it starts in the same click.
  const missing = Math.max(0, scope.minPlayers - players);
  // Its seats are practice partners (no model, engine aiTemplates.ts), so it needs neither an administrator's room nor
  // a provider key: only a lobby the owner runs, with room.
  const practice = (): Availability => {
    const a = ownerOnly(() => lobby(players >= scope.maxPlayers ? no(`The next game is full (${scope.maxPlayers} players).`) : ok));
    if (!a.ok) return a;
    if (me?.spectator) return no("You are watching the next game; play it first.", { fix: "rooms.setSpectator" });
    if (scope.starting) return no("The game is already starting.");
    if (room!.preparing && !room!.preparing.error) return no("The game is preparing its rule tables; it starts by itself.");
    return missing ? ok : no("Enough players are in: start the game.", { fix: "owner.start" });
  };

  const states: Partial<Record<PublicFunctionPath, (base: Availability) => Availability>> = {
    "owner.start": () => ownerOnly(() => running ? no(`Game ${running.shortCode} is already running.`)
      : scope.starting ? no("The game is already starting.")
      : room!.preparing && !room!.preparing.error ? no("The game is preparing its rule tables; it starts by itself.")
      : bidding ? no("The players are bidding for their rules; the game starts by itself when bidding ends.")
      : notAdminRoom && ais.some(a => !a.spectator && a.provider !== "builtin") ? no(`${adminOnly} Remove the AI players to start.`, { fix: "rooms.removeAi" })
      : players < scope.minPlayers ? no(`Needs ${scope.minPlayers} players; ${players} ${players === 1 ? "plays" : "play"} (spectators don't count).`, aiOff || notAdminRoom ? {} : { fix: "rooms.addAi" }) : ok),
    "owner.settings": () => ownerOnly(() => lobby(ok)),
    "rooms.addAi": () => addAi(),
    "rooms.removeAi": () => (aiOff && !ais.length ? no("AI players are not set up on this server.", { hidden: true })
      : ownerOnly(() => lobby(ais.length ? ok : no("No AI players are seated.")))),
    // With no game running it ends a preparation (the next game computing its rule tables) or cancels the bidding.
    "rooms.endActiveGame": () => ownerOnly(() => running || room!.preparing || room!.bidding ? ok : no("No game is running.")),
    "rooms.startWorldNow": () => ownerOnly(() => running?.phase === "planning" ? ok : no(running ? "The world has started." : "No game is running.")),
    "rooms.resume": () => ownerOnly(() => running?.phase === "recovery" ? ok : no(running ? "The game is not paused for safety." : "No game is running.")),
    "rooms.setAiQuotas": () => (aiOff ? no("AI players are not set up on this server.", { hidden: true }) : notAdminRoom ? no(adminOnly, { hidden: true }) : ownerOnly(() => ok)),
    "rooms.join": () => (!user ? no("Sign in first.") : needRoom(me ? no("You are already in this room.", { hidden: true }) : ok)),
    "rooms.leave": () => (!room || !me ? no("You are not in this room.", { hidden: true }) : isOwner ? no("The owner cannot leave their room.", { hidden: true })
      : seated ? no(`You are playing in game ${running!.shortCode}; leave after it ends.`) : ok),
    "rooms.setReady": () => (!room || !me ? no("Join the room first.", { hidden: !room }) : me.spectator ? no("Spectators have no ready state.", { hidden: true }) : ok),
    "rooms.setSpectator": () => (!room || !me ? no("Join the room first.", { hidden: !room })
      : room.preparing && !room.preparing.error ? no("The next game is preparing with its players dealt.")
      : bidding ? no("The next game's players are bidding for their rules; change this after it starts.")
      : me.spectator && players >= scope.maxPlayers ? no(`The next game is full (${scope.maxPlayers} players).`) : ok),
    "rooms.history": () => needRoom(ok),
    "rooms.create": () => (user ? ok : no("Sign in first.")),
    // Connected apps are managed on the engine's own site (its Google session), never by an app's grant.
    "auth.credentials.list": base => (scope.siteSession === false ? no("Connected apps are managed on the engine's site: its menu, Connected apps.") : base),
    "auth.credentials.revoke": base => (scope.siteSession === false ? no("Connected apps are managed on the engine's site: its menu, Connected apps.") : base),
  };
  const binds: Partial<Record<PublicFunctionPath, Performer | null>> = {
    "aiTemplates.create": { kind: "navigate", to: "/admin/agents/new" },
    "aiTemplates.update": { kind: "form", page: { kind: "pick", title: "Edit an AI player template", empty: "The library is empty.",
      useOptions: () => liveOptions(act.useAdminTemplates(), t => ({ id: t.id, label: t.name, detail: `${t.provider} · ${t.model}` })), onPick: id => act.navigate(`/admin/agents/${encodeURIComponent(id)}`) } },
    "aiTemplates.remove": { kind: "form", page: { kind: "pick", title: "Delete an AI player template", empty: "The library is empty.",
      useOptions: () => liveOptions(act.useAdminTemplates(), t => ({ id: t.id, label: t.name, detail: "Opens it; Delete is at the bottom" })), onPick: id => act.navigate(`/admin/agents/${encodeURIComponent(id)}`) } },
    "auth.credentials.list": { kind: "local", run: () => act.openSheet("connected-apps") },
    "auth.credentials.revoke": { kind: "form", page: { kind: "pick", title: "Revoke a connected app", empty: "No app holds a credential for you.",
      useOptions: () => liveOptions(act.useCredentials(), (c): PickOption => ({ id: c.credentialId, label: c.label || "Unlabelled app", detail: `${c.permission} · room ${c.roomCode ?? "gone"}` })),
      onPick: id => act.revoke(id) } },
    "auth.user.me": { kind: "form", page: { kind: "info", title: "Who am I", lines: act.whoAmI() } },
    "manifest.get": { kind: "form", page: { kind: "info", title: "Server info", useLines: () => act.useServerInfo() } },
    "owner.settings": { kind: "form", page: { kind: "pick", title: "Choose the next game's setup", empty: "No setups yet.",
      // The server searches name, owner and summary (setups.page's search index); the list shows its answer as given.
      useOptions: query => ({ ...liveOptions(act.useSetups(query), (s): PickOption => ({ id: s.id, label: `${s.name}${s.id === scope.currentSetup ? " (current)" : ""}`,
        detail: s.system ? `System · ${s.summary}` : s.mine ? `You · ${s.summary}` : s.summary })), searched: !!query }),
      onPick: id => act.applySetup(id) } },
    "owner.start": { kind: "submit", run: act.start },
    "rooms.create": { kind: "local", run: act.createRoom },
    "rooms.join": { kind: "submit", run: act.join },
    "rooms.leave": { kind: "submit", run: act.leave },
    "rooms.setReady": { kind: "submit", run: () => act.setReady(!me?.ready) },
    "rooms.setSpectator": { kind: "submit", run: () => act.setSpectator(!me?.spectator) },
    "rooms.history": { kind: "local", run: () => act.openSheet("past-games") },
    "rooms.setAiQuotas": { kind: "local", run: () => act.openSheet("ai-quotas") },
    "rooms.addAi": { kind: "form", page: { kind: "pick", title: "Add an AI player", empty: "The AI library is empty; an admin adds AI players.",
      useOptions: () => liveOptions(act.useTemplates(), t => ({ id: t.id, label: t.name, detail: `${t.model} · uses the room's AI players' quota`, keywords: [t.provider, t.model] })),
      onPick: id => act.addAi(id) } },
    "rooms.removeAi": { kind: "form", page: { kind: "pick", title: "Remove an AI player", empty: "No AI players are seated.",
      options: () => ais.map(m => ({ id: m.id, label: m.name, detail: "Press ↵ twice to remove" })), onPick: id => act.removeAi(id) } },
    "rooms.endActiveGame": { kind: "submit", run: act.endGame },
    "rooms.resume": { kind: "submit", run: act.resume },
    "rooms.startWorldNow": { kind: "submit", run: act.startWorldNow },
  };

  const fromCatalog = commandsFromCatalog(CATALOG, path => (path in EXCLUDED ? null : binds[path] ?? null), "site").map(c => {
    const state = states[c.id as PublicFunctionPath];
    const extra: Partial<Command> = {};
    if (c.id === "rooms.setSpectator") extra.human = { title: me?.spectator ? "Play the next game" : "Watch the next game", tooltip: c.human.tooltip };
    if (c.id === "rooms.setReady") extra.human = { title: me?.ready ? "Mark me not ready" : "Mark me ready", tooltip: c.human.tooltip };
    // The plain "Add AI player" seats the default one; this row is the choice of which.
    if (c.id === "rooms.addAi") extra.human = { title: "Add an AI player: choose which…", tooltip: c.human.tooltip };
    if (c.id === "rooms.setAiQuotas") extra.confirm = "none"; // the sheet is the form and its Save the confirmation
    if (c.id === "owner.start" && room) extra.summary = () => `${players} players (${ais.length} AI) start now; each gets a secret goal. Spectators watch.`;
    if (c.id === "rooms.endActiveGame" && bidding) { extra.human = { title: "Cancel bidding", tooltip: "Stops the bidding: nothing is dealt and no game starts. You can start again." }; extra.confirmLabel = "Cancel bidding"; extra.summary = () => "The bidding stops and nothing is dealt. You can start again."; }
    if (c.id === "rooms.endActiveGame" && running) { extra.confirmLabel = `End game ${running.shortCode}`; extra.summary = () => `The current leaderboard becomes the final result of game ${running.shortCode}.`; }
    // A state check replaces the audience rule: it knows the room (the owner's name, who is seated, what runs).
    return { ...c, ...extra, available: state ? (ctx: PaletteContext) => state(c.available(ctx)) : c.available };
  });

  const ui = (id: UiCommandId, performer: Performer, available: () => Availability = () => ok, extra: Partial<Command> = {}): Command => {
    const u = UI_COMMANDS[id];
    return { id, human: { title: u.title, tooltip: u.tooltip }, group: u.group, section: u.section, keywords: u.keywords, performer, available, ...extra };
  };
  const signedIn = () => (user ? ok : no("Sign in first.", { hidden: true }));
  const inRoom = () => (!room ? no("Open a room first.", { hidden: true }) : ok);
  const member = () => (!room ? no("Open a room first.", { hidden: true }) : !me ? no("Join the room first.", { fix: "rooms.join" }) : ok);

  const uiCommands: Command[] = [
    ui("ui.nav.home", { kind: "navigate", to: "/" }, signedIn),
    ui("ui.nav.ruleGallery", { kind: "navigate", to: ruleGalleryPath() }, signedIn),
    ui("ui.nav.room", { kind: "navigate", to: `/rooms/${roomCode ?? ""}` }, () => (game && roomCode ? ok : no("No room here.", { hidden: true }))),
    ui("ui.nav.game", { kind: "navigate", to: gamePath(roomCode ?? "", running?.shortCode ?? "") }, () => (!room ? no("Open a room first.", { hidden: true }) : running ? ok : no("No game is running."))),
    ui("ui.nav.pastGame", { kind: "form", page: { kind: "pick", title: "Open a past game", empty: "No games have finished in this room yet.",
      useOptions: () => liveOptions(act.usePastGames(), g => ({ id: g.shortCode, label: `Game ${g.shortCode}`, detail: g.winners.length ? `won by ${g.winners.map(w => w.name).join(", ")}` : "no winner recorded" })),
      onPick: code => act.navigate(gamePath(roomCode ?? "", code)) } }, inRoom),
    ui("ui.nav.configure", { kind: "navigate", to: `/rooms/${roomCode ?? ""}/configure` }, () => (!room ? no("Open a room first.", { hidden: true }) : ok)),
    ui("ui.newSetup", { kind: "submit", run: () => act.duplicateSetup(scope.currentSetup!) },
      () => (!room ? no("Open a room first.", { hidden: true }) : !user ? no("Sign in first.") : !scope.currentSetup ? no("The room's setup was deleted: open Configure the room's setup to keep its settings as yours.", { fix: "ui.nav.configure" }) : ok)),
    ui("ui.nav.device", { kind: "navigate", to: "/device" }, signedIn),
    ui("ui.nav.admin", { kind: "navigate", to: "/admin/agents" }, () => (user?.isAdmin ? ok : no("Only admins can do this.", { hidden: true }))),
    ui("ui.copyInviteLink", { kind: "local", run: () => roomCode && act.copy(`${act.origin}/rooms/${roomCode}`, "Invite link") }, () => (roomCode ? ok : no("Open a room first.", { hidden: true }))),
    ui("ui.addAiPlayer", { kind: "submit", run: () => act.addAi() }, addAi),
    ui("ui.practiceGame", { kind: "submit", run: act.practiceGame }, practice, missing > 0 ? {
      human: { title: `Play a practice game with ${countWord(missing)} AI ${missing === 1 ? "player" : "players"}`, tooltip: UI_COMMANDS["ui.practiceGame"].tooltip },
    } : {}),
    ui("ui.connectInstructions", { kind: "form", page: { kind: "info", title: "Connect a player app", lines: [
      `1. In your app's environment, set CODE_GODS_ENGINE_URL to ${act.origin}`,
      `2. Run: pnpm player connect --room ${roomCode ?? "CODE"}`,
      "3. Approve the code it prints (Approve a device code…), then save the credential it prints as CODE_GODS_CREDENTIAL.",
    ], copy: { label: "Copy the connect command", text: `pnpm player connect --room ${roomCode ?? "CODE"}` } } }, member),
    ui("ui.copyRules", { kind: "local", run: () => { const t = act.rulesText(); if (t) act.copy(t, "Game rules"); } }, () => (room || game ? ok : no("Open a room or game first.", { hidden: true }))),
    ui("ui.help.scoring", { kind: "local", run: () => act.openSheet("scoring") }, () => ok, { defaultScore: 1 }),
    ui("ui.help.howToPlay", { kind: "form", page: { kind: "info", title: "How to play", lines: HOW_TO_PLAY } }, () => ok, { defaultScore: 2 }),
    ui("ui.auth.signIn", { kind: "local", run: act.login }, () => (user ? no("You are signed in.", { hidden: true }) : ok)),
    ui("ui.auth.signOut", { kind: "local", run: act.logout }, signedIn),
    scope.gridRenderer === "tiles"
      ? ui("ui.objects.renderer", { kind: "local", run: () => act.setGridRenderer("digits") }, () => ok,
        { human: { title: "Show grids as coloured digits", tooltip: "Draws every grid as rows of coloured digits: compact and quick to scan. Remembered in this browser." } })
      : ui("ui.objects.renderer", { kind: "local", run: () => act.setGridRenderer("tiles") }),
    explainTermCommand(1),
    shortcutsCommand(),
    ...glossaryCommands(),
  ];

  // Default scores: what the empty-query view shows (everything else appears when typed).
  const scores: Record<string, number> = {
    "owner.start": 9, "rooms.resume": 9, "rooms.join": 9, "ui.copyInviteLink": 7, "ui.addAiPlayer": 6, "ui.practiceGame": 8,
    "owner.settings": 5, "ui.nav.configure": 4, "ui.newSetup": 3, "rooms.endActiveGame": 3, "rooms.create": 6,
    "ui.nav.game": 6, "ui.nav.room": 5, "ui.nav.home": 4, "ui.nav.pastGame": 2, "rooms.history": 1,
  };
  return [...fromCatalog, ...uiCommands].map(c => (scores[c.id] ? { ...c, defaultScore: scores[c.id] } : c));
}

/** "Open room K7QX" for a code-shaped query (the rooms list's join-by-code). Games open from their room. */
export function codeCommands(query: string, _act: Pick<EngineActions, "navigate">): Command[] {
  const code = query.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,36}$/.test(code)) return [];
  return [{
    id: `dyn:room:${code}`, human: { title: `Open room ${code}`, tooltip: "Goes to that room; you can join it there." },
    group: "room", section: "goto", performer: { kind: "navigate", to: roomPath(code) }, available: () => ok,
  }];
}


/** The game in 90 seconds (onboarding-and-config.md §2), for "How to play". */
export const HOW_TO_PLAY: readonly string[] = [
  "Code Gods is a game about a shared world and secret wishes.",
  "The world is a crowd of objects: usually small grids of coloured numbers. Every player is a god with a secret goal card, a short rule that gives every object a rule score, such as \"I like grids with red corners\". The higher the rule score, the rarer the object is by your rule (its ✨ rarity).",
  "You cannot touch objects yourself. You summon agents: tiny Python or TypeScript programs that, when the world picks them, make a few moves on a random object: swap, paint, slide. Summoning costs your ⚡ energy, which you earn every second, and shorter programs cost less. Each agent then earns its own energy and spends some on every move.",
  "Here is the twist. Your points from an object are its ✨ rarity by your rule times how much the other players, together, want it. So +1 on your rule score is not +1 point, and an object only you want gives you 0 points. You cannot see anyone else's rule, only the total. So talk: say what you want in the public chat, find overlaps, strike deals, call out agents that wreck your favourites.",
  "A first game ends when its countdown reaches zero (some setups hide the end and stop at a random moment instead). Your final points are the points of every object alive then, added up. Your assistant can explain, write agents and draft messages for you.",
];

export { firstName };
export const allCatalogSitePaths = () => paletteEntries("site").map(e => e.path);
