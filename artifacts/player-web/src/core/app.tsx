/**
 * The app (archive/engine-v1:docs/unify-apps-plan.md): every page calibrated to the signed-in human, on one URL scheme (./routes.ts):
 *
 *   /                          your rooms
 *   /rooms/:room               the room: its active game, members and their roles, chat, next game, past games
 *   /rooms/:room/configure     the next game's setup (the owner edits)
 *   /rooms/:room/games/:game   the game: your player view while you play in it, the spectator view while you watch,
 *                              its replay once it has ended (site/pages/game.tsx decides)
 *   /connect, /device          approving an app or a device (the engine's own site only)
 *   /admin/agents[/:id]        the AI player library (admins, the engine's own site only)
 *   /rule-gallery[/:family]    the rule gallery and one rule family's page (no room or game; pure library data)
 *
 * It runs where the engine serves it (the site's Google session), on any other origin with an account grant the human
 * approved on the engine's /connect, or as a player's own dev server holding a room credential (./connection.ts);
 * the pages are the same, the engine decides what the human may do.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EngineProvider, SIGN_OUT_UNCONFIRMED, api, useLive, useSession, type EngineAuth } from "@/site/lib/convex";
import NotFound from "@/site/pages/not-found";
import Home from "@/site/pages/home";
import Room from "@/site/pages/room";
import Game from "@/site/pages/game";
import Device from "@/site/pages/device";
import Connect from "@/site/pages/connect";
import AdminAgents from "@/site/pages/admin-agents";
import Configure from "@/site/pages/configure";
import SignIn from "@/site/pages/sign-in";
import RuleGallery from "@/site/pages/rule-gallery";
import RuleFamily from "@/site/pages/rule-family";
import { roomPath } from "@/site/lib/routes";
import { connection, convexClient, engineSite, fetchAppAccessToken, type Connection } from "./connection";
import { Screen } from "./screen";
import { ROUTE_PATTERNS } from "./routes";

export function App() {
  const [conn, setConn] = useState<Connection>();
  const [error, setError] = useState<string>();
  useEffect(() => { connection().then(setConn, e => setError(e instanceof Error ? e.message : String(e))); }, []);
  if (error) return <Screen title="Not connected to an engine" testId="text-connection-error"><p>{error}</p><AppHelp /></Screen>;
  if (!conn) return <Screen title="Connecting…" testId="status-connecting" />;
  if (conn.mode === "account" && !conn.session) return <AccountSignIn conn={conn} />;
  return <Connected conn={conn} />;
}

/** Account mode before the human has approved this app: sign in on the engine's site. */
function AccountSignIn({ conn }: { conn: Extract<Connection, { mode: "account" }> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(conn.signInError);
  const [unconfirmed] = useState(() => { try { const v = sessionStorage.getItem(SIGN_OUT_UNCONFIRMED); sessionStorage.removeItem(SIGN_OUT_UNCONFIRMED); return !!v; } catch { return false; } });
  const framed = window.top !== window.self;
  const signIn = () => {
    setBusy(true);
    conn.auth.signInWithRedirect({ permission: "account", returnTo: `${location.pathname}${location.search}` })
      .catch(e => { setBusy(false); setFailed(e instanceof Error ? e.message : String(e)); });
  };
  return (
    <Screen title="Sign in to Code Gods" testId="screen-account-sign-in">
      <p>This app plays as you: approve it on <span className="font-mono">{new URL(conn.siteUrl).host}</span>, where you sign in with Google. You can revoke it there at any time, under Connected apps.</p>
      {framed
        // Google refuses to sign in inside a frame (Replit's webview): the app has to be in a tab of its own.
        ? <a className="underline" href={location.href} target="_blank" rel="noreferrer" data-testid="link-open-in-tab">Open this app in a new tab to sign in</a>
        : <button type="button" className="border border-foreground px-4 py-2 font-semibold hover:bg-muted disabled:opacity-60" disabled={busy} onClick={signIn} data-testid="button-account-sign-in">{busy ? "Opening…" : "Sign in"}</button>}
      {failed && <p className="text-destructive" data-testid="text-sign-in-error">{failed}</p>}
      {unconfirmed && <p className="text-destructive" data-testid="text-sign-out-unconfirmed">You are signed out here, but the engine did not confirm it revoked this app. Revoke it on <a className="underline" href={`${conn.siteUrl}/`} target="_blank" rel="noreferrer">the engine's site</a> (its menu, Connected apps).</p>}
    </Screen>
  );
}

function Connected({ conn }: { conn: Connection }) {
  const client = convexClient(conn.convexUrl);
  const fetchAccessToken = useCallback(() => fetchAppAccessToken(), []);
  const auth: EngineAuth = conn.mode === "devserver" ? { kind: "token", fetchAccessToken }
    : conn.mode === "account" ? { kind: "account", auth: conn.auth, session: conn.session! }
    : { kind: "site" };
  // A revoked or expired account grant is forgotten by the SDK (in this tab, or another one: the storage event):
  // start again from the sign-in screen.
  useEffect(() => {
    if (conn.mode !== "account") return;
    const check = () => { if (!conn.auth.account()) location.reload(); };
    const off = conn.auth.onChange(key => { if (key === "*") check(); });
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key.startsWith("codegods.player:")) check(); };
    window.addEventListener("storage", onStorage);
    return () => { off(); window.removeEventListener("storage", onStorage); };
  }, [conn]);
  return (
    <EngineProvider client={client} auth={auth}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Routes mode={conn.mode} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </EngineProvider>
  );
}

function Routes({ mode }: { mode: Connection["mode"] }) {
  // The consent and admin pages belong to the engine's own site (its Google session approves; docs/external-clients.md).
  const siteOnly = (title: string) => () => <SiteOnly title={title} />;
  const devserver = mode === "devserver", offSite = mode !== "site";
  return (
    // Keep a shared shell outside the boundary so it survives a page crash.
    <RoutedErrorBoundary>
      <SignInGate>
      <Switch>
        <Route path={ROUTE_PATTERNS.home} component={devserver ? CredentialRoom : Home} />
        <Route path={ROUTE_PATTERNS.configure} component={Configure} />
        <Route path={ROUTE_PATTERNS.game} component={Game} />
        <Route path={ROUTE_PATTERNS.room} component={Room} />
        <Route path={ROUTE_PATTERNS.device} component={offSite ? siteOnly("Approve a device") : Device} />
        <Route path={ROUTE_PATTERNS.connect} component={offSite ? siteOnly("Approve a connection") : Connect} />
        <Route path={ROUTE_PATTERNS.admin} component={offSite ? siteOnly("AI players") : AdminAgents} />
        <Route path={ROUTE_PATTERNS.adminAgent} component={offSite ? siteOnly("AI players") : AdminAgents} />
        <Route path={ROUTE_PATTERNS.ruleGallery} component={RuleGallery} />
        <Route path={ROUTE_PATTERNS.ruleFamily} component={RuleFamily} />
        <Route component={NotFound} />
      </Switch>
      </SignInGate>
    </RoutedErrorBoundary>
  );
}

/**
 * Sign-in is required for everything on the site (owner decision 2026-11-02): signed out, every path shows the one
 * sign-in screen, which returns to that path. Account mode signs in before this (AccountSignIn); a dev server's app
 * holds a room credential instead, and its own pages report a refused one.
 */
function SignInGate({ children }: { children: ReactNode }) {
  const { kind, user, isLoading, error, refetch } = useSession();
  // Once signed in, a token refresh (loading again) keeps the page mounted, with its drafts and sheets.
  const seen = useRef(false);
  if (user) seen.current = true;
  if (kind !== "site" || user || (isLoading && seen.current)) return <>{children}</>;
  if (isLoading) return <Screen title="Connecting…" testId="status-connecting" />;
  if (error) {
    return (
      <Screen title="Signed out" testId="text-session-error">
        <p>{error.message}</p>
        <button type="button" className="underline" onClick={refetch} data-testid="button-session-retry">Reload</button>
      </Screen>
    );
  }
  return <SignIn />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

/** A dev server's app at /: its credential's room. */
function CredentialRoom() {
  const { roomId } = useSession();
  const [, navigate] = useLocation();
  const room = useLive(api.rooms.get, roomId ? { room: roomId } : "skip");
  useEffect(() => { if (room.data) navigate(roomPath(room.data.shortCode), { replace: true }); }, [room.data, navigate]);
  if (room.error) return <Screen title="The engine refused this player app" testId="text-connection-error"><p>{room.error.message}</p><AppHelp /></Screen>;
  return <Screen title="Connecting…" testId="status-connecting" />;
}

function SiteOnly({ title }: { title: string }) {
  const [location] = useLocation();
  return (
    <Screen title={title} testId="text-site-only">
      <p>This page is on the engine's own site, where you are signed in with Google.</p>
      <a className="underline" href={`${engineSite()}${location}${window.location.search}`} data-testid="link-site-page">Open it there</a>
    </Screen>
  );
}

function AppHelp() {
  return (
    <div className="text-sm space-y-2 text-muted-foreground">
      <p>In your own player app: set <code>CODE_GODS_ENGINE_URL</code> to the engine site (in your environment's secret store or <code>.env.local</code>), run <code>pnpm player connect --room CODE</code>, approve the code on the engine, store the printed <code>CODE_GODS_CREDENTIAL</code> the same way and restart the dev server (<code>pnpm --filter @workspace/player-web dev</code>).</p>
      <p>Check with <code>pnpm player status</code>.</p>
    </div>
  );
}
