/**
 * The player client's root: find the engine, authenticate, follow the URL (./routes.ts: rooms, a room, its past games,
 * one game) and render the player's screen: the header and the dock of panes (built-in panels, the assistant, your
 * own panels) in dock/shell.tsx, or a past game read-only (./history).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth, useConvexAuth, useMutation, useQueries, useQuery } from "convex/react";
import type { PlayerSession } from "@workspace/player-client/browser";
import { api } from "@workspace/engine/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { connectRoom, connection, convexClient, fetchAppAccessToken, playerAuth, type Connection } from "./connection";
import { autoRedirectAllowed, hostedStep, roomKey } from "./hosted-flow";
import { RoomProvider } from "@/sdk/context";
import { MyGoalProvider } from "@/sdk/goal";
import { PlayerShell } from "@/dock/shell";
import { CoreBoundary } from "./core-boundary";
import { errorText, roomLookup } from "./room-lookup";
import { Screen } from "./screen";
import { BASE, hrefTo, Link, navigate, useClientRoute } from "./navigation";
import { parseRoute, type ClientRoute } from "./routes";
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

/** Convex auth for either mode (see connection.ts): player JWTs from the dev server, or this room's OAuth connection. */
function Authenticated({ conn }: { conn: Connection }) {
  const client = convexClient(conn.convexUrl);
  if (conn.mode === "devserver") {
    return <ConvexProviderWithAuth client={client} useAuth={useDevServerAuth}><DevServerMode conn={conn} /></ConvexProviderWithAuth>;
  }
  return <Hosted conn={conn} />;
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

const framed = () => { try { return window.top !== window.self; } catch { return true; } };
const tabStorage = () => { try { return window.sessionStorage; } catch { return null; } };
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);

/**
 * Hosted mode: one OAuth connection per room (hosted-flow.ts; docs/external-clients.md §3.1), the same path any app on
 * any origin uses. Back from the engine's /connect page, the code is redeemed and the page the human started from
 * restored. Without a connection for the URL's room the page goes to the engine by itself once (the engine approves
 * its own client for a member without a click); after a refusal or a revocation it waits for a click, so a connection
 * revoked on the engine UI is never silently renewed. {base} lists the rooms this browser is connected to.
 */
function Hosted({ conn }: { conn: Connection }) {
  const auth = playerAuth();
  const route = useClientRoute();
  const [, setVersion] = useState(0);
  const [completing, setCompleting] = useState(() => /[?&](code|error)=/.test(location.search) && /[?&]state=/.test(location.search));
  const [error, setError] = useState<string>();
  const [manual, setManual] = useState(false);
  const [device, setDevice] = useState<{ userCode: string; verificationUrl: string }>();
  const [held, setHeld] = useState<string | null>(null);
  const room = "room" in route ? route.room : "";
  const session = completing ? null : room ? auth.session(room) : route.kind === "legacyGame" ? auth.session() : null;

  useEffect(() => auth.onChange(() => setVersion(v => v + 1)), [auth]);
  // A connection that disappears while in use was revoked or expired: say so and wait for the human.
  useEffect(() => {
    if (session) { setHeld(session.credentialId); return; }
    if (held) { setHeld(null); setManual(true); setError("This connection was revoked or has expired. Connect again to keep playing."); }
  }, [session?.credentialId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setManual(false); setError(undefined); setDevice(undefined); }, [roomKey(room)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!completing) return;
    auth.completeSignIn().then(done => {
      if (!done) return;
      // /connect may have connected another room than the page named (the human chose it): follow the connection.
      const back = new URL(done.returnTo || BASE, location.origin);
      const parsed = parseRoute(BASE, back.pathname, back.search).route;
      const same = "room" in parsed && roomKey(parsed.room) === roomKey(done.session.roomCode);
      navigate(same ? `${back.pathname}${back.search}` : hrefTo({ kind: "room", room: done.session.roomCode }), { replace: true });
    }, e => { setError(messageOf(e)); setManual(true); }).finally(() => setCompleting(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const step = hostedStep({ room, session, framed: framed(), autoAllowed: !manual && !error });
  useEffect(() => {
    if (completing || step.step !== "redirect") return;
    if (autoRedirectAllowed(tabStorage(), room, Date.now())) connectRoom(room).catch(e => { setError(messageOf(e)); setManual(true); });
    else setManual(true);
  }, [completing, step.step, room]);

  if (completing || step.step === "redirect") return <Screen title="Connecting…" testId="status-connecting" />;
  if (step.step === "ask") return <ConnectedRooms error={error} />;
  if (step.step === "connect") {
    const viaDevice = () => {
      setError(undefined);
      auth.signInWithDevice({ room, permission: "act", label: "Code Gods player client (in a frame)" }).then(pending => {
        setDevice(pending);
        pending.session.then(() => { setDevice(undefined); setManual(false); }, e => { setDevice(undefined); setError(messageOf(e)); });
      }, e => setError(messageOf(e)));
    };
    return (
      <Screen title={`Connect to room ${room}`}>
        <p>This client plays as you in one room, with a connection you approve on the engine ({new URL(conn.siteUrl ?? auth.engineUrl).host}). Sign in there with Google; your full name is shown in the room and chat is public.</p>
        {error && <p className="text-sm text-destructive" data-testid="text-login-error">{error}</p>}
        {device ? (
          <div className="space-y-2" data-testid="panel-device-code">
            <p>Open <a className="underline" href={device.verificationUrl} target="_blank" rel="noreferrer">{device.verificationUrl}</a> in a browser where you are signed in, and check the code <span className="font-mono">{device.userCode}</span>.</p>
            <p className="text-sm text-muted-foreground">Waiting for your approval…</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {!step.framed && <button data-testid="link-login" onClick={() => { void connectRoom(room).catch(e => setError(messageOf(e))); }} className="inline-flex bg-primary text-primary-foreground px-4 py-2 font-semibold">Sign in and connect</button>}
            <button data-testid="button-connect-device" onClick={viaDevice} className={step.framed ? "inline-flex bg-primary text-primary-foreground px-4 py-2 font-semibold" : "inline-flex border px-4 py-2"}>Connect with a code{step.framed ? "" : " instead"}</button>
          </div>
        )}
        <p className="text-sm"><Link to={{ kind: "home" }} className="underline">Another room</Link></p>
      </Screen>
    );
  }
  return <HostedPlay key={step.session.credentialId} session={step.session} conn={conn} />;
}

/** Hosted at {base}: the rooms this browser holds a connection for, and a code to open another. */
function ConnectedRooms({ error }: { error?: string }) {
  const sessions = playerAuth().sessions().sort((a, b) => a.roomCode.localeCompare(b.roomCode));
  return (
    <Screen title="Your rooms" testId="screen-your-rooms">
      {sessions.length === 0 ? <p className="text-muted-foreground">Open a room with the code its owner sent you. You approve this client on the engine, once per room.</p> : (
        <ul className="divide-y divide-[hsl(var(--card-border))] border border-[hsl(var(--card-border))] bg-card">
          {sessions.map(s => (
            <li key={s.credentialId}>
              <Link to={{ kind: "room", room: s.roomCode }} className="flex items-baseline gap-3 px-4 py-3 hover:bg-muted" data-testid={`link-room-${s.roomCode}`}>
                <span className="font-mono font-semibold">{s.roomCode}</span>
                <span className="text-sm text-muted-foreground">{s.permission} access</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <RoomCodeForm error={error} />
    </Screen>
  );
}

/** One room's connection: the Convex client authenticates with its player JWT (refreshed by the SDK). */
function HostedPlay({ session, conn }: { session: PlayerSession; conn: Connection }) {
  const client = convexClient(conn.convexUrl);
  const useAuth = useMemo(() => {
    const value = { isLoading: false, isAuthenticated: true, fetchAccessToken: playerAuth().fetchToken(session) };
    return () => value;
  }, [session.credentialId]); // eslint-disable-line react-hooks/exhaustive-deps
  return <ConvexProviderWithAuth client={client} useAuth={useAuth}><HostedReady session={session} /></ConvexProviderWithAuth>;
}

function HostedReady({ session }: { session: PlayerSession }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading || !isAuthenticated) return <Screen title="Connecting…" testId="status-connecting" />;
  return <Routed mode="hosted" permission={session.permission} credentialRoomId={session.roomId} />;
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
  if (route.kind === "home") return mode === "devserver" ? <CredentialRoom roomId={credentialRoomId!} /> : <ConnectedRooms />;
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
 * screen; a connection is approved only for a member, so this is rare); dev server, the credential's room (a
 * credential is bound to one room). Canonicalises the code in the URL.
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
 * {base}rooms/:room/games/:game. The room's current game is played on the room's own screen while it is live, so its
 * URL becomes the room's (and the screen follows the room into its next game, as {base}rooms/:room does). An ended
 * game, the room's latest included, opens as its replay, read-only; the engine refuses it to anyone but its players and the room owner, and that refusal is shown here.
 * games.resolve decides (one game and its room), so a live game's world is not loaded twice.
 */
function GameRoute({ room, code, meId }: { room: RoomState; code: string; meId?: string }) {
  const queries = useMemo((): Record<string, { query: typeof api.games.resolve; args: { code: string } }> => ({ game: { query: api.games.resolve, args: { code } } }), [code]);
  const result = useQueries(queries).game as FunctionReturnType<typeof api.games.resolve> | Error | undefined;
  const elsewhere = result && !(result instanceof Error) && result.roomId !== room.id;
  // The room's current game is played on the room's screen, unless it has ended: then this page is its replay.
  const current = result && !(result instanceof Error) && !elsewhere && result.status === "current" && !result.ended;
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
  return <HistoricGame game={result} roomId={room.id} roomCode={room.shortCode} meId={meId} />;
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
      <MyGoalProvider>
        <CoreBoundary>
          <PlayerShell />
        </CoreBoundary>
      </MyGoalProvider>
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
