/**
 * The room page (palette-and-pages.md §3.3): the room's code, owner and creation date; one status sentence and one
 * filled button from nextStep; then Players, Public chat, Next game (the Setup combobox and "See all settings →")
 * and Past games, collapsed. Everything else is in the palette.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { api, useLive } from "@/site/lib/convex";
import { catalogOf, type RoomState } from "@/site/lib/types";
import { useRun } from "@/site/hooks/use-run";
import { useSendChat } from "@/site/hooks/use-chat";
import { useAuth } from "@/site/hooks/use-auth";
import { useManifest } from "@/site/hooks/use-manifest";
import { useSetupRow } from "@/site/hooks/use-setups";
import { Page, usePage } from "@/site/components/layout";
import { Action, Tip } from "@/site/components/action";
import { StepAction } from "@/site/components/step-action";
import { EmptyState, ErrorLine, KeyValueStrip, NextStepBar, Section } from "@/site/components/page-parts";
import { PastGameRow } from "@/site/components/sheets";
import { Chat, SettingsList, UtilityFamilies, settingsSummary } from "@/site/components/game-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { nextStep } from "@/site/lib/next-step";
import { SetupPicker, setupTitle } from "@/site/components/setup-picker";
import { fmt, notFoundMsg, reload, transient } from "@/site/lib/errors";
import { fmtWhen, isoWhen } from "@/site/lib/time";
import { Bot, Copy, Crown, MoreHorizontal, User } from "lucide-react";
import type { GameRecord } from "@/site/lib/types";
import { canOpenGame, gamePath } from "@/site/lib/routes";

function Players({ room, meId, isOwner, minPlayers }: { room: RoomState; meId?: string; isOwner: boolean; minPlayers: number }) {
  const { act, manifest, run, unavailable } = usePage();
  const runner = useRun();
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(null), 5000); return () => clearTimeout(t); }, [armed]);
  const g = room.activeGame;
  const seated = (id: string) => !!g && g.roster.some(r => r.id === id);
  const players = room.members.filter(m => !m.spectator).length;
  const open = g ? 0 : Math.max(0, minPlayers - players);
  // Watch or play the next game (docs/unify-apps-plan.md §2): the member themselves, or the owner for any human.
  const canToggle = (m: RoomState["members"][number]) => m.kind === "human" && (m.id === meId || isOwner) && !(room.preparing && !room.preparing.error)
    && !(m.spectator && players >= (manifest?.maximumPlayers ?? 8));
  const role = (m: RoomState["members"][number]) => (m.spectator ? (g ? "watches the next game" : "spectator") : g ? "plays the next game" : "player");
  return (
    <Section title="Members" count={room.members.length} summary={`${players} playing`}>
      <ul className="divide-y">
        {room.members.map(m => (
          <li key={m.id} className="px-4 py-2.5 flex items-center gap-3" data-testid={`row-member-${m.id}`}>
            {m.kind === "ai" ? <Bot className="h-4 w-4 text-accent shrink-0" aria-label="AI player" /> : <User className="h-4 w-4 text-primary shrink-0" aria-label="Human player" />}
            <span className="flex-1 min-w-0 text-sm">
              <span className="block truncate">{m.name}{m.id === meId && <span className="text-muted-foreground"> (you)</span>}{m.id === room.ownerId && <Crown className="inline h-3.5 w-3.5 ml-1.5 text-accent" aria-label="room owner" />}</span>
              <span className="block text-xs text-muted-foreground" data-testid={`text-member-seat-${m.id}`}>
                {[m.id === room.ownerId ? "owner" : null, g && seated(m.id) ? "in the game" : g && m.kind === "human" ? `watching · ${role(m)}` : role(m),
                  m.kind === "ai" ? "AI player" : null, !g && m.ready ? "ready" : null, !g ? m.status ?? null : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            {canToggle(m) && (
              <button type="button" className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground shrink-0" data-testid={`button-spectator-${m.id}`}
                onClick={() => runner.run(m.spectator ? "Play the next game" : "Watch the next game", () => act.setSpectator(!m.spectator, m.id === meId ? undefined : m.id))}>
                {m.spectator ? (m.id === meId ? "Play" : "Seat as player") : (m.id === meId ? "Watch instead" : "Make spectator")}
              </button>
            )}
            {isOwner && m.kind === "ai" && !g && (
              <DropdownMenu onOpenChange={o => { if (!o) setArmed(null); }}>
                <Tip k="rooms.removeAi"><DropdownMenuTrigger asChild>
                  <button type="button" className="p-1 text-muted-foreground hover:text-foreground" aria-label={`Options for ${m.name}`} data-testid={`button-ai-menu-${m.id}`}><MoreHorizontal className="h-4 w-4" /></button>
                </DropdownMenuTrigger></Tip>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem data-testid={`button-remove-ai-${m.id}`} className={armed === m.id ? "text-destructive" : ""}
                    onSelect={e => { if (armed !== m.id) { e.preventDefault(); setArmed(m.id); return; } setArmed(null); runner.run("Remove an AI player", () => act.removeAi(m.id)); }}>
                    {armed === m.id ? "Select again to remove" : "Remove"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open-${i}`} className="px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-3"><span aria-hidden className="h-4 w-4 rounded-full border border-dashed" />
            <span className="flex-1">Open seat</span>
            {i === 0 && meId && room.members.some(m => m.id === meId) && (
              <button type="button" className="text-xs underline underline-offset-4 hover:text-foreground" onClick={() => run("ui.copyInviteLink")} data-testid="button-open-seat-invite">Copy invite link</button>
            )}
          </li>
        ))}
      </ul>
      {/* One plain button seats the default AI player; which AI (its model) is a choice behind the small link. */}
      {isOwner && !g && !unavailable("ui.addAiPlayer") && (
        <div className="border-t px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Action k="ui.addAiPlayer" label="+ Add AI player" tone="secondary" onClick={() => run("ui.addAiPlayer")} testId="button-add-ai" />
          <button type="button" className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground" onClick={() => run("rooms.addAi")} data-testid="button-choose-ai">Choose a model</button>
        </div>
      )}
      {isOwner && manifest?.aiFunding.configured === false && <p className="border-t px-4 py-2 text-xs text-muted-foreground">AI players are not set up on this server.</p>}
      {isOwner && manifest?.aiFunding.configured !== false && !room.aiEnabled && !g && open > 0 && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground" data-testid="text-ai-unavailable">AI players are not available in this room: invite people to fill the seats.</p>
      )}
    </Section>
  );
}

function NextGame({ room, isOwner }: { room: RoomState; isOwner: boolean }) {
  const { manifest, openSheet } = usePage();
  const current = useSetupRow(room.setup?.id).data ?? undefined;
  const frozen = room.activeGame;
  const configure = `/rooms/${room.shortCode}/configure`;
  const used = (room.aiInputTokens ?? 0) + (room.aiOutputTokens ?? 0);
  return (
    <Section title="Next game" testId="section-next-game">
      <div className="p-4 space-y-3">
        {isOwner ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex w-full sm:w-auto items-center gap-2 text-sm min-w-0">
              <span>Setup</span>
              <SetupPicker room={room} />
            </div>
            <Action k="ui.nav.configure" label="See all settings →" tone="link" href={configure} testId="link-configure" />
          </div>
        ) : (
          <p className="text-sm">This room plays: <span className="font-medium" data-testid="text-setup">{setupTitle(room)}</span>
            {" · "}<Action k="ui.nav.configure" label="See all settings →" tone="link" href={configure} testId="link-configure" /></p>
        )}
        {frozen && <p className="text-xs text-muted-foreground" data-testid="text-settings-frozen">Changes apply after game {frozen.shortCode} ends.</p>}
        <p className="text-sm text-muted-foreground" data-testid="text-next-game-summary">{current ? `${current.name}: ${current.summary}. ` : ""}{settingsSummary(room.settings, room.objectInstance)}</p>
        {/* Out of Details: creating a room asks nothing, so this line is where the owner finds the AI quotas (only in rooms run by an admin). */}
        {room.aiEnabled && (
          <p className="text-sm" data-testid="text-ai-quotas">
            AI players: {fmt(used)} of {fmt(room.aiQuota)} tokens · Assistant: {room.assistantQuota ? `${fmt(room.assistantQuota)} per player` : "off"}
            {isOwner && manifest?.aiFunding.configured !== false && <> · <button type="button" className="underline underline-offset-4" onClick={() => openSheet("ai-quotas")}
              data-testid="button-ai-quotas">Change</button></>}
          </p>
        )}
        <details className="text-sm" data-testid="details-next-game">
          <summary className="cursor-pointer select-none">Details</summary>
          <div className="mt-3 space-y-4">
            <SettingsList settings={room.settings} instance={room.objectInstance} />
            <UtilityFamilies catalog={catalogOf(room.utilityCatalog)} classes={manifest?.objectTypes.find(t => t.id === room.settings.objectType)?.classes} />
          </div>
        </details>
      </div>
    </Section>
  );
}

/**
 * The next game is preparing rule tables computed on demand (its first game on this shape on this server): progress,
 * the measured estimate, how the goals were dealt, or why it failed. The game page opens by itself when it starts.
 */
function Preparing({ preparing: p }: { preparing: NonNullable<RoomState["preparing"]> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const elapsed = Math.max(0, Math.round((now - p.startedAt) / 1000));
  // A split table is several pieces of computation (architecture.md §3.2): the bar follows them when there are more.
  const [done, of] = p.pieces ? [p.pieces.done, p.pieces.total] : [p.ready, p.total];
  const percent = of ? Math.round((100 * done) / of) : 0;
  return (
    <section className="border bg-card px-4 py-3 space-y-2 text-sm" data-testid="panel-preparing" aria-live="polite">
      {p.error ? (
        <p className="text-destructive" role="alert" data-testid="text-preparing-error">{p.error}</p>
      ) : (<>
        <p data-testid="text-preparing">
          The game is preparing its rule tables, <span data-testid="text-preparing-count">{p.ready} of {p.total}</span> ready
          {p.pieces && <> (<span data-testid="text-preparing-pieces">{p.pieces.done} of {p.pieces.total}</span> parts computed)</>}.
          {" "}<span className="text-muted-foreground">This is the first game on {p.instance} on this server (about {p.estimateSeconds} s; {elapsed} s so far). It starts by itself; later games on this shape start at once.</span>
        </p>
        <div className="h-1.5 bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={of} aria-valuenow={done} aria-label={p.pieces ? "Rule table parts computed" : "Rule tables ready"}>
          <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      </>)}
      {p.dealerNote && <p className="text-xs text-muted-foreground" data-testid="text-preparing-dealer">{p.dealerNote}.</p>}
    </section>
  );
}

/** The room's game in progress: its code and phase, the viewer's part in it and the link to its page. */
function ActiveGame({ room, meId }: { room: RoomState; meId?: string }) {
  const g = room.activeGame!;
  const part = !meId ? "" : g.roster.some(r => r.id === meId) ? "You play in it." : "You watch it.";
  return (
    <section className="border-2 border-primary bg-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="panel-active-game">
      <p className="text-sm flex-1 min-w-0">
        Game <span className="font-mono font-semibold" data-testid="text-active-game">{g.shortCode}</span> is {g.phase === "recovery" ? "paused for safety" : g.phase}. {part}
      </p>
      <Link href={gamePath(room.shortCode, g.shortCode)} className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold" data-testid="link-active-game">Open game {g.shortCode}</Link>
    </section>
  );
}

function RoomBody({ room, games }: { room: RoomState; games?: GameRecord[] }) {
  const { user } = useAuth();
  const { manifest, run, start } = usePage();
  const act = useRun();
  const sendChat = useSendChat(room.id);
  const isOwner = room.ownerId === user?.id;
  const isMember = room.members.some(m => m.id === user?.id);
  const minPlayers = manifest?.minimumPlayers ?? 3;
  const step = nextStep(user?.id, room, { minPlayers, maxPlayers: manifest?.maximumPlayers ?? 8, aiAvailable: manifest?.aiFunding.configured !== false && room.aiEnabled, start });
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-6">
      <header className="space-y-4 rise">
        <h1 className="font-display text-4xl md:text-5xl leading-none flex items-center gap-3">
          <span>Room <span data-testid="text-room-code">{room.shortCode}</span></span>
          <Tip k="ui.copyInviteLink"><button type="button" onClick={() => run("ui.copyInviteLink")} aria-label="Copy invite link" className="text-muted-foreground hover:text-foreground"><Copy className="h-5 w-5" /></button></Tip>
        </h1>
        <KeyValueStrip items={[
          { label: "Owner", value: <>{room.ownerName}{isOwner ? " (you)" : ""}</>, testId: "text-room-owner" },
          { label: "Created", value: <time dateTime={isoWhen(room.createdAt)}>{fmtWhen(room.createdAt)}</time>, testId: "text-room-created" },
        ]} />
        <NextStepBar status={step.status}
          primary={step.primary && <StepAction id={step.primary} primary roomCode={room.shortCode} gameCode={room.activeGame?.shortCode} />}
          secondary={step.secondary.map(id => <StepAction key={id} id={id} roomCode={room.shortCode} gameCode={room.activeGame?.shortCode} />)} />
      </header>
      {room.preparing && <Preparing preparing={room.preparing} />}
      {room.activeGame && <ActiveGame room={room} meId={user?.id} />}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Players room={room} meId={user?.id} isOwner={isOwner} minPlayers={minPlayers} />
        <Chat messages={room.chat} canPost={isMember} pending={act.pending} placeholder={isMember ? "Say something to everyone…" : "Join the room to chat"}
          onSend={(text, done) => act.run("chat", () => sendChat(text), done)} />
      </div>
      <NextGame room={room} isOwner={isOwner} />
      <Section title="Past games" count={games?.length ?? 0} collapsible defaultOpen testId="section-past-games"
        summary={games?.[0] ? `last: ${games[0].shortCode}` : undefined}>
        {!games?.length ? <EmptyState title="No games yet" body="Finished games and their winners appear here." /> : <ul className="divide-y">{games.map((g, i) => <PastGameRow key={g.id} g={g} roomCode={room.shortCode} canOpen={canOpenGame(g, i, { meId: user?.id, ownerId: room.ownerId, roomLive: !!room.activeGame })} />)}</ul>}
      </Section>
    </div>
  );
}

export default function Room() {
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const live = !!id && isAuthenticated;
  const q = useLive(api.rooms.get, live ? { room: id } : "skip");
  const room = q.data;
  const history = useLive(api.rooms.history, live && room ? { room: room.id } : "skip");
  const games = history.data?.filter((g): g is GameRecord => !!g);
  const manifest = useManifest().data;
  useEffect(() => {
    if (room && id !== room.shortCode) navigate(`/rooms/${room.shortCode}${window.location.search}${window.location.hash}`, { replace: true });
  }, [id, room?.shortCode, navigate]); // eslint-disable-line react-hooks/exhaustive-deps
  // Launch: take viewers to the new game, but never on first load (the status sentence covers that).
  const activeId = room?.activeGame?.id ?? null;
  const seenActive = useRef<{ room: string; game: string | null } | null>(null);
  useEffect(() => {
    if (!room) return;
    const prev = seenActive.current;
    seenActive.current = { room: room.id, game: activeId };
    if (!prev || prev.room !== room.id || prev.game === activeId) return;
    if (activeId && room.activeGame) navigate(gamePath(room.shortCode, room.activeGame.shortCode));
  }, [activeId, room, navigate]);
  useEffect(() => { document.title = `Room ${room?.shortCode ?? id} · Code Gods`; }, [room?.shortCode, id]);
  const code = room?.shortCode ?? id.toUpperCase();
  const step = room ? nextStep(user?.id, room, { minPlayers: manifest?.minimumPlayers, maxPlayers: manifest?.maximumPlayers, aiAvailable: manifest?.aiFunding.configured !== false && room.aiEnabled }) : null;

  return (
    <Page room={room ?? null} history={games} crumbs={[{ label: code }]} placeholder={`Search or do anything in ${code}`}
      suggested={step ? [step.primary, ...step.secondary].filter((s): s is NonNullable<typeof s> => !!s) : []} conn={room ? { ok: !q.error } : null}>
      {!isAuthenticated ? null
      : q.isLoading ? (
        <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-4"><Skeleton className="h-20 w-1/2" /><div className="grid lg:grid-cols-2 gap-4"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>
      ) : !room ? (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4">
          <ErrorLine message={notFoundMsg(q.error, "Room not found. Check the code, or ask the owner for the link.")} onRetry={transient(q.error) ? reload : undefined} />
          <Link href="/" className="underline underline-offset-4" data-testid="link-back">Your rooms</Link>
        </div>
      ) : <RoomBody room={room} games={games} />}
    </Page>
  );
}

