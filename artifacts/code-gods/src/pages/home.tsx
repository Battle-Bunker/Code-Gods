import { useEffect } from "react";
import { Link } from "wouter";
import { api, useLive } from "@/lib/convex";
import { Page, usePage } from "@/components/layout";
import { Action } from "@/components/action";
import { EmptyState, ErrorLine } from "@/components/page-parts";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { errMsg } from "@/lib/errors";
import { fmtWhen, isoWhen } from "@/lib/time";
import type { RoomListRow } from "@/lib/types";

const STEPS = [
  ["Join or create a room", "A room is a table for 3 to 8 players; AI players can fill seats."],
  ["Write a tiny agent and bargain in chat", "Agents change the shared world; deals in the public chat decide whose wishes win."],
  ["Highest score wins", "The game ends at a random moment; your score is what your objects are worth then."],
] as const;

/** Signed out: one sentence, three steps, one button. */
function Landing() {
  const { run } = usePage();
  return (
    <div className="mx-auto max-w-[1100px] px-4 md:px-6 py-14 md:py-24 rise">
      <h1 className="font-display text-6xl md:text-8xl leading-[0.92]">Gods bargain.<br /><em className="text-primary">Universes</em> execute.</h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">A negotiation game for programmers: players share one running world, write tiny agents that change it, and bargain over what it should become.</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Action k="ui.auth.signIn" tone="primary" onClick={() => run("ui.auth.signIn")} testId="button-login" className="px-6 py-3 text-base" />
        <span className="text-sm text-muted-foreground">Got an invite link? Just open it; you'll sign in there.</span>
      </div>
      <section className="mt-16 border-t pt-8">
        <h2 className="text-sm font-medium">How a game goes</h2>
        <ol className="mt-4 grid gap-6 md:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title}>
              <span className="font-mono text-accent text-sm">{i + 1}</span>
              <h3 className="font-display text-2xl mt-1">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const statusWords = (r: RoomListRow) =>
  r.activeGameShortCode ? `Game ${r.activeGameShortCode} ${r.phase === "recovery" ? "paused" : r.phase}` : `Lobby · ${r.memberCount} player${r.memberCount === 1 ? "" : "s"}`;

/** Signed in: your rooms, prominently with owner and creation date (no names); one Create room. */
function Rooms() {
  const { user } = useAuth();
  const { run, openPalette } = usePage();
  const rooms = useLive(api.rooms.list, {});
  const empty = rooms.data?.length === 0;
  const create = <Action k="rooms.create" label="Create room" tone="primary" onClick={() => run("rooms.create")} testId="button-create-room" />;
  return (
    <div className="mx-auto max-w-[1100px] px-4 md:px-6 py-10 rise">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <h1 className="font-display text-5xl">Your rooms</h1>
        {!empty && create}
      </div>
      <section className="border bg-card">
        {rooms.isLoading && <div className="p-4 space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>}
        {rooms.error && <div className="p-4"><ErrorLine message={errMsg(rooms.error)} /></div>}
        {empty && <EmptyState title="No rooms yet" body="Create one and share its link. A game needs 3 players, and AI players count." action={create} testId="empty-rooms" />}
        {!!rooms.data?.length && (
          <ul className="divide-y">
            {rooms.data.map(r => (
              <li key={r.id}>
                <Link href={`/rooms/${r.shortCode}`} className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] items-center gap-x-5 gap-y-1 px-4 py-4 hover:bg-muted/60" data-testid={`row-room-${r.id}`}>
                  <span className="font-mono text-xl font-semibold">{r.shortCode}</span>
                  <span className="min-w-0 text-sm space-y-0.5">
                    <span className="block break-words">Owner: <span className="font-medium">{r.ownerName}{r.ownerId === user?.id ? " (you)" : ""}</span></span>
                    <span className="block">Created: <time dateTime={isoWhen(r.createdAt)}>{fmtWhen(r.createdAt)}</time></span>
                  </span>
                  <span className="col-span-2 sm:col-span-1 text-sm text-muted-foreground" data-testid={`text-room-phase-${r.id}`}>{statusWords(r)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-4 text-sm text-muted-foreground">
        Have a code? <button type="button" onClick={() => openPalette()} className="underline underline-offset-4" data-testid="button-open-by-code">Type it in search</button> (Ctrl K or ⌘K).
      </p>
    </div>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading, error, refetch } = useAuth();
  useEffect(() => { document.title = "Code Gods"; }, []);
  return (
    <Page placeholder={isAuthenticated ? "Search or enter a room code" : "Search or do anything…"} crumbs={isAuthenticated ? [{ label: "Your rooms" }] : []}>
      {isLoading ? (
        <div className="mx-auto max-w-[1100px] px-6 py-16 space-y-4"><Skeleton className="h-16 w-2/3" /><Skeleton className="h-6 w-1/2" /></div>
      ) : error ? (
        <div className="mx-auto max-w-xl px-6 py-16"><ErrorLine message={errMsg(error)} onRetry={() => refetch()} /></div>
      ) : isAuthenticated ? <Rooms /> : <Landing />}
    </Page>
  );
}
