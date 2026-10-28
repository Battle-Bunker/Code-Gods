import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useActivityReady, useServerIdle } from "@/hooks/use-server-idle";
import { useListRooms, getListRoomsQueryKey, useCreateRoom } from "@workspace/api-client-react";
import { useManifest } from "@/hooks/use-manifest";
import { Shell, Panel, Empty, ErrorLine, Sigil } from "@/components/shell";
import { useAuth, displayName } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { errMsg } from "@/lib/errors";
import { fmtWhen, isoWhen } from "@/lib/time";
import { ArrowRight, Plus, Hash } from "lucide-react";

const tenets = [
  ["01", "Universes are programs", "Each room runs a world of objects: numbers, strings or grids of coloured symbols. Agents are ordinary Python or TypeScript that reshape them, one move at a time."],
  ["02", "Gods spend energy", "Every deity earns energy and spends it to summon agents; each agent has its own energy for every move it makes. Planning windows open, then the world runs."],
  ["03", "Utility is political", "Your points from an object grow with how rare it is for you and how much everyone else cares. Coalitions form around shared interests and dissolve when the sums shift."],
  ["04", "This screen is the arena", "Project it. Everyone sees the same ranked objects, the same leaderboard, the same chat. Players act from their own clients."],
];

function Landing() {
  const { login } = useAuth();
  const manifest = useManifest();
  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-6">
      <section className="grid md:grid-cols-[1.4fr_1fr] gap-10 py-14 md:py-24 border-b">
        <div className="rise">
          <p className="label-mono mb-6">A negotiation game for programmers</p>
          <h1 className="font-display text-6xl md:text-8xl leading-[0.92]">
            Gods bargain.<br /><em className="text-primary">Universes</em> execute.
          </h1>
          <p className="mt-8 max-w-xl text-lg text-muted-foreground">
            Code Gods is a live arena where human and AI deities share one running world, trade influence over its objects, and watch alliances rise and break in real time.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button onClick={login} className="group inline-flex items-center gap-3 bg-foreground text-background px-6 py-3.5 text-base" data-testid="button-login">
              Log in to enter the pantheon <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <span className="label-mono">Have a room link? Log in, then open it.</span>
          </div>
        </div>
        <div className="relative hidden md:flex items-center justify-center rise" style={{ animationDelay: ".15s" }}>
          <div className="absolute inset-6 rounded-full border border-dashed border-foreground/20" />
          <div className="absolute inset-20 rounded-full border border-primary/30" />
          <Sigil size={220} />
        </div>
      </section>
      <section className="grid md:grid-cols-4 border-b">
        {tenets.map(([n, t, b], i) => (
          <div key={n} className={`py-8 md:px-6 ${i ? "md:border-l" : ""} rise`} style={{ animationDelay: `${0.1 * i + 0.2}s` }}>
            <span className="font-mono text-accent text-sm">{n}</span>
            <h3 className="font-display text-2xl mt-2">{t}</h3>
            <p className="text-sm text-muted-foreground mt-2">{b}</p>
          </div>
        ))}
      </section>
      <section className="py-10 grid md:grid-cols-[1fr_2fr] gap-6 items-start">
        <p className="label-mono">Server manifest</p>
        <div className="font-mono text-sm" data-testid="text-manifest">
          {manifest.isLoading && <Skeleton className="h-5 w-72" />}
          {manifest.error && <ErrorLine message={errMsg(manifest.error)} onRetry={() => manifest.refetch()} />}
          {manifest.data && (
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <span>protocol <b>v{manifest.data.protocolVersion}</b></span>
              <span>quorum <b>{manifest.data.minimumPlayers} deities</b></span>
              <span>runtimes <b>{manifest.data.runtimes.join(", ") || "none registered"}</b></span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function phaseTone(p: string) {
  if (/run|play|active/i.test(p)) return "bg-primary text-primary-foreground";
  if (/plan|pause/i.test(p)) return "bg-accent text-accent-foreground";
  if (/end|finish|over/i.test(p)) return "bg-foreground/80 text-background";
  return "border text-foreground";
}

function Rooms() {
  const idle=useServerIdle();
  const activityReady=useActivityReady();
  const { user } = useAuth();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const rooms = useListRooms({ query: { queryKey: getListRoomsQueryKey(), enabled:!!user && activityReady && !idle, refetchInterval: idle || !activityReady ? false : 5000 } });
  const create = useCreateRoom();
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState("");

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ data: {} }, {
      onSuccess: (room) => { qc.invalidateQueries({ queryKey: getListRoomsQueryKey() }); nav(`/rooms/${room.shortCode}`); },
    });
  };
  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    if (!/^[A-Za-z0-9-]{4,36}$/.test(c)) {
      setCodeErr("Enter a room code or full room UUID.");
      return;
    }
    nav(`/rooms/${encodeURIComponent(c)}`);
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8 rise">
        <div>
          <p className="label-mono">Signed in as {displayName(user)}</p>
          <h1 className="font-display text-5xl md:text-6xl mt-1">The pantheon</h1>
        </div>
      </div>
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Panel title="Rooms" meta={rooms.data ? `${rooms.data.length} listed` : undefined}>
          {rooms.isLoading && <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
          {rooms.error && <div className="p-4"><ErrorLine message={errMsg(rooms.error)} onRetry={() => rooms.refetch()} /></div>}
          {rooms.data && rooms.data.length === 0 && <Empty title="No rooms exist yet" body="Create a room, share its code or link, and wait for at least two more deities." />}
          {rooms.data && rooms.data.length > 0 && (
            <ul className="divide-y">
              {rooms.data.map((r, i) => (
                <li key={r.id} className="rise" style={{ animationDelay: `${i * 0.03}s` }}>
                  <button onClick={() => nav(`/rooms/${r.shortCode}`)} className="w-full grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_auto] items-center gap-x-4 gap-y-3 px-4 py-4 text-left hover:bg-muted/60 transition-colors" data-testid={`row-room-${r.id}`}>
                    <span className="font-mono text-lg font-semibold border px-2 py-1" title={r.id}>{r.shortCode}</span>
                    <span className="min-w-0 space-y-1">
                      <span className="block text-sm font-medium break-words">Owner: {r.ownerName}{r.ownerId === user?.id ? " (you)" : ""}</span>
                      <span className="block text-sm">
                        Created: {r.createdAt === null
                          ? <span title="This room predates creation-date tracking.">Not recorded</span>
                          : <time dateTime={isoWhen(r.createdAt)} title={isoWhen(r.createdAt)}>{fmtWhen(r.createdAt)}</time>}
                      </span>
                    </span>
                    <span className="font-mono text-sm tabular-nums">{r.memberCount}<span className="text-muted-foreground"> seats</span></span>
                    <span className="flex flex-col items-start sm:items-end gap-1">
                      <span className={`label-mono !text-inherit px-2 py-1 ${phaseTone(r.phase)}`} data-testid={`text-room-phase-${r.id}`}>{r.activeGameShortCode ? `game ${r.phase}` : r.phase}</span>
                      {r.activeGameShortCode && <span className="font-mono text-xs text-muted-foreground" data-testid={`text-room-game-${r.id}`}>game {r.activeGameShortCode}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-6">
          <Panel title="Found a room">
            <form onSubmit={submitCreate} className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">Your room’s short code is generated automatically from its GUID.</p>
              <button disabled={create.isPending} className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 text-sm disabled:opacity-50" data-testid="button-create-room">
                <Plus className="h-4 w-4" /> {create.isPending ? "Founding..." : "Create room"}
              </button>
              {create.error && <ErrorLine message={errMsg(create.error)} />}
            </form>
          </Panel>
          <Panel title="Join by code">
            <form onSubmit={submitCode} className="p-4 space-y-3">
              <div className="flex items-center border bg-background focus-within:border-primary">
                <Hash className="h-4 w-4 ml-3 text-muted-foreground" />
                <input value={code} onChange={(e) => { setCode(e.target.value); setCodeErr(""); }} placeholder="SHORT CODE" className="flex-1 bg-transparent px-2 py-2 font-mono uppercase tracking-widest text-sm outline-none" data-testid="input-join-code" />
              </div>
              <button disabled={!code.trim()} className="w-full border py-2 text-sm hover:bg-muted disabled:opacity-50" data-testid="button-join-code">Open room</button>
              {codeErr && <p className="text-xs text-destructive" data-testid="text-code-error">{codeErr}</p>}
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading, error, refetch } = useAuth();
  return (
    <Shell>
      {isLoading ? (
        <div className="mx-auto max-w-[1440px] px-6 py-16 space-y-4"><Skeleton className="h-16 w-2/3" /><Skeleton className="h-6 w-1/2" /></div>
      ) : error ? (
        <div className="mx-auto max-w-xl px-6 py-16"><ErrorLine message={errMsg(error)} onRetry={() => refetch()} /></div>
      ) : isAuthenticated ? <Rooms /> : <Landing />}
    </Shell>
  );
}
