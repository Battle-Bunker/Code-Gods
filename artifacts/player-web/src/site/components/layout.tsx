/**
 * Every site page's frame (palette-and-pages.md §3.0): the header (wordmark, breadcrumb with the live dot, the
 * palette trigger, the avatar menu) and the one command palette, plus the secondary surfaces the palette opens
 * (AI quotas, connected apps, scoring, past games).
 *
 * A page passes what it shows (its room, its game); the commands are built from that once, and the page's own
 * buttons run them by id through `usePage().run`, so a button and its palette row do the same thing.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAction, useConvexConnectionState, useMutation } from "convex/react";
import { CommandPalette, PaletteTrigger, type Command, type PaletteContext, type PaletteOpenInit } from "@workspace/ui-kit";
import { setObjectRenderer, useGridRenderer } from "@workspace/object-views";
import { startTracker, trackStart } from "@workspace/player-client/start";
import { roomStartView, type RoomStartView } from "@/site/lib/bidding";
import { useAuth } from "@/site/hooks/use-auth";
import { engineSite } from "@/core/connection";
import { useManifest, useWarmSandboxes } from "@/site/hooks/use-manifest";
import { useAdminAgents, useAgentOptions } from "@/site/hooks/use-agents";
import { useToast } from "@/hooks/use-toast";
import { api, useLive } from "@/site/lib/convex";
import { codeCommands, engineCommands, paletteContextFor, type EngineActions, type EngineScope, type Live, type Template } from "@/site/lib/commands";
import { oncePerKey } from "@/site/lib/click-once";
import { aiSeats } from "@/site/lib/room-seats";
import { errMsg, startRaced } from "@/site/lib/errors";
import { ErrorBoundary, type ErrorFallbackProps } from "@/components/error-boundary";
import { ErrorLine } from "@/site/components/page-parts";
import type { GameRecord, GameView, Manifest, RoomState } from "@/site/lib/types";
import { useSetupEntries } from "@/site/hooks/use-setups";
import { rulesFor } from "@/site/components/game-rules";
import { Tip } from "@/site/components/action";
import { AiQuotasSheet, ConnectedAppsSheet, PastGamesSheet, ScoringSheet } from "@/site/components/sheets";
import { ToastAction } from "@/components/ui/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function Sigil({ size = 28, animate = true }: { size?: number; animate?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0" aria-hidden>
      <circle cx="20" cy="20" r="18" fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.2" />
      <g className={animate ? "orbit-once" : undefined} style={{ transformOrigin: "20px 20px" }}>
        <ellipse cx="20" cy="20" rx="18" ry="7" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" />
        <circle cx="38" cy="20" r="2.4" fill="hsl(var(--accent))" />
      </g>
      <path d="M15 14 L11 20 L15 26 M25 14 L29 20 L25 26" fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.6" />
    </svg>
  );
}

type Sheet = "ai-quotas" | "connected-apps" | "scoring" | "past-games";
export interface Crumb { label: string; href?: string }

interface PageApi {
  /** Run a command by id, as its palette row would (form commands open the palette on their page). */
  run(id: string): void;
  command(id: string): Command | undefined;
  /** Why a command cannot run now, or null. */
  unavailable(id: string): string | null;
  openPalette(init?: PaletteOpenInit): void;
  openSheet(sheet: Sheet): void;
  ctx: PaletteContext;
  manifest?: Manifest;
  /** The actions behind the commands, for controls that pass their own argument (the Setup select, an AI row's Remove). */
  act: EngineActions;
  /** This room's pending start (@workspace/player-client/start, with the bid phase: lib/bidding.ts): the Start button and the next step show it at once. */
  start: RoomStartView;
}
const PageCtx = createContext<PageApi | null>(null);
export function usePage(): PageApi {
  const p = useContext(PageCtx);
  if (!p) throw new Error("usePage outside <Page>");
  return p;
}

/** The live dot: the Convex socket (live data arrives by subscription; the link itself is the only state worth showing). */
function ConnDot({ ok, label = "live" }: { ok: boolean; label?: string }) {
  const connected = useConvexConnectionState().isWebSocketConnected;
  const text = !ok ? "Updates are failing; they resume when the engine answers again." : connected ? (label === "live" ? "Live: changes appear as they happen." : "Final: this game has ended.") : "Reconnecting…";
  return (
    <Tip text={text}>
      <span className="inline-flex items-center" data-testid="status-connection" role="img" aria-label={text} tabIndex={0}>
        <span className={`h-2 w-2 rounded-full ${!ok ? "bg-destructive" : connected ? (label === "live" ? "bg-primary pulse-dot" : "bg-muted-foreground") : "bg-accent"}`} />
      </span>
    </Tip>
  );
}

// The palette's lists: each is a live subscription through the shared useLive hook, held by the pick page that shows it.
function useTemplates(): Live<readonly Template[]> {
  const r = useAgentOptions();
  return { data: r.data?.agents, error: r.error };
}
function useAdminTemplates(): Live<readonly Template[]> {
  const r = useAdminAgents();
  return { data: useMemo(() => r.data?.agents.map(a => ({ id: a.id, name: a.name, provider: a.provider, model: a.model })), [r.data]), error: r.error };
}
/** The room's finished games: the page's own list when it has one (the room page), else this room's subscription. */
function usePastGames(roomId: string | undefined, held: readonly GameRecord[] | undefined): Live<readonly GameRecord[]> {
  const r = useLive(api.rooms.history, held || !roomId ? "skip" : { room: roomId });
  const data = useMemo(() => r.data?.filter((g): g is NonNullable<typeof g> => !!g), [r.data]);
  if (held) return { data: held, error: null };
  return roomId ? { data, error: r.error } : { data: [], error: null };
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";

export function Page({ children, room, game, history, crumbs = [], placeholder = "Search or do anything…", suggested = [], conn }: {
  children: ReactNode;
  room?: RoomState | null;
  game?: GameView | null;
  history?: readonly GameRecord[];
  crumbs?: Crumb[];
  placeholder?: string;
  suggested?: readonly string[];
  conn?: { ok: boolean; label?: string } | null;
}) {
  const { user, kind, login, logout } = useAuth();
  const manifest = useManifest(!!user).data;
  useWarmSandboxes(user?.id);
  const [path, navigate] = useLocation();
  const { toast } = useToast();
  const [palette, setPalette] = useState<{ open: boolean; init?: PaletteOpenInit }>({ open: false });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const creating = useRef(false);
  const practising = useRef(false);

  const create = useMutation(api.rooms.create);
  const join = useMutation(api.rooms.join);
  const leave = useMutation(api.rooms.leave);
  const setReady = useMutation(api.rooms.setReady);
  const setSpectator = useMutation(api.rooms.setSpectator);
  const spectatorOnce = useMemo(() => oncePerKey(setSpectator, args => `${args.roomId}:${args.godId ?? "me"}`, args => args.spectator), [setSpectator]);
  const start = useAction(api.owner.start);
  const resume = useMutation(api.rooms.resume);
  const startWorldNow = useMutation(api.rooms.startWorldNow);
  const end = useMutation(api.rooms.endActiveGame);
  const addAi = useMutation(api.rooms.addAi);
  const roomNow = useRef(room);
  roomNow.current = room;
  // AI seats go through one ledger per room (lib/room-seats.ts): a seat just added counts before the page shows it.
  const aiSeatsOf = useMemo(() => aiSeats((templateId?: string) => addAi({ roomId: need(roomNow.current?.id), ...(templateId ? { templateId } : {}) })), [addAi, room?.id]);
  const removeAi = useMutation(api.rooms.removeAi);
  const saveSettings = useAction(api.owner.settings);
  const duplicate = useMutation(api.setups.duplicate);
  const revoke = useMutation(api.auth.credentials.revoke);
  const gridRenderer = useGridRenderer();

  const fail = useCallback((what: string, e: unknown) => toast({ title: `${what} failed`, description: errMsg(e), variant: "destructive" }), [toast]);
  const roomId = room?.id;
  const startRequest = useSyncExternalStore(startTracker.subscribe, () => (roomId ? startTracker.get(roomId) : null));
  const start_ = roomStartView(startRequest, room, startTracker.now());
  // Only the click itself: a preparation in progress has its own reason (lib/commands.ts reads room.preparing).
  const starting = start_.phase === "starting";
  const need = <T,>(v: T | null | undefined): T => { if (v === null || v === undefined) throw new Error("Open a room first."); return v; };

  /**
   * Create a room in one step, on the default (Annotated basics) setup, and open it. The creator is seated as a player
   * (rooms.create); the room's next step is a practice game with AI players where they are available, else its invite link.
   * Nothing is asked first; the assistant is turned on later from the room page (Assistant: off · Turn on…).
   */
  const doCreate = useCallback(async () => {
    if (creating.current) return; // a double click makes one room
    creating.current = true;
    try {
      const r = await create({});
      navigate(`/rooms/${r.shortCode}`);
    } catch (e) { fail("Creating the room", e); } finally { creating.current = false; }
  }, [create, navigate, fail]);

  const scope: EngineScope = {
    user, room: room ?? null, game: game ? { shortCode: game.shortCode, status: game.status, roomShortCode: game.roomShortCode, roster: game.roster, ownerId: game.ownerId } : null,
    aiConfigured: manifest?.aiFunding.configured,
    currentSetup: room?.setup && !room.setup.deleted ? room.setup.id : undefined,
    minPlayers: manifest?.minimumPlayers ?? 3, maxPlayers: manifest?.maximumPlayers ?? 8,
    gridRenderer, starting, siteSession: kind === "site",
  };
  // One click is one requestId; a second click while it is pending sends nothing (the button shows "Starting…").
  const doStart = () => trackStart(startTracker, need(roomId), requestId => start({ roomId: need(roomId), requestId })
    .catch(e => { if (startRaced(e)) return null; throw e; }));
  const act: EngineActions = {
    navigate: to => navigate(to),
    openTab: url => { window.open(url, "_blank", "noopener"); },
    copy: (text, what) => { navigator.clipboard.writeText(text).then(() => toast({ title: `${what} copied` }), () => toast({ title: `Could not copy the ${what.toLowerCase()}`, variant: "destructive" })); },
    login, logout,
    createRoom: () => { void doCreate(); },
    // Eight players fill the next game: a newcomer then joins to watch (the engine refuses a ninth player).
    join: () => join({ room: need(room).shortCode, spectator: need(room).members.filter(m => !m.spectator).length >= (manifest?.maximumPlayers ?? 8) }),
    leave: () => leave({ roomId: need(roomId) }),
    setReady: ready => setReady({ roomId: need(roomId), ready }),
    // Both play/watch controls (the step under the status line and the button beside a name) come through here: a double
    // click must not toggle back (lib/click-once.ts).
    setSpectator: (spectator, godId) => spectatorOnce({ roomId: need(roomId), spectator, ...(godId ? { godId } : {}) }),
    start: doStart,
    resume: () => resume({ roomId: need(roomId) }),
    startWorldNow: () => startWorldNow({ roomId: need(roomId) }),
    endGame: () => end({ roomId: need(roomId) }),
    // One click, one seat: a double click on "+ Add AI player" adds one (lib/room-seats.ts).
    addAi: templateId => { need(roomId); return aiSeatsOf.addOnce(templateId); },
    // A practice game: the engine's practice partner (engine aiTemplates.ts PRACTICE_TEMPLATE_ID: it summons the example
    // agent a new player starts with, and calls no model; the default AI player if it was removed) in each seat the game
    // still needs, then the start. What is missing
    // is counted from the room as it is now plus the seats this page has just added (not from the room as it was when
    // the button was drawn), one seat at a time. If a step fails the seats already added stay, and the room's next step
    // is then Start (or what is still missing).
    practiceGame: async () => {
      if (practising.current) return; // a double click adds the seats once
      practising.current = true;
      try {
        need(roomId);
        await aiSeatsOf.fill(manifest?.minimumPlayers ?? 3, () => roomNow.current?.members ?? [], "practice-example");
        await doStart();
      } finally { practising.current = false; }
    },
    removeAi: godId => removeAi({ roomId: need(roomId), godId }),
    applySetup: async id => {
      const r = need(room);
      // Undo puts the room back on the setup it ran (unless that setup was deleted since).
      const was = r.setup && !r.setup.deleted ? r.setup.id : null;
      const saved = await saveSettings({ roomId: r.id, revision: r.revision, setupId: id });
      const name = saved.setup?.name ?? "the chosen setup";
      toast({ title: `Next game: ${name}`, action: was && was !== id ? (
        <ToastAction altText="Undo" data-testid="button-undo-setup" onClick={() => {
          saveSettings({ roomId: r.id, revision: saved.revision, setupId: was }).catch(e => fail("Undo", e));
        }}>Undo</ToastAction>
      ) : undefined });
    },
    duplicateSetup: async id => {
      const code = room?.shortCode ?? game?.roomShortCode;
      const copy = await duplicate({ setupId: id });
      toast({ title: `Created ${copy.name}`, description: "Your own copy: edit it and save, or delete it from its page if you do not need it." });
      if (code) navigate(`/rooms/${code}/configure?setup=${encodeURIComponent(copy.id)}`);
    },
    useTemplates: () => useTemplates(),
    useAdminTemplates: () => useAdminTemplates(),
    usePastGames: () => usePastGames(room?.id, history),
    useCredentials: () => useLive(api.auth.credentials.list, {}),
    revoke: credentialId => revoke({ credentialId }),
    openSheet: s => setSheet(s),
    rulesText: () => (room ? rulesFor(room.settings, room.shortCode, null, room.objectInstance) : game ? rulesFor(game.settings, game.roomShortCode, game.shortCode, game.objectInstance) : null),
    useSetups: query => useSetupEntries(query),
    // A hook (the info page calls it while shown): the system setups are the catalogue's first entries.
    useServerInfo: () => { const setups = useSetupEntries("").data; return manifest ? [
      `Players per game: ${manifest.minimumPlayers} to ${manifest.maximumPlayers}; AI players count.`,
      `Agent languages: ${manifest.runtimes.join(", ") || "none available right now"}.`,
      `System setups: ${setups ? setups.filter(s => s.system).map(s => s.name).join(", ") || "none" : "loading"}.`,
      manifest.aiFunding.configured ? `AI players and assistants: available${manifest.aiFunding.mock ? " (development: scripted, nothing billed)" : ""}.` : "AI players and assistants: not set up on this server.",
    ] : ["Loading server info…"]; },
    whoAmI: () => user ? [`Signed in as ${user.name}.`, `Your player id: ${user.id}.`, ...(user.isAdmin ? ["You can manage the AI library."] : [])] : ["You are not signed in."],
    setGridRenderer: id => { setObjectRenderer("Grid", id); },
    origin: window.location.origin,
  };
  // Rebuilt only when what the commands read changes (not on every chat message or tick); the actions read the same.
  const commands = useMemo(() => engineCommands(scope, act), [user, room, game, manifest, history, gridRenderer, starting]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => paletteContextFor(scope), [user, room, game]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(commands.map(c => [c.id, c])), [commands]);

  const openPalette = (init?: PaletteOpenInit) => setPalette({ open: true, init });
  const api_: PageApi = {
    ctx, manifest, openPalette, openSheet: setSheet, act, start: start_,
    command: id => byId.get(id),
    unavailable: id => { const c = byId.get(id); if (!c) return "Not available here."; const a = c.available(ctx); return a.ok ? null : a.reason; },
    run: id => {
      const c = byId.get(id);
      if (!c) return;
      const a = c.available(ctx);
      if (!a.ok) { toast({ title: a.reason }); return; }
      const p = c.performer;
      if (p.kind === "navigate") navigate(typeof p.to === "function" ? p.to() : p.to);
      else if (p.kind === "submit") p.run().catch(e => fail(c.human.title, e));
      else if (p.kind === "local") p.run();
      else if (p.kind === "form") openPalette({ page: c.id });
    },
  };

  const chip = room ? `Room ${room.shortCode} · you: ${ctx.role === "seated" ? "player" : ctx.role === "signed-in" ? "visitor" : ctx.role}` : game ? `Game ${game.shortCode}` : undefined;
  const crumbLinks: Crumb[] = [{ label: "Code Gods", href: "/" }, ...crumbs];

  return (
    <PageCtx.Provider value={api_}>
      <div className="min-h-[100dvh] flex flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto max-w-[1440px] px-4 md:px-6 h-14 flex items-center gap-3">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 min-w-0 text-sm">
              <Link href="/" className="flex items-center gap-2 shrink-0" data-testid="link-home" aria-label="Code Gods: your rooms">
                <Sigil /><span className="font-display text-2xl leading-none hidden sm:inline">Code Gods</span>
              </Link>
              {crumbLinks.slice(1).map((c, i) => (
                <span key={`${c.label}-${i}`} className={`items-center gap-2 min-w-0 ${i === crumbLinks.length - 2 ? "flex" : "hidden sm:flex"}`}>
                  <span aria-hidden className="text-muted-foreground">›</span>
                  {c.href ? <Link href={c.href} className="truncate hover:underline underline-offset-4">{c.label}</Link> : <span className="truncate font-medium" aria-current="page">{c.label}</span>}
                </span>
              ))}
              {conn && <ConnDot ok={conn.ok} label={conn.label} />}
            </nav>
            <div className="flex-1" />
            <PaletteTrigger placeholder={placeholder} onOpen={init => openPalette(init)} />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="h-9 w-9 shrink-0 rounded-full bg-foreground text-background text-xs font-semibold" aria-label={`Account: ${user.name}`} data-testid="button-avatar">{initials(user.name)}</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12rem]">
                  <DropdownMenuLabel className="font-normal"><span className="block text-sm" data-testid="text-username">{user.name}</span></DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {user.isAdmin && <DropdownMenuItem asChild><Link href="/admin/agents" data-testid="link-admin-agents">AI library</Link></DropdownMenuItem>}
                  {/* Managing credentials is the engine site's own (its Google session); elsewhere, a link there. */}
                  {kind === "site"
                    ? <DropdownMenuItem onSelect={() => setSheet("connected-apps")} data-testid="menu-connected-apps">Connected apps</DropdownMenuItem>
                    : engineSite() !== location.origin && <DropdownMenuItem asChild><a href={`${engineSite()}/`} target="_blank" rel="noreferrer" data-testid="menu-connected-apps">Connected apps: on the engine site</a></DropdownMenuItem>}
                  {/* A dev server's credential is not a sign-in: it ends when the dev server stops. */}
                  {kind !== "token" && <DropdownMenuItem onSelect={() => logout()} data-testid="button-logout">Sign out</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>
        {/* A page that throws (a paged query's error, a render bug) keeps the header and its navigation; a new route clears it. */}
        <main className="flex-1"><ErrorBoundary FallbackComponent={PageError} resetKey={path}>{children}</ErrorBoundary></main>
      </div>
      <CommandPalette commands={commands} context={ctx} open={palette.open} init={palette.init} onOpenChange={o => setPalette(p => ({ open: o, init: o ? p.init : undefined }))}
        placeholder={placeholder} suggested={suggested} recentKey={user ? `code-gods:palette-recent:${user.id}` : undefined} chip={chip}
        dynamic={q => (user ? codeCommands(q, act) : [])} onNavigate={to => navigate(to)} onError={(e, c) => fail(c.human.title, e)} />
      {room && <AiQuotasSheet key={`${room.id}-${room.aiQuota}-${room.assistantQuota}-${room.assistantModel}`} room={room} manifest={manifest} open={sheet === "ai-quotas"} onOpenChange={o => setSheet(o ? "ai-quotas" : null)} />}
      <ConnectedAppsSheet open={sheet === "connected-apps"} onOpenChange={o => setSheet(o ? "connected-apps" : null)} roomCode={room?.shortCode} />
      <ScoringSheet open={sheet === "scoring"} onOpenChange={o => setSheet(o ? "scoring" : null)} objectType={room?.settings.objectType ?? game?.settings.objectType} />
      <PastGamesSheet open={sheet === "past-games"} onOpenChange={o => setSheet(o ? "past-games" : null)} games={history} roomCode={room?.shortCode ?? game?.roomShortCode}
        viewer={{ meId: user?.id, ownerId: room?.ownerId ?? game?.ownerId ?? undefined, roomLive: room ? !!room.activeGame : !!(game && (game.status === "active" || game.roomActiveGame)) }} />
    </PageCtx.Provider>
  );
}

/** What a page shows when it threw: the error, and a retry that renders it afresh. The header stays. */
function PageError({ error, resetError }: ErrorFallbackProps) {
  return <div className="mx-auto max-w-3xl p-6" data-testid="page-error"><ErrorLine message={`This page hit an error: ${errMsg(error)}`} onRetry={resetError} /></div>;
}
