/**
 * Every engine UI page's frame (palette-and-pages.md §3.0): the header (wordmark, breadcrumb with the live dot, the
 * palette trigger, the avatar menu) and the one command palette, plus the secondary surfaces the palette opens
 * (AI spending, connected apps, scoring, past games) and the room-creation and AI-budget dialogs.
 *
 * A page passes what it shows (its room, its game); the commands are built from that once, and the page's own
 * buttons run them by id through `usePage().run`, so a button and its palette row do the same thing.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAction, useConvex, useConvexConnectionState, useMutation } from "convex/react";
import { CommandPalette, PaletteTrigger, type Command, type PaletteContext, type PaletteOpenInit } from "@workspace/ui-kit";
import { setObjectRenderer, useGridRenderer } from "@workspace/object-views";
import { useAuth } from "@/hooks/use-auth";
import { useManifest } from "@/hooks/use-manifest";
import { useToast } from "@/hooks/use-toast";
import { api, useLive } from "@/lib/convex";
import { codeCommands, engineCommands, paletteContextFor, type EngineActions, type EngineScope } from "@/lib/commands";
import { errMsg, rid } from "@/lib/errors";
import type { GameRecord, GameView, Manifest, RoomState, Setup } from "@/lib/types";
import { rulesFor } from "@/components/game-rules";
import { Tip } from "@/components/action";
import { AiBudgetDialog, AiSpendingSheet, ConnectedAppsSheet, CreateRoomDialog, PastGamesSheet, ScoringSheet } from "@/components/sheets";
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

type Sheet = "ai-spending" | "connected-apps" | "scoring" | "past-games";
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
  /** The game setups the viewer can use (setups.list), undefined while loading or signed out. */
  setups?: Setup[];
  /** The actions behind the commands, for controls that pass their own argument (the Setup select, an AI row's Remove). */
  act: EngineActions;
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
  const text = !ok ? "Updates are failing; retrying." : connected ? (label === "live" ? "Live: changes appear as they happen." : "Final: this game has ended.") : "Reconnecting…";
  return (
    <Tip text={text}>
      <span className="inline-flex items-center" data-testid="status-connection" aria-label={text} tabIndex={0}>
        <span className={`h-2 w-2 rounded-full ${!ok ? "bg-destructive" : connected ? (label === "live" ? "bg-primary pulse-dot" : "bg-muted-foreground") : "bg-accent"}`} />
      </span>
    </Tip>
  );
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
  const { user, login, logout } = useAuth();
  const manifest = useManifest().data;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const convex = useConvex();
  const [palette, setPalette] = useState<{ open: boolean; init?: PaletteOpenInit }>({ open: false });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [creating, setCreating] = useState<"dialog" | "busy" | null>(null);
  const [pendingAi, setPendingAi] = useState<{ templateId: string; name?: string; busy?: boolean } | null>(null);

  const create = useMutation(api.rooms.create);
  const join = useMutation(api.rooms.join);
  const leave = useMutation(api.rooms.leave);
  const setReady = useMutation(api.rooms.setReady);
  const start = useAction(api.owner.start);
  const resume = useMutation(api.rooms.resume);
  const end = useMutation(api.rooms.endActiveGame);
  const addAi = useMutation(api.rooms.addAi);
  const removeAi = useMutation(api.rooms.removeAi);
  const approve = useMutation(api.rooms.approveAiBudget);
  const saveSettings = useAction(api.owner.settings);
  const duplicate = useMutation(api.setups.duplicate);
  const revoke = useMutation(api.auth.credentials.revoke);
  const gridRenderer = useGridRenderer();

  const fail = useCallback((what: string, e: unknown) => toast({ title: `${what} failed`, description: errMsg(e), variant: "destructive" }), [toast]);
  const roomId = room?.id;
  const need = <T,>(v: T | null | undefined): T => { if (v === null || v === undefined) throw new Error("Open a room first."); return v; };

  /** Create a room (on the First steps setup) and, when the owner consented in the dialog, turn on the assistant in the same call. */
  const doCreate = useCallback(async (assistant: { assistantBudget: number; assistantModel: string } | null) => {
    setCreating("busy");
    try {
      const r = await create(assistant ?? {});
      setCreating(null);
      navigate(`/rooms/${r.shortCode}`);
    } catch (e) { setCreating("dialog"); fail("Creating the room", e); }
  }, [create, navigate, fail]);

  const setups = useLive(api.setups.list, user ? {} : "skip").data;
  const scope: EngineScope = {
    user, room: room ?? null, game: game ? { shortCode: game.shortCode, status: game.status, roomShortCode: game.roomShortCode } : null,
    aiConfigured: manifest?.aiFunding.configured, setups: setups ?? [],
    currentSetup: room?.setup && !room.setup.deleted ? room.setup.id : undefined,
    minPlayers: manifest?.minimumPlayers ?? 3, maxPlayers: manifest?.maximumPlayers ?? 8,
    gridRenderer,
  };
  const act: EngineActions = {
    navigate: to => navigate(to),
    openTab: url => { window.open(url, "_blank", "noopener"); },
    copy: (text, what) => { navigator.clipboard.writeText(text).then(() => toast({ title: `${what} copied` }), () => toast({ title: `Could not copy the ${what.toLowerCase()}`, variant: "destructive" })); },
    login, logout,
    createRoom: () => { if (manifest?.aiFunding.configured) setCreating("dialog"); else void doCreate(null); },
    join: () => join({ room: need(room).shortCode }),
    leave: () => leave({ roomId: need(roomId) }),
    setReady: ready => setReady({ roomId: need(roomId), ready }),
    start: () => start({ roomId: need(roomId), requestId: rid() }),
    resume: () => resume({ roomId: need(roomId) }),
    endGame: () => end({ roomId: need(roomId) }),
    addAi: async templateId => {
      if (need(room).aiBudget <= 0) {
        const t = (await convex.query(api.aiTemplates.catalog, {})).agents.find(a => a.id === templateId);
        setPendingAi({ templateId, name: t?.name });
        return;
      }
      await addAi({ roomId: need(roomId), templateId });
    },
    removeAi: godId => removeAi({ roomId: need(roomId), godId }),
    applySetup: async id => {
      const r = need(room);
      // Undo puts the room back on the setup it ran (unless that setup was deleted since).
      const was = r.setup && !r.setup.deleted ? r.setup.id : null;
      const saved = await saveSettings({ roomId: r.id, revision: r.revision, setupId: id });
      const name = setups?.find(s => s.id === id)?.name ?? "the chosen setup";
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
    templates: async () => (await convex.query(api.aiTemplates.catalog, {})).agents,
    adminTemplates: async () => (await convex.query(api.aiTemplates.adminList, {})).agents.map(a => ({ id: a.id, name: a.name, provider: a.provider, model: a.model })),
    pastGames: async () => (history ?? (room ? (await convex.query(api.rooms.history, { room: room.id })).filter(g => !!g) : [])),
    credentials: async () => convex.query(api.auth.credentials.list, {}),
    revoke: credentialId => revoke({ credentialId }),
    openSheet: s => setSheet(s),
    rulesText: () => (room ? rulesFor(room.settings, room.shortCode, null, room.objectInstance) : game ? rulesFor(game.settings, game.roomShortCode, game.shortCode, game.objectInstance) : null),
    serverInfo: () => manifest ? [
      `Players per game: ${manifest.minimumPlayers} to ${manifest.maximumPlayers}; AI players count.`,
      `Agent languages: ${manifest.runtimes.join(", ") || "none available right now"}.`,
      `System setups: ${(setups ?? []).filter(s => s.system).map(s => s.name).join(", ") || "none"}.`,
      manifest.aiFunding.configured ? `AI players and assistants: available${manifest.aiFunding.mock ? " (development: scripted, nothing billed)" : ""}.` : "AI players and assistants: not set up on this server.",
    ] : ["Loading server info…"],
    whoAmI: () => user ? [`Signed in as ${user.name}.`, `Your player id: ${user.id}.`, ...(user.isAdmin ? ["You can manage the AI library."] : [])] : ["You are not signed in."],
    setGridRenderer: id => { setObjectRenderer("Grid", id); },
    origin: window.location.origin,
  };
  // Rebuilt only when what the commands read changes (not on every chat message or tick); the actions read the same.
  const commands = useMemo(() => engineCommands(scope, act), [user, room, game, manifest, history, gridRenderer, setups]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => paletteContextFor(scope), [user, room, game]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(commands.map(c => [c.id, c])), [commands]);

  const openPalette = (init?: PaletteOpenInit) => setPalette({ open: true, init });
  const api_: PageApi = {
    ctx, manifest, setups, openPalette, openSheet: setSheet, act,
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
                  <DropdownMenuItem onSelect={() => setSheet("connected-apps")} data-testid="menu-connected-apps">Connected apps</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => logout()} data-testid="button-logout">Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
      <CommandPalette commands={commands} context={ctx} open={palette.open} init={palette.init} onOpenChange={o => setPalette(p => ({ open: o, init: o ? p.init : undefined }))}
        placeholder={placeholder} suggested={suggested} recentKey={user ? `code-gods:palette-recent:${user.id}` : undefined} chip={chip}
        dynamic={q => (user ? codeCommands(q, act) : [])} onNavigate={to => navigate(to)} onError={(e, c) => fail(c.human.title, e)} />
      {room && <AiSpendingSheet key={`${room.id}-${room.aiBudget}-${room.assistantBudget}-${room.assistantModel}`} room={room} manifest={manifest} open={sheet === "ai-spending"} onOpenChange={o => setSheet(o ? "ai-spending" : null)} />}
      <ConnectedAppsSheet open={sheet === "connected-apps"} onOpenChange={o => setSheet(o ? "connected-apps" : null)} roomCode={room?.shortCode} />
      <ScoringSheet open={sheet === "scoring"} onOpenChange={o => setSheet(o ? "scoring" : null)} objectType={room?.settings.objectType ?? game?.settings.objectType} />
      <PastGamesSheet open={sheet === "past-games"} onOpenChange={o => setSheet(o ? "past-games" : null)} games={history} />
      <CreateRoomDialog open={!!creating} pending={creating === "busy"} onOpenChange={o => { if (!o && creating !== "busy") setCreating(null); }} manifest={manifest} onCreate={a => void doCreate(a)} />
      {room && (
        <AiBudgetDialog open={!!pendingAi} templateName={pendingAi?.name} pending={!!pendingAi?.busy} onOpenChange={o => { if (!o) setPendingAi(null); }}
          onApprove={tokens => {
            const p = pendingAi!;
            setPendingAi({ ...p, busy: true });
            approve({ roomId: room.id, aiBudget: tokens })
              .then(() => addAi({ roomId: room.id, templateId: p.templateId }))
              .then(() => setPendingAi(null), e => { setPendingAi({ ...p, busy: false }); fail("Adding the AI player", e); });
          }} />
      )}
    </PageCtx.Provider>
  );
}
