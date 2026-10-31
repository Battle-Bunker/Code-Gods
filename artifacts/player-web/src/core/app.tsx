/**
 * The player client's root: find the engine, authenticate, pick the room, then render the protected
 * core console inside the panel dock.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { ConvexProviderWithAuth, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { authClient, connection, convexClient, fetchAppAccessToken, signIn, type Connection } from "./connection";
import { RoomProvider } from "@/sdk/context";
import { Dock } from "@/shell/dock";
import Console from "./console";
import { CoreBoundary } from "./core-boundary";
import { AssistantToggle } from "./assistant/drawer";

export function App() {
  const [conn, setConn] = useState<Connection>();
  const [error, setError] = useState<string>();
  useEffect(() => { connection().then(setConn, e => setError(e instanceof Error ? e.message : String(e))); }, []);
  if (error) return <Screen title="Not connected to an engine" testId="text-connection-error"><p>{error}</p><AppHelp /></Screen>;
  if (!conn) return <Screen title="Connecting…" testId="status-connecting" />;
  return <Authenticated conn={conn} />;
}

/** Convex auth for either mode (see connection.ts): player JWTs from the dev server, or Better Auth hosted. */
function Authenticated({ conn }: { conn: Connection }) {
  const client = convexClient(conn.convexUrl);
  if (conn.mode === "devserver") {
    return <ConvexProviderWithAuth client={client} useAuth={useDevServerAuth}><DevServerMode conn={conn} /></ConvexProviderWithAuth>;
  }
  // The cast bridges a type-level quirk of @convex-dev/better-auth 0.12 (see artifacts/code-gods/src/lib/convex.tsx).
  return <ConvexBetterAuthProvider client={client} authClient={authClient() as unknown as AuthClient}><Hosted /></ConvexBetterAuthProvider>;
}

/** Dev-server mode: the dev server holds the credential and always answers with a player JWT (or refuses). */
function useDevServerAuth() {
  const fetchAccessToken = useCallback(() => fetchAppAccessToken(), []);
  return useMemo(() => ({ isLoading: false, isAuthenticated: true, fetchAccessToken }), [fetchAccessToken]);
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
        <p>Sign in with Google on this engine. Your full name is shown in the room; chat is public.</p>
        {error && <p className="text-sm text-destructive" data-testid="text-login-error">{error}</p>}
        <button data-testid="link-login" onClick={() => { void signIn().then(e => { if (e) setError(e); }); }} className="inline-flex bg-primary text-primary-foreground px-4 py-2 font-semibold">Sign in with Google</button>
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
          <Console header={<>
            <span className="font-mono text-xs opacity-70" data-testid="text-mode">{mode === "devserver" ? "your player app" : "hosted client"}</span>
            <AssistantToggle />
          </>} />
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
