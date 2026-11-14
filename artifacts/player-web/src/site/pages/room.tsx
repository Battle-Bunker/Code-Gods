/**
 * The room page (palette-and-pages.md §3.3): the room's code and owner, one status sentence and one filled button
 * (site/lib/next-step.ts), then Members, Public chat, Next game (the preset) and Past games. Every button is an
 * affordance (`useAffordance`); the palette offers the same operations.
 *
 * The URL carries the room's code: `v2/rooms:byCode` finds it (and whether the viewer is a member); a member's page
 * subscribes to `v2/rooms:get`. When the room's game starts, everyone on the page is taken to it (never on first load).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Bot, Copy, Crown, User } from "lucide-react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { PRESETS, presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { useLive, useLivePages } from "@/site/lib/convex";
import { useAuth } from "@/site/hooks/use-auth";
import { Page } from "@/site/components/layout";
import { AffordanceButton, Tip, failureText } from "@/site/components/action";
import { EmptyState, ErrorLine, KeyValueStrip, NextStepBar, Section } from "@/site/components/page-parts";
import { RoomChat } from "@/site/components/chat";
import { Bidding } from "@/site/components/bidding";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import { nextStep, type Step } from "@/site/lib/next-step";
import { errMsg } from "@/site/lib/errors";
import { gamePath, roomPath } from "@/site/lib/routes";
import { affordanceContext } from "@/core/affordance-context";
import { toast } from "@/hooks/use-toast";
import type { Room } from "@/sdk/types";

function copyInvite(code: string) {
  const url = `${window.location.origin}${roomPath(code)}`;
  navigator.clipboard.writeText(url).then(() => toast({ title: "Invite link copied", description: url }), () => toast({ title: "Could not copy the invite link", description: url, variant: "destructive" }));
}

/**
 * "Play a practice game": one press fills the empty seats with practice partners and starts (ux-lessons 1.1). Two
 * affordances in turn; a failure of either says which, and the seats already filled stay.
 */
function PracticeButton({ primary }: { primary: boolean }) {
  const fill = useAffordance("seats.fillPracticePartners");
  const start = useAffordance("game.start");
  const [busy, setBusy] = useState(false);
  if (fill.hidden) return null;
  const reason = !fill.available ? fill.reason : null;
  const go = async () => {
    if (busy || reason) return;
    setBusy(true);
    try {
      await fill.run({});
      await start.run({});
    } catch (e) { toast({ title: "The practice game did not start", description: failureText(e), variant: "destructive" }); } finally { setBusy(false); }
  };
  return (
    <Tip text={fill.tooltip} reason={reason}>
      <button type="button" aria-disabled={!!reason || busy || undefined} onClick={() => void go()} data-testid="button-practice-game"
        className={`${primary ? "bg-primary text-primary-foreground px-4 py-2 text-sm font-medium" : "border px-3 py-2 text-sm"} ${reason || busy ? "opacity-50" : ""}`}>
        {busy ? "Starting the world…" : "Play a practice game"}
      </button>
    </Tip>
  );
}

function StepButton({ step, room, primary }: { step: Step; room: Room; primary?: boolean }) {
  const tone = primary ? "primary" : "secondary";
  switch (step) {
    case "join": return <AffordanceButton id="room.join" args={{ code: room.code }} label="Join this room" tone={tone} testId="button-join-room" />;
    case "practice": return <PracticeButton primary={!!primary} />;
    case "start": return <AffordanceButton id="game.start" args={{}} label="Start game" busyLabel="Starting…" tone={tone} testId="button-start-game" />;
    case "invite": return <button type="button" onClick={() => copyInvite(room.code)} className={primary ? "bg-primary text-primary-foreground px-4 py-2 text-sm font-medium" : "border px-3 py-2 text-sm"} data-testid="button-copy-invite">Copy invite link</button>;
    case "openGame": return room.game ? <Link href={gamePath(room.code, room.game.gameId)} className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold" data-testid="link-active-game">Open game {room.game.number}</Link> : null;
    case "play": return <AffordanceButton id="room.setSpectator" args={{ spectator: false }} label="Play the next game" tone={tone} testId="button-play" />;
    case "watch": return <AffordanceButton id="room.setSpectator" args={{ spectator: true }} label="Watch instead" tone="quiet" testId="button-watch" />;
  }
}

function Members({ room }: { room: Room }) {
  const min = presetOf(room.preset).minPlayers;
  const players = room.members.filter(m => !m.spectator).length;
  const open = room.game ? 0 : Math.max(0, min - players);
  const owner = room.members.find(m => m.me)?.owner;
  return (
    <Section title="Members" count={room.members.length} summary={`${players} playing`}>
      <ul className="divide-y">
        {room.members.map(m => (
          <li key={m.memberId} className="px-4 py-2.5 flex items-center gap-3" data-testid={`row-member-${m.memberId}`}>
            {m.kind === "human" ? <User className="h-4 w-4 text-primary shrink-0" aria-label="Human player" /> : <Bot className="h-4 w-4 text-accent shrink-0" aria-label={m.kind === "practice" ? "Practice partner" : "AI player"} />}
            <span className="flex-1 min-w-0 text-sm">
              <span className="block truncate">{m.name}{m.me && <span className="text-muted-foreground"> (you)</span>}{m.owner && <Crown className="inline h-3.5 w-3.5 ml-1.5 text-accent" aria-label="room owner" />}</span>
              <span className="block text-xs text-muted-foreground" data-testid={`text-member-seat-${m.memberId}`}>
                {[m.owner ? "owner" : null, m.spectator ? "watching" : "player", m.kind === "practice" ? "practice partner: costs nothing, needs no key" : m.kind === "ai" ? "AI player" : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            {owner && m.kind !== "human" && !room.game && <AffordanceButton id="seats.removeAi" args={{ memberId: m.memberId }} label="Remove" tone="quiet" testId={`button-remove-seat-${m.memberId}`} />}
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open-${i}`} className="px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-3"><span aria-hidden className="h-4 w-4 rounded-full border border-dashed" />
            <span className="flex-1">Open seat</span>
          </li>
        ))}
      </ul>
      {owner && !room.game && open > 0 && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground" data-testid="text-practice-partners">Practice partners can fill the empty seats, or invite people.</p>
      )}
    </Section>
  );
}

function NextGame({ room }: { room: Room }) {
  const preset = presetOf(room.preset);
  const settings = useAffordance("room.settings");
  const [busy, setBusy] = useState(false);
  const owner = room.members.find(m => m.me)?.owner;
  const choose = async (id: string) => {
    setBusy(true);
    try { await settings.run({ preset: id }); toast({ title: `Next game: ${presetOf(id).title}` }); } catch (e) { toast({ title: "The setting did not change", description: failureText(e), variant: "destructive" }); } finally { setBusy(false); }
  };
  const o = room.overrides;
  return (
    <Section title="Next game" testId="section-next-game">
      <div className="p-4 space-y-3 text-sm">
        {owner && !settings.hidden ? (
          <label className="flex flex-wrap items-center gap-2">
            <span>Setup</span>
            <select value={room.preset} disabled={busy || !!room.game} onChange={e => void choose(e.target.value)} className="h-9 border bg-background px-2" data-testid="select-preset">
              {PRESETS.filter(p => !p.id.includes("lab") || false).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            {!settings.available && <span className="text-xs text-muted-foreground">{settings.reason}</span>}
          </label>
        ) : <p>This room plays: <span className="font-medium" data-testid="text-setup">{preset.title}</span></p>}
        <p className="text-muted-foreground" data-testid="text-next-game-summary">
          Lines · {preset.minPlayers}+ players · {o.planningSeconds ?? preset.planningSeconds} s planning · {Math.round((o.worldSeconds ?? preset.worldSeconds) / 60)} min game · {o.startingEnergy ?? preset.startingEnergy} ⚡ to start{preset.bid ? ` · ${preset.bid.seconds} s bidding first` : ""}.
        </p>
        {room.game && <p className="text-xs text-muted-foreground" data-testid="text-settings-frozen">Changes apply after game {room.game.number} ends.</p>}
      </div>
    </Section>
  );
}

function PastGames({ room }: { room: Room }) {
  const history = useLivePages(api.v2.rooms.history, { roomId: room.roomId }, { initialNumItems: 10 });
  const [, navigate] = useLocation();
  const names = new Map(room.members.map(m => [m.memberId as string, m.name]));
  return (
    <Section title="Past games" count={history.results.length} collapsible defaultOpen testId="section-past-games">
      {!history.results.length ? <EmptyState title="No games yet" body="Finished games and their winners appear here." /> : (
        <ul className="divide-y">
          {history.results.map(g => (
            <li key={g.gameId} className="px-4 py-2.5 text-sm flex flex-wrap gap-x-4">
              <Link href={gamePath(room.code, g.gameId)} className="underline underline-offset-4" data-testid={`link-past-game-${g.gameId}`}>Game {g.number}</Link>
              <span className="text-muted-foreground">{g.winner ? `won by ${names.get(g.winner) ?? "a player who left"}` : "no winner"}{g.endedAt ? ` · ${new Date(g.endedAt).toLocaleString()}` : ""}</span>
              {g.endedAt !== null && (
                <AffordanceButton id="replay.open" args={{ gameId: g.gameId }} label="Watch the replay" busyLabel="Opening…" tone="link" testId={`button-replay-${g.gameId}`}
                  onDone={() => navigate(gamePath(room.code, g.gameId))} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function RoomBody({ room }: { room: Room }) {
  const step = nextStep(room, presetOf(room.preset).minPlayers);
  const owner = room.members.find(m => m.owner);
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-6">
      <header className="space-y-4 rise">
        <h1 className="font-display text-4xl md:text-5xl leading-none flex items-center gap-3">
          <span>Room <span data-testid="text-room-code">{room.code}</span></span>
          <Tip text="Copy the invite link"><button type="button" onClick={() => copyInvite(room.code)} aria-label="Copy invite link" className="text-muted-foreground hover:text-foreground"><Copy className="h-5 w-5" /></button></Tip>
        </h1>
        <KeyValueStrip items={[
          { label: "Name", value: room.name, testId: "text-room-name" },
          { label: "Owner", value: <>{owner?.name ?? "?"}{owner?.me ? " (you)" : ""}</>, testId: "text-room-owner" },
        ]} />
        <NextStepBar status={step.status} primary={step.primary && <StepButton step={step.primary} room={room} primary />}
          secondary={step.secondary.map(s => <StepButton key={s} step={s} room={room} />)} />
      </header>
      {room.bidding && !room.game && <Bidding roomId={room.roomId} />}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Members room={room} />
        <Section title="Public chat"><RoomChat roomId={room.roomId} /></Section>
      </div>
      <NextGame room={room} />
      <ErrorBoundary FallbackComponent={({ error }) => <ErrorLine message={`Past games could not load: ${errMsg(error)}`} />}><PastGames room={room} /></ErrorBoundary>
    </div>
  );
}

/** A member's room: subscribes to it and follows its game's start. */
function MemberRoom({ roomId, code }: { roomId: string; code: string }) {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const q = useLive(api.v2.rooms.get, { roomId });
  const room = q.data;
  // Launch: take viewers to the new game, but never on first load (the status sentence covers that).
  const gameId = room?.game?.gameId ?? null;
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!room) return;
    const prev = seen.current;
    seen.current = gameId;
    if (prev !== undefined && gameId && prev !== gameId) navigate(gamePath(room.code, gameId));
  }, [gameId, room, navigate]);
  const context = affordanceContext({ signedIn: isAuthenticated, admin: !!user?.isAdmin, room: room ?? null });
  return (
    <Page context={context} scope={{ roomId }} roomPath={roomPath(code)} crumbs={[{ label: code }]} placeholder={`Search or do anything in ${code}`} conn={room ? { ok: !q.error } : null}
      chip={room ? `Room ${room.code}` : undefined}>
      {q.isLoading ? <RoomSkeleton /> : !room ? (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4">
          <ErrorLine message={q.error ? errMsg(q.error) : "Room not found."} />
          <Link href="/" className="underline underline-offset-4" data-testid="link-back">Your rooms</Link>
        </div>
      ) : <RoomBody room={room} />}
    </Page>
  );
}

const RoomSkeleton = () => <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-4"><Skeleton className="h-20 w-1/2" /><div className="grid lg:grid-cols-2 gap-4"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>;

export default function RoomPage() {
  const { id = "" } = useParams<{ id: string }>();
  const code = id.toUpperCase();
  const { user, isAuthenticated } = useAuth();
  const found = useLive(api.v2.rooms.byCode, isAuthenticated && code ? { code } : "skip");
  useEffect(() => { document.title = `Room ${code} · Code Gods`; }, [code]);
  if (found.data?.member) return <MemberRoom roomId={found.data.roomId} code={code} />;
  const context = affordanceContext({ signedIn: isAuthenticated, admin: !!user?.isAdmin });
  return (
    <Page context={context} crumbs={[{ label: code }]}>
      {found.isLoading || !isAuthenticated ? <RoomSkeleton /> : (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4" data-testid="room-not-member">
          {found.data ? (<>
            <h1 className="font-display text-4xl">Room {code}</h1>
            <p>You were invited to room {code}. Join to play in the next game.</p>
            <AffordanceButton id="room.join" args={{ code }} label="Join this room" tone="primary" testId="button-join-room" />
          </>) : <ErrorLine message={found.error ? errMsg(found.error) : "Room not found. Check the code, or ask the owner for the link."} />}
          <p><Link href="/" className="underline underline-offset-4" data-testid="link-back">Your rooms</Link></p>
        </div>
      )}
    </Page>
  );
}
