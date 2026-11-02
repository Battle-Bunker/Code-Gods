/**
 * The app (docs/unify-apps-plan.md): every page calibrated to the signed-in human, on one URL scheme (./routes.ts):
 *
 *   /                          your rooms
 *   /rooms/:room               the room: its active game, members and their roles, chat, next game, past games
 *   /rooms/:room/configure     the next game's setup (the owner edits)
 *   /rooms/:room/games/:game   the game: your player view while you play in it, the spectator view while you watch,
 *                              its replay once it has ended (site/pages/game.tsx decides)
 *   /connect, /device          approving an app or a device (the engine's own site only)
 *   /admin/agents[/:id]        the AI player library (admins, the engine's own site only)
 *
 * It runs where the engine serves it (the site's Google session) or as a player's own dev server holding a room
 * credential (./connection.ts); the pages are the same, the engine decides what the human may do.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EngineProvider, api, useLive, useSession, type EngineAuth } from "@/site/lib/convex";
import NotFound from "@/site/pages/not-found";
import Home from "@/site/pages/home";
import Room from "@/site/pages/room";
import Game from "@/site/pages/game";
import Device from "@/site/pages/device";
import Connect from "@/site/pages/connect";
import AdminAgents from "@/site/pages/admin-agents";
import Configure from "@/site/pages/configure";
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
  return <Connected conn={conn} />;
}

function Connected({ conn }: { conn: Connection }) {
  const client = convexClient(conn.convexUrl);
  const fetchAccessToken = useCallback(() => fetchAppAccessToken(), []);
  const auth: EngineAuth = conn.mode === "devserver" ? { kind: "token", fetchAccessToken } : { kind: "site" };
  return (
    <EngineProvider client={client} auth={auth}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Routes devserver={conn.mode === "devserver"} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </EngineProvider>
  );
}

function Routes({ devserver }: { devserver: boolean }) {
  // The consent and admin pages belong to the engine's own site (its Google session approves; docs/external-clients.md).
  const siteOnly = (title: string) => () => <SiteOnly title={title} />;
  return (
    // Keep a shared shell outside the boundary so it survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path={ROUTE_PATTERNS.home} component={devserver ? CredentialRoom : Home} />
        <Route path={ROUTE_PATTERNS.configure} component={Configure} />
        <Route path={ROUTE_PATTERNS.game} component={Game} />
        <Route path={ROUTE_PATTERNS.room} component={Room} />
        <Route path={ROUTE_PATTERNS.device} component={devserver ? siteOnly("Approve a device") : Device} />
        <Route path={ROUTE_PATTERNS.connect} component={devserver ? siteOnly("Approve a connection") : Connect} />
        <Route path={ROUTE_PATTERNS.admin} component={devserver ? siteOnly("AI players") : AdminAgents} />
        <Route path={ROUTE_PATTERNS.adminAgent} component={devserver ? siteOnly("AI players") : AdminAgents} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
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
