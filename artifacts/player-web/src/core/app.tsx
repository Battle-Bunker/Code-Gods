/**
 * The player client's root: find the engine, authenticate, follow the URL (./routes.ts: rooms, a room, its past games,
 * one game) and render the player's screen: the header and the dock of panes (built-in panels, the assistant, your
 * own panels) in dock/shell.tsx, or a past game read-only (./history).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import { ConvexProviderWithAuth, useConvexAuth, useMutation, useQueries, useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { authClient, connection, convexClient, fetchAppAccessToken, signIn, type Connection } from "./connection";
import { RoomProvider } from "@/sdk/context";
import { PlayerShell } from "@/dock/shell";
import { CoreBoundary } from "./core-boundary";
import { errorText, roomLookup } from "./room-lookup";
import { Screen } from "./screen";
import { hrefTo, Link, navigate, useClientRoute } from "./navigation";
import type { ClientRoute } from "./routes";
import { PastGames } from "./history/past-games";
import { HistoricGame, type GameView } from "./history/historic-game";

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
  return <Routed mode="devserver" permission={conn.permission ?? "act"} credentialRoomId={conn.roomId!} />;
}

/** Hosted mode: sign in on the engine site, then the route picks the room. */
function Hosted() {
  const { isLoading, isAuthenticated } = useConvexAuth();
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
  return <Routed mode="hosted" permission="act" />;
}

type Mode = "devserver" | "hosted";
type RoomState = FunctionReturnType<typeof api.rooms.get>;
type RoomRoute = Extract<ClientRoute, { room: string }>;

/**
 * The URL scheme (./routes.ts) over either mode: {base} lists your rooms (hosted) or opens the credential's room (dev
 * server); {base}rooms/:room plays; {base}rooms/:room/games lists past games; {base}rooms/:room/games/:game sends the
 * room's current game to the room and opens a past one read-only; {base}games/:game (an old engine UI link) redirects.
 */
function Routed({ mode, permission, credentialRoomId }: { mode: Mode; permission: "read" | "act" | "owner"; credentialRoomId?: string }) {
  const route = useClientRoute();
  const me = useQuery(api.auth.user.me, {});
  if (route.kind === "legacyGame") return <LegacyGame code={route.game} />;
  if (route.kind === "home") return mode === "devserver" ? <CredentialRoom roomId={credentialRoomId!} /> : <YourRooms />;
  return (
    <RoomGate route={route} mode={mode} meId={me?.subject} credentialRoomId={credentialRoomId}>
      {room => route.kind === "room" ? <Play roomId={room.id} permission={permission} mode={mode} />
        : route.kind === "games" ? <PastGames room={room} meId={me?.subject} />
        : <GameRoute room={room} code={route.game} meId={me?.subject} />}
    </RoomGate>
  );
}

/** Dev server at {base}: the credential's room, under its canonical URL. */
function CredentialRoom({ roomId }: { roomId: string }) {
  const room = useQuery(api.rooms.get, { room: roomId });
  useEffect(() => { if (room) navigate(hrefTo({ kind: "room", room: room.shortCode }), { replace: true }); }, [room]);
  return <Screen title="Connecting…" testId="status-connecting" />;
}

/** Hosted at {base}: the rooms you are in, and a code to open another. */
function YourRooms() {
  const rooms = useQuery(api.rooms.list, {});
  return (
    <Screen title="Your rooms" testId="screen-your-rooms">
      {rooms === undefined ? <p className="text-muted-foreground">Loading…</p> : rooms.length === 0 ? <p className="text-muted-foreground">You are not in a room yet. Open one with the code its owner sent you.</p> : (
        <ul className="divide-y divide-[hsl(var(--card-border))] border border-[hsl(var(--card-border))] bg-card">
          {rooms.map(r => (
            <li key={r.id}>
              <Link to={{ kind: "room", room: r.shortCode }} className="flex items-baseline gap-3 px-4 py-3 hover:bg-muted" data-testid={`link-room-${r.shortCode}`}>
                <span className="font-mono font-semibold">{r.shortCode}</span>
                <span className="text-sm text-muted-foreground">{r.ownerName} · {r.memberCount} gods · {r.phase === "lobby" ? "lobby" : `playing ${r.activeGameShortCode}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <RoomCodeForm />
    </Screen>
  );
}

function RoomCodeForm({ code = "", error }: { code?: string; error?: string }) {
  return (
    <form className="space-y-3" onSubmit={e => {
      e.preventDefault();
      const value = new FormData(e.currentTarget).get("room");
      if (typeof value === "string" && value.trim()) navigate(hrefTo({ kind: "room", room: value.trim() }));
    }}>
      <input key={code} name="room" data-testid="input-room-id" defaultValue={code} placeholder="Room short code" className="w-full bg-card border border-[hsl(var(--input))] px-3 py-3 font-mono text-lg" />
      {error && <p className="text-sm text-destructive" data-testid="text-room-error">{error}</p>}
      <button type="submit" data-testid="button-open-room" className="bg-primary text-primary-foreground px-4 py-2 font-semibold">Open</button>
    </form>
  );
}

/**
 * The room named in the URL, once it is found and this client may play in it: hosted, a member (else the join
 * screen); dev server, the credential's room (a credential is bound to one room). Canonicalises the code in the URL.
 */
function RoomGate({ route, mode, meId, credentialRoomId, children }: { route: RoomRoute; mode: Mode; meId?: string; credentialRoomId?: string; children: (room: RoomState) => ReactNode }) {
  const code = route.room;
  // useQueries, not useQuery: an unknown code makes rooms.get throw NOT_FOUND, shown on the form below.
  const queries = useMemo((): Record<string, { query: typeof api.rooms.get; args: { room: string } }> => ({ room: { query: api.rooms.get, args: { room: code } } }), [code]);
  const lookup = roomLookup(code, useQueries(queries).room as RoomState | Error | undefined);
  const join = useMutation(api.rooms.join);
  const [error, setError] = useState<string>();
  const found = lookup.state === "found" ? lookup.room : null;
  const canonical = found && found.shortCode !== code ? hrefTo({ ...route, room: found.shortCode }) : null;
  useEffect(() => { if (canonical) navigate(canonical, { replace: true }); }, [canonical]);
  // A dev-server credential reads only its own room: the engine refuses any other (rooms.get FORBIDDEN).
  if (mode === "devserver" && (lookup.state === "ask" || (found && found.id !== credentialRoomId))) {
    return (
      <Screen title="This player app plays in another room" testId="text-wrong-room">
        <p>Its credential is for one room only{lookup.state === "ask" && lookup.error ? ` (${lookup.error})` : ""}. To play in room {code}, connect it with <code>pnpm player connect --room {code}</code>.</p>
        <Link to={{ kind: "home" }} className="underline" data-testid="link-home">Back to this app's room</Link>
      </Screen>
    );
  }
  if (lookup.state === "ask") return <Screen title="Which room?"><RoomCodeForm code={code} error={lookup.error} /></Screen>;
  if (lookup.state === "loading" || !meId) return <Screen title="Connecting…" testId="status-connecting" />;
  const room = lookup.room;
  if (mode === "hosted" && !room.members.some(m => m.id === meId)) {
    return (
      <Screen title={`Join room ${room.shortCode}?`}>
        <p>Owner {room.ownerName}. Joining mid-game makes you a spectator until the next game.</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button data-testid="button-join-room" className="bg-primary text-primary-foreground px-4 py-2 font-semibold"
          onClick={() => join({ room: room.id }).catch(e => setError(e instanceof Error ? e.message : String(e)))}>Join</button>
      </Screen>
    );
  }
  return <>{children(room)}</>;
}

/**
 * {base}rooms/:room/games/:game. The room's current game is played on the room's own screen, so its URL becomes the
 * room's (and the screen follows the room into its next game, as {base}rooms/:room does). A past game opens
 * read-only; the engine refuses it to anyone but its players and the room owner, and that refusal is shown here.
 * games.resolve decides (one game and its room), so a live game's world is not loaded twice.
 */
function GameRoute({ room, code, meId }: { room: RoomState; code: string; meId?: string }) {
  const queries = useMemo((): Record<string, { query: typeof api.games.resolve; args: { code: string } }> => ({ game: { query: api.games.resolve, args: { code } } }), [code]);
  const result = useQueries(queries).game as FunctionReturnType<typeof api.games.resolve> | Error | undefined;
  const elsewhere = result && !(result instanceof Error) && result.roomId !== room.id;
  const current = result && !(result instanceof Error) && !elsewhere && result.status === "current";
  useEffect(() => { if (current) navigate(hrefTo({ kind: "room", room: room.shortCode }), { replace: true }); }, [current, room.shortCode]);
  if (result instanceof Error || elsewhere) return <GameError room={room} code={code} message={elsewhere ? `Game ${code} is not a game of room ${room.shortCode}.` : errorText(result as Error)} />;
  if (!result || current) return <Screen title="Connecting…" testId="status-connecting" />;
  return <PastGame room={room} game={result.shortCode} requested={code} meId={meId} />;
}

/** A past game's final state (player.game), under its canonical code. */
function PastGame({ room, game, requested, meId }: { room: RoomState; game: string; requested: string; meId?: string }) {
  const queries = useMemo((): Record<string, { query: typeof api.player.game; args: { roomId: string; gameId: string } }> => ({ game: { query: api.player.game, args: { roomId: room.id, gameId: game } } }), [room.id, game]);
  const result = useQueries(queries).game as GameView | Error | undefined;
  useEffect(() => { if (game !== requested) navigate(hrefTo({ kind: "game", room: room.shortCode, game }), { replace: true }); }, [game, requested, room.shortCode]);
  if (result instanceof Error) return <GameError room={room} code={game} message={errorText(result)} />;
  if (!result) return <Screen title="Connecting…" testId="status-connecting" />;
  return <HistoricGame game={result} roomCode={room.shortCode} meId={meId} />;
}

function GameError({ room, code, message }: { room: RoomState; code: string; message: string }) {
  return (
    <Screen title={`Game ${code}`} testId="text-game-error">
      <p className="text-destructive">{message}</p>
      <p className="text-sm"><Link to={{ kind: "games", room: room.shortCode }} className="underline">Past games</Link>{" · "}<Link to={{ kind: "room", room: room.shortCode }} className="underline">Back to room {room.shortCode}</Link></p>
    </Screen>
  );
}

/** {base}games/:game, the engine UI's old game link: find the game's room, then its nested URL. */
function LegacyGame({ code }: { code: string }) {
  const queries = useMemo((): Record<string, { query: typeof api.games.resolve; args: { code: string } }> => ({ game: { query: api.games.resolve, args: { code } } }), [code]);
  const result = useQueries(queries).game as FunctionReturnType<typeof api.games.resolve> | Error | undefined;
  const target = result && !(result instanceof Error) && result.roomShortCode ? hrefTo({ kind: "game", room: result.roomShortCode, game: result.shortCode }) : null;
  useEffect(() => { if (target) navigate(target, { replace: true }); }, [target]);
  if (result instanceof Error || (result && !result.roomShortCode)) {
    return <Screen title={`Game ${code}`} testId="text-game-error"><p className="text-destructive">{result instanceof Error ? errorText(result) : "Its room is no longer available."}</p><Link to={{ kind: "home" }} className="underline">Your rooms</Link></Screen>;
  }
  return <Screen title="Connecting…" testId="status-connecting" />;
}

function Play({ roomId, permission, mode }: { roomId: string; permission: "read" | "act" | "owner"; mode: "devserver" | "hosted" }) {
  const room = useMemo(() => ({ roomId, permission, mode }), [roomId, permission, mode]);
  return (
    <RoomProvider room={room}>
      <CoreBoundary>
        <PlayerShell />
      </CoreBoundary>
    </RoomProvider>
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
