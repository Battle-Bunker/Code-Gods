/**
 * The player client's root: find the engine, authenticate, pick the room, then render the protected
 * core console inside the panel dock.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { connection, convexClient, fetchAccessToken, loginUrl, type Connection } from "./connection";
import { RoomProvider } from "@/sdk/context";
import { Dock } from "@/shell/dock";
import Console from "./console";
import { CoreBoundary } from "./core-boundary";

export function App() {
  const [conn, setConn] = useState<Connection>();
  const [error, setError] = useState<string>();
  useEffect(() => { connection().then(setConn, e => setError(e instanceof Error ? e.message : String(e))); }, []);
  if (error) return <Screen title="Not connected to an engine" testId="text-connection-error"><p>{error}</p><AppHelp /></Screen>;
  if (!conn) return <Screen title="Connecting…" testId="status-connecting" />;
  return <Authenticated conn={conn} />;
}

function Authenticated({ conn }: { conn: Connection }) {
  const client = convexClient(conn.convexUrl);
  const useAuth = useMemo(() => makeUseAuth(conn), [conn]);
  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuth}>
      {conn.mode === "devserver" ? <DevServerMode conn={conn} /> : <Hosted />}
    </ConvexProviderWithAuth>
  );
}

/** Convex's auth adapter for either mode (see connection.ts). */
function makeUseAuth(conn: Connection) {
  return function useAuth() {
    const [state, setState] = useState<{ isLoading: boolean; isAuthenticated: boolean }>(
      conn.mode === "devserver" ? { isLoading: false, isAuthenticated: true } : { isLoading: true, isAuthenticated: false });
    useEffect(() => {
      if (conn.mode === "devserver") { setState({ isLoading: false, isAuthenticated: true }); return; }
      fetch("/api/auth/user", { cache: "no-store" }).then(r => r.json()).then(
        (b: { user: unknown }) => setState({ isLoading: false, isAuthenticated: !!b.user }),
        () => setState({ isLoading: false, isAuthenticated: false }));
    }, []);
    const fetchToken = useCallback(() => fetchAccessToken(conn.mode), []);
    return { ...state, fetchAccessToken: fetchToken };
  };
}

/** Dev-server mode: the credential's room, once Convex holds a token (no query may run unauthenticated). */
function DevServerMode({ conn }: { conn: Connection }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) return <Screen title="Connecting…" testId="status-connecting" />;
  if (!isAuthenticated) return <Screen title="The engine refused this player app" testId="text-connection-error"><AppHelp /></Screen>;
  return <Play roomId={conn.roomId!} permission={conn.permission ?? "act"} mode="devserver" />;
}

/** Hosted mode: sign in on the engine site, then join the room named in ?room=. */
function Hosted() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("room") ?? "");
  const room = useQuery(api.rooms.get, isAuthenticated && code ? { room: code } : "skip");
  const me = useQuery(api.auth.user.me, isAuthenticated ? {} : "skip");
  const join = useMutation(api.rooms.join);
  const [error, setError] = useState<string>();
  if (isLoading) return <Screen title="Connecting…" testId="status-connecting" />;
  if (!isAuthenticated) {
    return (
      <Screen title="Sign in to the pantheon">
        <p>Sign in with Replit on this engine. Your full name is shown in the room; chat is public.</p>
        <a data-testid="link-login" href={loginUrl()} className="inline-flex bg-primary text-primary-foreground px-4 py-2 font-semibold">Sign in with Replit</a>
      </Screen>
    );
  }
  if (!code || room === null) {
    return (
      <Screen title="Which room?">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); const value = new FormData(e.currentTarget).get("room"); if (typeof value === "string") setCode(value.trim()); }}>
          <input name="room" data-testid="input-room-id" defaultValue={code} placeholder="Room short code" className="w-full bg-card border border-[hsl(var(--input))] px-3 py-3 font-mono text-lg" />
          {room === null && <p className="text-sm text-destructive">No room {code} on this engine.</p>}
          <button type="submit" data-testid="button-open-room" className="bg-primary text-primary-foreground px-4 py-2 font-semibold">Open</button>
        </form>
      </Screen>
    );
  }
  if (!room || !me) return <Screen title="Connecting…" testId="status-connecting" />;
  if (!room.members.some(m => m.id === me.subject)) {
    return (
      <Screen title={`Join room ${room.shortCode}?`}>
        <p>Owner {room.ownerName}. Joining mid-game makes you a spectator until the next game.</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button data-testid="button-join-room" className="bg-primary text-primary-foreground px-4 py-2 font-semibold"
          onClick={() => join({ room: room.id }).catch(e => setError(e instanceof Error ? e.message : String(e)))}>Join</button>
      </Screen>
    );
  }
  return <Play roomId={room.id} permission="act" mode="hosted" />;
}

function Play({ roomId, permission, mode }: { roomId: string; permission: "read" | "act" | "owner"; mode: "devserver" | "hosted" }) {
  const room = useMemo(() => ({ roomId, permission, mode }), [roomId, permission, mode]);
  return (
    <RoomProvider room={room}>
      <Dock>
        <CoreBoundary>
          <Console header={<span className="font-mono text-xs opacity-70" data-testid="text-mode">{mode === "devserver" ? "your player app" : "hosted client"}</span>} />
        </CoreBoundary>
      </Dock>
    </RoomProvider>
  );
}

function Screen({ title, children, testId }: { title: string; children?: ReactNode; testId?: string }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-4" data-testid={testId}>
        <h1 className="font-serif text-3xl">{title}</h1>
        {children}
      </div>
    </div>
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
