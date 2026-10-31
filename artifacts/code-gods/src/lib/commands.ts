/**
 * The engine UI's command list (docs/research/ui-redesign/palette-and-pages.md §2.8): every catalogue entry with an
 * engine palette spec, bound to a performer here (or excluded with a stated reason), plus the client-only `ui.*`
 * commands of the same human shape. The page buttons, their tooltips and the palette rows all come from here, so a
 * button and its palette row never disagree. Pure: the app passes its state and actions in.
 */
import { CATALOG, paletteEntries, type PublicFunctionPath } from "@workspace/player-client/catalog";
import {
  commandsFromCatalog, explainTermCommand, glossaryCommands, shortcutsCommand,
  type Availability, type Command, type PaletteContext, type PaletteGroup, type PaletteSection, type Performer, type PickOption,
} from "@workspace/ui-kit/core";
import { firstName } from "./next-step.ts";
export { STEP_IDS } from "./next-step.ts";

/** Client-only commands: the human text every button and palette row of these actions uses. */
export const UI_COMMANDS = {
  "ui.nav.home": { title: "Your rooms", tooltip: "Every room you created or joined, with its owner and creation date.", group: "room", section: "goto", keywords: ["home", "rooms", "list"] },
  "ui.nav.room": { title: "Room page", tooltip: "The room this game belongs to: its players, chat and next game.", group: "room", section: "goto", keywords: ["lobby", "back"] },
  "ui.nav.game": { title: "Watch live game", tooltip: "The shared view of the running game: leaderboard, objects and chat.", group: "room", section: "goto", keywords: ["arena", "spectate", "live"] },
  "ui.nav.pastGame": { title: "Open a past game…", tooltip: "The final results of a finished game of this room.", group: "room", section: "goto", keywords: ["results", "history"] },
  "ui.nav.playerClient": { title: "Open player client", tooltip: "Opens the screen where you play: your goal, your agents and your assistant.", group: "play", section: "actions", keywords: ["play", "console", "client"] },
  "ui.nav.newConfiguration": { title: "New game configuration…", tooltip: "Every setting of the next game on one page, each explained.", group: "owner", section: "actions", keywords: ["custom", "advanced", "settings", "configure"] },
  "ui.nav.device": { title: "Approve a device code…", tooltip: "Review and approve the code a player app printed.", group: "account", section: "settings", keywords: ["device", "code", "connect", "cli"] },
  "ui.nav.admin": { title: "AI library", tooltip: "The AI players owners can seat, with their models and prompts.", group: "account", section: "settings", keywords: ["admin", "templates", "agents"] },
  "ui.copyInviteLink": { title: "Copy invite link", tooltip: "Copies this room's link; anyone who opens it can sign in and join.", group: "room", section: "actions", keywords: ["share", "invite", "link"] },
  "ui.connectInstructions": { title: "Connect a player app…", tooltip: "How to connect your own player app or coding agent to this room.", group: "account", section: "settings", keywords: ["cli", "connect", "credential", "replit", "codespaces"] },
  "ui.copyRules": { title: "Copy game rules for an AI", tooltip: "Copies this room's rules as text you can paste into any AI assistant.", group: "help", section: "help", keywords: ["rules", "prompt", "copy"] },
  "ui.help.scoring": { title: "How scoring works", tooltip: "Rarity bits, defence goals and why others' care decides your points.", group: "help", section: "help", keywords: ["points", "bits", "payoff", "score"] },
  "ui.help.howToPlay": { title: "How to play", tooltip: "The game in 90 seconds.", group: "help", section: "help", keywords: ["rules", "intro", "tutorial"] },
  "ui.aiSpending": { title: "AI spending…", tooltip: "The AI players' token budget and every player's assistant allowance.", group: "owner", section: "settings", keywords: ["budget", "tokens", "billing", "assistant"] },
  "ui.auth.signIn": { title: "Sign in with Google", tooltip: "Sign in with your Google account to create or join rooms.", group: "account", section: "settings", keywords: ["login", "log in"] },
  "ui.auth.signOut": { title: "Sign out", tooltip: "Signs you out of this browser.", group: "account", section: "settings", keywords: ["logout", "log out"] },
  "ui.objects.renderer": { title: "Show grids as tiles", tooltip: "Draws every grid as coloured tiles with a pattern or letter per colour. Remembered in this browser.", group: "view", section: "views", keywords: ["grid", "tiles", "digits", "display", "compact", "colour"] },
} as const satisfies Record<string, { title: string; tooltip: string; group: PaletteGroup; section: PaletteSection; keywords: readonly string[] }>;
export type UiCommandId = keyof typeof UI_COMMANDS;

/** Catalogue entries with an engine palette spec that this app does not bind, and why (the parity test checks both). */
export const EXCLUDED: Partial<Record<PublicFunctionPath, string>> = {
  "rooms.chatHistory": "The room and game pages show the recent chat; paging back is the player client's (get_chat).",
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
  members: readonly { id: string; name: string; kind: string; ready: boolean }[];
  activeGame: { shortCode: string; phase: string; roster: readonly { id: string }[] } | null;
  aiBudget: number; assistantBudget: number;
}
export interface CmdGame { shortCode: string; status: string; roomShortCode?: string | null }
export interface Template { id: string; name: string; provider: string; model: string }
export interface PresetLike { id: string; label: string; kid: string; offered: boolean }

export interface EngineScope {
  user: { id: string; name: string; isAdmin: boolean } | null;
  room?: CmdRoom | null;
  game?: CmdGame | null;
  /** manifest.aiFunding.configured; undefined while the manifest loads. */
  aiConfigured?: boolean;
  presets: readonly PresetLike[];
  /** The preset the room's settings match, if any. */
  currentPreset?: string;
  minPlayers: number;
  maxPlayers: number;
  /** How this viewer sees grids (lib/object-views' Grid renderer); digits when absent. */
  gridRenderer?: "digits" | "tiles";
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
  start(): Promise<unknown>;
  resume(): Promise<unknown>;
  endGame(): Promise<unknown>;
  /** Seat an AI player (the app asks for the AI budget first when it is 0). */
  addAi(templateId: string): Promise<unknown>;
  removeAi(godId: string): Promise<unknown>;
  applyPreset(id: string): Promise<unknown>;
  templates(): Promise<readonly Template[]>;
  adminTemplates(): Promise<readonly Template[]>;
  pastGames(): Promise<readonly { shortCode: string; startedAt: number; winners: readonly { name: string }[] }[]>;
  credentials(): Promise<readonly { credentialId: string; label?: string | null; kind?: string; permission: string; roomCode?: string | null }[]>;
  revoke(credentialId: string): Promise<unknown>;
  openSheet(sheet: "ai-spending" | "connected-apps" | "scoring" | "past-games"): void;
  rulesText(): string | null;
  serverInfo(): readonly string[];
  whoAmI(): readonly string[];
  /** setObjectRenderer("Grid", id): every grid this viewer sees redraws. */
  setGridRenderer(id: "digits" | "tiles"): void;
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

/** Every command of the engine UI for this scope. */
export function engineCommands(scope: EngineScope, act: EngineActions): Command[] {
  const { user, room, game } = scope;
  const isOwner = !!user && !!room && room.ownerId === user.id;
  const me = room?.members.find(m => m.id === user?.id);
  const running = room?.activeGame ?? null;
  const seated = !!user && !!running?.roster.some(r => r.id === user.id);
  const roomCode = room?.shortCode ?? game?.roomShortCode ?? null;
  const aiOff = scope.aiConfigured === false;
  const ais = room?.members.filter(m => m.kind === "ai") ?? [];
  const playerUrl = (code: string) => `/player/?room=${encodeURIComponent(code)}`;

  // State checks layered over the catalogue's audience rule (which stays first: "Only the room owner…").
  const needRoom = (a: Availability) => (!room ? no("Open a room first.", { hidden: true }) : a);
  const ownerOnly = (a: () => Availability): Availability => (!room ? no("Open a room first.", { hidden: true }) : !user ? no("Sign in first.", { hidden: true })
    : !isOwner ? no(`Only the owner, ${room.ownerName}, can do this.`) : a());
  const lobby = (a: Availability): Availability => (running ? no(`Changes wait until game ${running.shortCode} ends.`) : a);

  const states: Partial<Record<PublicFunctionPath, (base: Availability) => Availability>> = {
    "owner.start": () => ownerOnly(() => running ? no(`Game ${running.shortCode} is already running.`)
      : room!.members.length < scope.minPlayers ? no(`Needs ${scope.minPlayers} players; ${room!.members.length} ${room!.members.length === 1 ? "has" : "have"} joined.`, aiOff ? {} : { fix: "rooms.addAi" }) : ok),
    "owner.settings": () => ownerOnly(() => lobby(ok)),
    "rooms.addAi": () => (aiOff ? no("AI players are not set up on this server.", { hidden: true })
      : ownerOnly(() => lobby(room!.members.length >= scope.maxPlayers ? no(`The room is full (${scope.maxPlayers} players).`) : ok))),
    "rooms.removeAi": () => (aiOff && !ais.length ? no("AI players are not set up on this server.", { hidden: true })
      : ownerOnly(() => lobby(ais.length ? ok : no("No AI players are seated.")))),
    "rooms.endActiveGame": () => ownerOnly(() => running ? ok : no("No game is running.")),
    "rooms.resume": () => ownerOnly(() => running?.phase === "recovery" ? ok : no(running ? "The game is not paused for safety." : "No game is running.")),
    "rooms.approveAiBudget": () => ownerOnly(() => ok),
    "rooms.join": () => (!user ? no("Sign in first.") : needRoom(me ? no("You are already in this room.", { hidden: true }) : ok)),
    "rooms.leave": () => (!room || !me ? no("You are not in this room.", { hidden: true }) : isOwner ? no("The owner cannot leave their room.", { hidden: true })
      : seated ? no(`You are playing in game ${running!.shortCode}; leave after it ends.`) : ok),
    "rooms.setReady": () => (!room || !me ? no("Join the room first.", { hidden: !room }) : ok),
    "rooms.history": () => needRoom(ok),
    "rooms.create": () => (user ? ok : no("Sign in first.")),
  };
  const binds: Partial<Record<PublicFunctionPath, Performer | null>> = {
    "aiTemplates.create": { kind: "navigate", to: "/admin/agents/new" },
    "aiTemplates.update": { kind: "form", page: { kind: "pick", title: "Edit an AI player template", empty: "The library is empty.",
      options: async () => (await act.adminTemplates()).map(t => ({ id: t.id, label: t.name, detail: `${t.provider} · ${t.model}` })), onPick: id => act.navigate(`/admin/agents/${encodeURIComponent(id)}`) } },
    "aiTemplates.remove": { kind: "form", page: { kind: "pick", title: "Delete an AI player template", empty: "The library is empty.",
      options: async () => (await act.adminTemplates()).map(t => ({ id: t.id, label: t.name, detail: "Opens it; Delete is at the bottom" })), onPick: id => act.navigate(`/admin/agents/${encodeURIComponent(id)}`) } },
    "auth.credentials.list": { kind: "local", run: () => act.openSheet("connected-apps") },
    "auth.credentials.revoke": { kind: "form", page: { kind: "pick", title: "Revoke a connected app", empty: "No app holds a credential for you.",
      options: async () => (await act.credentials()).map((c): PickOption => ({ id: c.credentialId, label: c.label || "Unlabelled app", detail: `${c.permission} · room ${c.roomCode ?? "gone"}` })),
      onPick: id => act.revoke(id) } },
    "auth.user.me": { kind: "form", page: { kind: "info", title: "Who am I", lines: act.whoAmI() } },
    "manifest.get": { kind: "form", page: { kind: "info", title: "Server info", lines: act.serverInfo() } },
    "owner.settings": { kind: "form", page: { kind: "pick", title: "Choose the next game's setup",
      options: () => scope.presets.map((p): PickOption => ({ id: p.id, label: `${p.label}${p.id === scope.currentPreset ? " (current)" : ""}`, detail: p.kid,
        ...(p.offered ? {} : { unavailable: "Not available on this server yet" }) })),
      onPick: id => act.applyPreset(id) } },
    "owner.start": { kind: "submit", run: act.start },
    "rooms.create": { kind: "local", run: act.createRoom },
    "rooms.join": { kind: "submit", run: act.join },
    "rooms.leave": { kind: "submit", run: act.leave },
    "rooms.setReady": { kind: "submit", run: () => act.setReady(!me?.ready) },
    "rooms.history": { kind: "local", run: () => act.openSheet("past-games") },
    "rooms.approveAiBudget": { kind: "local", run: () => act.openSheet("ai-spending") },
    "rooms.addAi": { kind: "form", page: { kind: "pick", title: "Add an AI player", empty: "The AI library is empty; an admin adds AI players.",
      options: async () => (await act.templates()).map(t => ({ id: t.id, label: t.name, detail: `${t.model} · uses the room's AI budget`, keywords: [t.provider, t.model] })),
      onPick: id => act.addAi(id) } },
    "rooms.removeAi": { kind: "form", page: { kind: "pick", title: "Remove an AI player", empty: "No AI players are seated.",
      options: () => ais.map(m => ({ id: m.id, label: m.name, detail: "Press ↵ twice to remove" })), onPick: id => act.removeAi(id) } },
    "rooms.endActiveGame": { kind: "submit", run: act.endGame },
    "rooms.resume": { kind: "submit", run: act.resume },
  };

  const fromCatalog = commandsFromCatalog(CATALOG, path => (path in EXCLUDED ? null : binds[path] ?? null), "engine").map(c => {
    const state = states[c.id as PublicFunctionPath];
    const extra: Partial<Command> = {};
    if (c.id === "rooms.setReady") extra.human = { title: me?.ready ? "Mark me not ready" : "Mark me ready", tooltip: c.human.tooltip };
    if (c.id === "rooms.approveAiBudget") extra.confirm = "none"; // the sheet carries the consent
    if (c.id === "owner.start" && room) extra.summary = () => `${room.members.length} players (${room.members.filter(m => m.kind === "ai").length} AI) start now; each gets a secret goal.`;
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
    ui("ui.nav.room", { kind: "navigate", to: `/rooms/${roomCode ?? ""}` }, () => (game && roomCode ? ok : no("No room here.", { hidden: true }))),
    ui("ui.nav.game", { kind: "navigate", to: `/games/${running?.shortCode ?? ""}` }, () => (!room ? no("Open a room first.", { hidden: true }) : running ? ok : no("No game is running."))),
    ui("ui.nav.pastGame", { kind: "form", page: { kind: "pick", title: "Open a past game", empty: "No games have finished in this room yet.",
      options: async () => (await act.pastGames()).map(g => ({ id: g.shortCode, label: `Game ${g.shortCode}`, detail: g.winners.length ? `won by ${g.winners.map(w => w.name).join(", ")}` : "no winner recorded" })),
      onPick: code => act.navigate(`/games/${encodeURIComponent(code)}`) } }, inRoom),
    ui("ui.nav.playerClient", { kind: "local", run: () => roomCode && act.openTab(playerUrl(roomCode)) }, () => (!roomCode ? no("Open a room first.", { hidden: true }) : room && !me ? no("Join the room first.", { fix: "rooms.join" }) : ok)),
    ui("ui.nav.newConfiguration", { kind: "navigate", to: `/rooms/${roomCode ?? ""}/configure` }, () => (!room ? no("Open a room first.", { hidden: true }) : ok)),
    ui("ui.nav.device", { kind: "navigate", to: "/device" }, signedIn),
    ui("ui.nav.admin", { kind: "navigate", to: "/admin/agents" }, () => (user?.isAdmin ? ok : no("Only admins can do this.", { hidden: true }))),
    ui("ui.copyInviteLink", { kind: "local", run: () => roomCode && act.copy(`${act.origin}/rooms/${roomCode}`, "Invite link") }, () => (roomCode ? ok : no("Open a room first.", { hidden: true }))),
    ui("ui.connectInstructions", { kind: "form", page: { kind: "info", title: "Connect a player app", lines: [
      `1. In your app's environment, set CODE_GODS_ENGINE_URL to ${act.origin}`,
      `2. Run: pnpm player connect --room ${roomCode ?? "CODE"}`,
      "3. Approve the code it prints (Approve a device code…), then save the credential it prints as CODE_GODS_CREDENTIAL.",
    ], copy: { label: "Copy the connect command", text: `pnpm player connect --room ${roomCode ?? "CODE"}` } } }, member),
    ui("ui.copyRules", { kind: "local", run: () => { const t = act.rulesText(); if (t) act.copy(t, "Game rules"); } }, () => (room || game ? ok : no("Open a room or game first.", { hidden: true }))),
    ui("ui.help.scoring", { kind: "local", run: () => act.openSheet("scoring") }, () => ok, { defaultScore: 1 }),
    ui("ui.help.howToPlay", { kind: "form", page: { kind: "info", title: "How to play", lines: HOW_TO_PLAY } }, () => ok, { defaultScore: 2 }),
    ui("ui.aiSpending", { kind: "local", run: () => act.openSheet("ai-spending") }, () => (!room ? no("Open a room first.", { hidden: true }) : isOwner ? ok : no(`Only the owner, ${room.ownerName}, can change spending.`))),
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
    "owner.start": 9, "rooms.resume": 9, "rooms.join": 9, "ui.nav.playerClient": 8, "ui.copyInviteLink": 7, "rooms.addAi": 6,
    "owner.settings": 5, "ui.nav.newConfiguration": 4, "rooms.endActiveGame": 3, "rooms.create": 6,
    "ui.nav.game": 6, "ui.nav.room": 5, "ui.nav.home": 4, "ui.nav.pastGame": 2, "rooms.history": 1,
  };
  return [...fromCatalog, ...uiCommands].map(c => (scores[c.id] ? { ...c, defaultScore: scores[c.id] } : c));
}

/** "Open room K7QX" / "Open game K7QX" for a code-shaped query (the rooms list's join-by-code). */
export function codeCommands(query: string, act: Pick<EngineActions, "navigate">): Command[] {
  const code = query.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,36}$/.test(code)) return [];
  const row = (kind: "room" | "game"): Command => ({
    id: `dyn:${kind}:${code}`, human: { title: `Open ${kind} ${code}`, tooltip: kind === "room" ? "Goes to that room; you can join it there." : "Goes to that game's shared view." },
    group: "room", section: "goto", performer: { kind: "navigate", to: `/${kind}s/${encodeURIComponent(code)}` }, available: () => ok,
  });
  return [row("room"), row("game")];
}


/** The game in 90 seconds (onboarding-and-config.md §2), for "How to play". */
export const HOW_TO_PLAY: readonly string[] = [
  "Code Gods is a game about a shared world and secret wishes.",
  "The world is a crowd of objects: usually small grids of coloured numbers. Every player is a god with a secret utility function, a short rule that scores every object, such as \"I like grids with red corners\". The rarer an object is by your rule, the more bits it is worth to you.",
  "You cannot touch objects yourself. You summon agents: tiny Python or TypeScript programs that, when the world picks them, make a few moves on a random object: swap, paint, slide. Summoning costs your energy, which refills every second, and shorter programs cost less. Each agent then earns its own energy and spends some on every move.",
  "Here is the twist. Your payoff from an object is your bits times how much the other players, together, care about it. An object only you love earns you nothing. You cannot see anyone else's rule, only the total. So talk: say what you want in the public chat, find overlaps, strike deals, call out agents that wreck your favourites.",
  "The game ends at a random moment. Your score is your payoff added up over every object alive then. Your assistant can explain, write agents and draft messages for you.",
];

export { firstName };
export const allCatalogEnginePaths = () => paletteEntries("engine").map(e => e.path);
