import { useEffect, useRef } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import {
  useGetRoom, getGetRoomQueryKey, useListRoomGames, getListRoomGamesQueryKey,
  type RoomState,
} from "@workspace/api-client-react";
import { Shell, ErrorLine } from "@/components/shell";
import { GameRules } from "@/components/game-rules";
import { Chat, Conn, ReadOnlySettings, Repertoire, ScoringPanel } from "@/components/game-panels";
import { History, Members, OwnerSettings, useAct } from "@/components/room-panels";
import { useAuth } from "@/hooks/use-auth";
import { useActivityReady, useServerIdle } from "@/hooks/use-server-idle";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/errors";
import { fmtWhen, isoWhen } from "@/lib/time";
import { useManifest } from "@/hooks/use-manifest";
import { ArrowRight, Copy, Crown, Radio } from "lucide-react";

function Header({ room, isOwner }: { room: RoomState; isOwner: boolean }) {
  const { toast } = useToast();
  const copy = () => { navigator.clipboard.writeText(new URL(`/rooms/${room.shortCode}`, window.location.origin).href).then(() => toast({ title: "Room link copied" }), () => toast({ title: "Could not copy room link", variant: "destructive" })); };
  return (
    <div className="border-b bg-card/70">
      <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 grid md:grid-cols-[1fr_auto] gap-6 items-end">
        <div className="rise">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="label-mono">Room</span>
            <button onClick={copy} className="font-mono text-sm border px-2 py-0.5 inline-flex items-center gap-1.5 hover:bg-muted" title="Copy room link" data-testid="button-copy-link">{room.shortCode}<Copy className="h-3 w-3" /></button>
            {isOwner && <span className="label-mono inline-flex items-center gap-1 !text-accent"><Crown className="h-3 w-3" /> you own this room</span>}
            <span className="label-mono">rev {room.revision}</span>
          </div>
          <h1 className="font-display text-5xl md:text-7xl leading-none mt-3" data-testid="text-room-code">{room.shortCode}</h1>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border border">
          <div className="bg-card px-4 py-2 min-w-[160px]">
            <div className="label-mono">owner</div>
            <div className="text-lg inline-flex items-center gap-1.5" data-testid="text-room-owner"><Crown className="h-4 w-4 text-accent" />{room.ownerName}</div>
          </div>
          <div className="bg-card px-4 py-2 min-w-[160px]">
            <div className="label-mono">created</div>
            <div className="text-lg" data-testid="text-room-created">{room.createdAt === null
              ? <span title="This room predates creation-date tracking.">Not recorded</span>
              : <time dateTime={isoWhen(room.createdAt)}>{fmtWhen(room.createdAt)}</time>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveBanner({ room, meId }: { room: RoomState; meId?: string }) {
  const g = room.activeGame;
  if (!g) return null;
  const seated = g.roster.some((r) => r.id === meId);
  const member = room.members.some((m) => m.id === meId);
  return (
    <Link href={`/games/${g.shortCode}`} className="block border border-accent bg-accent/10 hover:bg-accent/20 px-4 py-3 rise" data-testid="banner-active-game">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Radio className="h-4 w-4 text-accent pulse-dot" />
        <span className="font-display text-2xl">Game {g.shortCode} is running</span>
        <span className="label-mono">phase {g.phase}</span>
        <span className="label-mono">started {fmtWhen(g.startedAt)}</span>
        <span className="text-sm" data-testid="text-viewer-seat">{seated ? "You are seated in this game." : member ? "You are spectating; you play in the next game." : "You are watching; join the room to play the next game."}</span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">Open game <ArrowRight className="h-4 w-4" /></span>
      </div>
    </Link>
  );
}

export default function Room() {
  const idle=useServerIdle();
  const activityReady=useActivityReady();
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const requestedGame = new URLSearchParams(useSearch()).get("game");
  const { user, isAuthenticated, isLoading: authLoading, login } = useAuth();
  const live = activityReady && !idle && !!id && isAuthenticated && !requestedGame;
  const q = useGetRoom(id, { query: { queryKey: getGetRoomQueryKey(id), enabled: live, refetchInterval: idle || !activityReady ? false : 1000 } });
  const room = q.data;
  const games = useListRoomGames(room?.id ?? "", { query: { queryKey: getListRoomGamesQueryKey(room?.id ?? ""), enabled: live && !!room, refetchInterval: idle || !activityReady ? false : 15000 } });
  const manifest = useManifest();
  const act = useAct(id);
  // Legacy links: /rooms/:id?game=CODE now belong to the game's own page.
  useEffect(() => {
    if (requestedGame) navigate(`/games/${encodeURIComponent(requestedGame)}`, { replace: true });
  }, [requestedGame, navigate]);
  useEffect(() => {
    if (room && id !== room.shortCode) {
      navigate(`/rooms/${room.shortCode}${window.location.search}${window.location.hash}`, { replace: true });
    }
  }, [id, room?.shortCode, navigate]);
  // Launch: take viewers to the new game, but never on first load (the banner covers that).
  const activeId = room?.activeGame?.id ?? null;
  const seenActive = useRef<{ room: string; game: string | null } | null>(null);
  const refetchGames = games.refetch;
  useEffect(() => {
    if (!room) return;
    const prev = seenActive.current;
    seenActive.current = { room: room.id, game: activeId };
    if (!prev || prev.room !== room.id || prev.game === activeId) return;
    void refetchGames();
    if (activeId && room.activeGame) navigate(`/games/${room.activeGame.shortCode}`);
  }, [activeId, room, navigate, refetchGames]);
  const isOwner = !!room && room.ownerId === user?.id;
  const isMember = !!room && room.members.some((m) => m.id === user?.id);
  const minPlayers = manifest.data?.minimumPlayers ?? 3;
  useEffect(() => { document.title = `Room ${room?.shortCode ?? id} · Code Gods`; }, [room?.shortCode, id]);

  return (
    <Shell right={room && <Conn ok={!q.isError} updatedAt={q.dataUpdatedAt} fetching={q.isFetching} />}>
      {requestedGame ? <p className="mx-auto max-w-lg px-4 py-20" role="status" data-testid="status-legacy-redirect">Opening game {requestedGame}…</p>
      : authLoading ? null : !isAuthenticated ? (
        <div className="mx-auto max-w-lg px-4 py-20 text-center rise">
          <p className="label-mono">Shared room</p>
          <h1 className="font-display text-5xl mt-2">You were summoned.</h1>
          <p className="text-muted-foreground mt-3">Log in to view this room and claim a seat.</p>
          <button onClick={login} className="mt-8 bg-foreground text-background px-5 py-3" data-testid="button-login-room">Log in</button>
        </div>
      ) : q.isLoading ? (
        <div className="mx-auto max-w-[1440px] px-6 py-8 space-y-4"><Skeleton className="h-20 w-1/2" /><div className="grid lg:grid-cols-3 gap-4"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>
      ) : !room ? (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4">
          <ErrorLine message={q.error ? errMsg(q.error) : "Room not found"} onRetry={() => q.refetch()} />
          <Link href="/" className="label-mono underline" data-testid="link-back">Back to rooms</Link>
        </div>
      ) : (<>
        <Header room={room} isOwner={isOwner} />
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 pt-4 space-y-3 empty:hidden">
          {q.isError && <ErrorLine message={`Showing last known state. ${errMsg(q.error)}`} onRetry={() => q.refetch()} />}
          <ActiveBanner room={room} meId={user?.id} />
        </div>
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_360px] items-start">
          <div className="space-y-6 min-w-0">
            <Members room={room} meId={user?.id} isOwner={isOwner} act={act} minPlayers={minPlayers} />
            <Chat messages={room.chat} canPost={isMember} pending={act.pending} placeholder={isMember ? "Speak to all deities" : "Join the room to speak"} onSend={(text, done) => act.run({ action: "chat", text }, done)} />
          </div>
          <div className="space-y-6 min-w-0">
            <History games={games.data} loading={games.isLoading} error={games.error} onRetry={() => void games.refetch()} />
            <GameRules settings={room.settings} instance={room.objectInstance} roomCode={room.shortCode} note="Includes this room’s settings for the next game." />
            <ScoringPanel objectType={room.objectInstance?.objectType} />
          </div>
          <div className="space-y-6 min-w-0">
            {isOwner && manifest.isError && <ErrorLine message={`Could not load settings options: ${errMsg(manifest.error)}`} onRetry={() => void manifest.refetch()} />}
            {isOwner ? <OwnerSettings room={room} act={act} defaults={manifest.data?.defaults} options={manifest.data?.options} optionsFailed={manifest.isError} aiFunding={manifest.data?.aiFunding} objectTypes={manifest.data?.objectTypes} presets={manifest.data?.presets} />
              : <ReadOnlySettings settings={room.settings} instance={room.objectInstance} title="Settings for the next game" note={room.activeGame ? `Frozen while game ${room.activeGame.shortCode} runs.` : "Only the room owner can change these."} />}
            {!isOwner && <Repertoire catalog={room.utilityCatalog} classes={manifest.data?.objectTypes.find(t => t.id === room.settings.objectType)?.classes} />}
          </div>
        </div>
      </>)}
    </Shell>
  );
}
