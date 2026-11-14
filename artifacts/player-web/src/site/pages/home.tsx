/**
 * Home: your rooms (a paged skeleton of memberships; each row subscribes to its own room), Create room and Join with
 * a code. Creating a room seats you and opens it (ux-lessons 1.1).
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { api } from "@workspace/engine/convex/_generated/api";
import { presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { Page } from "@/site/components/layout";
import { AffordanceButton } from "@/site/components/action";
import { EmptyState, ErrorLine } from "@/site/components/page-parts";
import { useAuth } from "@/site/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import { useLive, useLivePages } from "@/site/lib/convex";
import { errMsg } from "@/site/lib/errors";
import { affordanceContext } from "@/core/affordance-context";
import { roomPath } from "@/site/lib/routes";

const phaseWords = { planning: "planning", live: "running", paused: "paused", ended: "ended" } as const;

function RoomRow({ roomId }: { roomId: string }) {
  const r = useLive(api.v2.rooms.get, { roomId });
  if (r.error) return <li className="px-4 py-4 text-sm text-muted-foreground">This room is not available: {errMsg(r.error)}</li>;
  const room = r.data;
  if (!room) return <li className="px-4 py-4"><Skeleton className="h-8 w-full" /></li>;
  const owner = room.members.find(m => m.owner);
  const players = room.members.filter(m => !m.spectator).length, need = presetOf(room.preset).minPlayers;
  const status = room.game ? `Game ${room.game.number} ${phaseWords[room.game.phase]}`
    : `Lobby · ${players} player${players === 1 ? "" : "s"}${players < need ? ` · needs ${need - players} more` : ""}`;
  return (
    <li>
      <Link href={roomPath(room.code)} className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] items-center gap-x-5 gap-y-1 px-4 py-4 hover:bg-muted/60" data-testid={`row-room-${room.roomId}`}>
        <span className="font-mono text-xl font-semibold">{room.code}</span>
        <span className="min-w-0 text-sm space-y-0.5">
          <span className="block break-words font-medium">{room.name}</span>
          <span className="block text-muted-foreground">Owner: {owner?.name ?? "?"}{owner?.me ? " (you)" : ""} · {presetOf(room.preset).title}</span>
        </span>
        <span className="col-span-2 sm:col-span-1 text-sm text-muted-foreground" data-testid={`text-room-phase-${room.roomId}`}>{status}</span>
      </Link>
    </li>
  );
}

function JoinByCode({ onCancel }: { onCancel: () => void }) {
  const [code, setCode] = useState("");
  const [, navigate] = useLocation();
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => e.preventDefault()}>
      <input autoFocus value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Room code" aria-label="Room code"
        className="h-9 w-36 border px-2 font-mono uppercase" data-testid="input-join-code" />
      <AffordanceButton id="room.join" args={() => ({ code })} label="Join" tone="primary" testId="button-join-submit"
        disabledReason={code.trim().length < 4 ? "Type the room's code first." : null}
        onDone={() => navigate(roomPath(code.trim().toUpperCase()))} />
      <button type="button" className="text-sm underline underline-offset-4 text-muted-foreground" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function Rooms() {
  const rooms = useLivePages(api.v2.rooms.list, {}, { initialNumItems: 20 });
  const [, navigate] = useLocation();
  const [joining, setJoining] = useState(false);
  const empty = rooms.status === "Exhausted" && rooms.results.length === 0;
  const create = <AffordanceButton id="room.create" args={{}} label="Create room" busyLabel="Creating…" tone="primary" testId="button-create-room"
    onDone={r => navigate(roomPath(r.code))} />;
  const join = joining ? <JoinByCode onCancel={() => setJoining(false)} />
    : <button type="button" onClick={() => setJoining(true)} className="border px-4 py-2 text-sm font-medium hover:bg-muted" data-testid="button-join-by-code">Join with a code</button>;
  return (
    <div className="mx-auto max-w-[1100px] px-4 md:px-6 py-10 rise">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <h1 className="font-display text-5xl">Your rooms</h1>
        {!empty && <div className="flex flex-wrap gap-3">{join}{create}</div>}
      </div>
      <section className="border bg-card">
        {rooms.status === "LoadingFirstPage" && <div className="p-4 space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>}
        {empty && <EmptyState title="No rooms yet" body="Create one and share its code. A game needs 3 players; practice partners can fill the empty seats." action={<div className="flex flex-wrap justify-center gap-3">{create}{join}</div>} testId="empty-rooms" />}
        {rooms.results.length > 0 && (
          <ul className="divide-y">
            {rooms.results.map(r => <ErrorBoundary key={r.roomId} FallbackComponent={() => <li className="px-4 py-4 text-sm text-muted-foreground">This room could not be shown.</li>}><RoomRow roomId={r.roomId} /></ErrorBoundary>)}
          </ul>
        )}
        {rooms.status === "CanLoadMore" && <button type="button" className="w-full border-t py-3 text-sm underline underline-offset-4" onClick={() => rooms.loadMore(20)} data-testid="button-more-rooms">Show more rooms</button>}
      </section>
    </div>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading, error, refetch, user } = useAuth();
  useEffect(() => { document.title = "Code Gods"; }, []);
  const context = affordanceContext({ signedIn: isAuthenticated, admin: !!user?.isAdmin });
  return (
    <Page context={context} placeholder={isAuthenticated ? "Search or enter a room code" : "Search or do anything…"} crumbs={isAuthenticated ? [{ label: "Your rooms" }] : []}>
      {isLoading ? (
        <div className="mx-auto max-w-[1100px] px-6 py-16 space-y-4"><Skeleton className="h-16 w-2/3" /><Skeleton className="h-6 w-1/2" /></div>
      ) : error ? (
        <div className="mx-auto max-w-xl px-6 py-16"><ErrorLine message={errMsg(error)} onRetry={() => refetch()} /></div>
      ) : isAuthenticated ? <Rooms /> : null}
    </Page>
  );
}
