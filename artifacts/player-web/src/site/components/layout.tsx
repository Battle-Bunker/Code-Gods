/**
 * Every site page's frame (palette-and-pages.md §3.0): the header (wordmark, breadcrumb with the live dot, the
 * palette trigger, the avatar menu) and the one command palette.
 *
 * The page passes the viewer's affordance context (core/affordance-context.ts) and the room and game in view; the
 * frame provides the affordance runtime (core/affordance-runtime.tsx), so every button below is a `useAffordance`
 * and every palette row is generated from the same directory (core/palette-commands.ts).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useConvexConnectionState } from "convex/react";
import { CommandPalette, PaletteTrigger, type PaletteContext, type PaletteOpenInit } from "@workspace/ui-kit";
import type { AffordanceContext } from "@workspace/v2-affordances";
import { useAuth } from "@/site/hooks/use-auth";
import { engineSite } from "@/core/connection";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/site/lib/errors";
import { ErrorBoundary, type ErrorFallbackProps } from "@/components/error-boundary";
import { ErrorLine } from "@/site/components/page-parts";
import { Tip } from "@/site/components/action";
import { ConnectedAppsSheet } from "@/site/components/sheets";
import { AffordanceRuntimeProvider, useRuntime, type RuntimeScope } from "@/core/affordance-runtime";
import { paletteCommands } from "@/core/palette-commands";
import { affordanceContext } from "@/core/affordance-context";
import { usePaneOps } from "@/dock/open-pane";
import type { GamePhase } from "@workspace/v2-client";
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

export interface Crumb { label: string; href?: string }

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

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "?";

/** The palette as the page frame shows it, from the runtime its page provides. */
function Palette({ open, init, onOpenChange, placeholder, suggested, chip, roomPath, dockPhase }: {
  open: boolean; init?: PaletteOpenInit; onOpenChange(o: boolean): void; placeholder: string; suggested: readonly string[]; chip?: string; roomPath?: string; dockPhase?: GamePhase;
}) {
  const rt = useRuntime();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // An ended game shown in replay has the replay's arrangement.
  const paneOps = usePaneOps(dockPhase === "ended" && rt.context.context === "replay" ? "replay" : dockPhase ?? "planning");
  const panes = dockPhase ? paneOps : undefined;
  const commands = useMemo(() => paletteCommands(rt.context, { perform: rt.perform, navigate, roomPath, ...(panes ? { panes } : {}) }), [rt, navigate, roomPath, panes]);
  const p = rt.context.principal;
  const ctx: PaletteContext = { role: p.owner ? "owner" : p.seated ? "seated" : p.member ? "member" : p.signedIn ? "signed-in" : "visitor", admin: p.admin, assistantOn: false };
  return (
    <CommandPalette commands={commands} context={ctx} open={open} init={init} onOpenChange={onOpenChange}
      placeholder={placeholder} suggested={suggested} recentKey={user ? `code-gods:palette-recent:${user.id}` : undefined} chip={chip}
      onNavigate={to => navigate(to)} onError={(e, c) => toast({ title: `${c.human.title}: not done`, description: errMsg(e), variant: "destructive" })} />
  );
}

/** The palette's open state, shared with the page's own "Join with a code" and the dock's shortcuts. */
let openPaletteNow: (init?: PaletteOpenInit) => void = () => {};
export const openPalette = (init?: PaletteOpenInit) => openPaletteNow(init);

export function Page({ children, context, scope = {}, crumbs = [], placeholder = "Search or do anything…", suggested = [], conn, chip, dockPhase, bare = false, roomPath, fill = false }: {
  children: ReactNode;
  /** The viewer's affordance context on this page (default: signed in or not, no room). */
  context?: AffordanceContext;
  /** The room and game in view, which every operation acts in. */
  scope?: RuntimeScope;
  crumbs?: Crumb[];
  placeholder?: string;
  /** Affordance ids pinned under Suggested (the page's next step first). */
  suggested?: readonly string[];
  conn?: { ok: boolean; label?: string } | null;
  chip?: string;
  /** The dock is on screen, in this phase: pane rows of the palette open panes there. */
  dockPhase?: GamePhase;
  /** No site header (the game screen has its own). */
  bare?: boolean;
  /** The room page's path, when a room is in view. */
  roomPath?: string;
  /** The page fills the screen (the game screen): no page scroll, the body scrolls inside. */
  fill?: boolean;
}) {
  const { user, kind, login, logout, isAuthenticated } = useAuth();
  const [path] = useLocation();
  const ctx = context ?? affordanceContext({ signedIn: isAuthenticated, admin: !!user?.isAdmin });
  const [palette, setPalette] = useState<{ open: boolean; init?: PaletteOpenInit }>({ open: false });
  const [sheet, setSheet] = useState(false);
  openPaletteNow = init => setPalette({ open: true, init });
  const crumbLinks: Crumb[] = [{ label: "Code Gods", href: "/" }, ...crumbs];
  const openPal = (init?: PaletteOpenInit) => setPalette({ open: true, init });

  return (
    <AffordanceRuntimeProvider context={ctx} scope={scope} onSignIn={login}>
      <div className={bare ? "contents" : fill ? "h-[100dvh] flex flex-col overflow-hidden" : "min-h-[100dvh] flex flex-col"}>
        {!bare && <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
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
            <PaletteTrigger placeholder={placeholder} onOpen={init => openPal(init)} />
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
                    ? <DropdownMenuItem onSelect={() => setSheet(true)} data-testid="menu-connected-apps">Connected apps</DropdownMenuItem>
                    : engineSite() !== location.origin && <DropdownMenuItem asChild><a href={`${engineSite()}/`} target="_blank" rel="noreferrer" data-testid="menu-connected-apps">Connected apps: on the engine site</a></DropdownMenuItem>}
                  {/* A dev server's credential is not a sign-in: it ends when the dev server stops. */}
                  {kind !== "token" && <DropdownMenuItem onSelect={() => logout()} data-testid="button-logout">Sign out</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>}
        {bare ? children : <main className={fill ? "flex min-h-0 flex-1 flex-col" : "flex-1"}><ErrorBoundary FallbackComponent={PageError} resetKey={path}>{children}</ErrorBoundary></main>}
      </div>
      <Palette open={palette.open} init={palette.init} onOpenChange={o => setPalette(p => ({ open: o, init: o ? p.init : undefined }))}
        placeholder={placeholder} suggested={suggested} chip={chip} roomPath={roomPath} dockPhase={dockPhase} />
      <ConnectedAppsSheet open={sheet} onOpenChange={setSheet} />
    </AffordanceRuntimeProvider>
  );
}

/** What a page shows when it threw: the error, and a retry that renders it afresh. The header stays. */
function PageError({ error, resetError }: ErrorFallbackProps) {
  return <div className="mx-auto max-w-3xl p-6" data-testid="page-error"><ErrorLine message={`This page hit an error: ${errMsg(error)}`} onRetry={resetError} /></div>;
}
