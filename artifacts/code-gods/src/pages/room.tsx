/**
 * The room page (palette-and-pages.md §3.3): the room's code, owner and creation date; one status sentence and one
 * filled button from nextStep; then Players, Public chat, Next game (the Setup select and "New configuration →")
 * and Past games, collapsed. Everything else is in the palette.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { api, useLive } from "@/lib/convex";
import { catalogOf, type RoomState } from "@/lib/types";
import { useRun } from "@/hooks/use-run";
import { useSendChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { useManifest } from "@/hooks/use-manifest";
import { Page, usePage } from "@/components/layout";
import { Action, Tip } from "@/components/action";
import { StepAction } from "@/components/step-action";
import { EmptyState, ErrorLine, KeyValueStrip, NextStepBar, Section } from "@/components/page-parts";
import { PastGameRow } from "@/components/sheets";
import { Chat, SettingsList, UtilityFamilies, settingsSummary } from "@/components/game-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { nextStep } from "@/lib/next-step";
import { matchPreset } from "@/lib/settings-form";
import { errMsg, fmt } from "@/lib/errors";
import { fmtWhen, isoWhen } from "@/lib/time";
import { Bot, Copy, Crown, MoreHorizontal, User } from "lucide-react";
import type { GameRecord } from "@/lib/types";

function Players({ room, meId, isOwner, minPlayers }: { room: RoomState; meId?: string; isOwner: boolean; minPlayers: number }) {
  const { act, manifest } = usePage();
  const runner = useRun();
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(null), 5000); return () => clearTimeout(t); }, [armed]);
  const g = room.activeGame;
  const seated = (id: string) => !!g && g.roster.some(r => r.id === id);
  const open = g ? 0 : Math.max(0, minPlayers - room.members.length);
  return (
    <Section title="Players" count={room.members.length}>
      <ul className="divide-y">
        {room.members.map(m => (
          <li key={m.id} className="px-4 py-2.5 flex items-center gap-3" data-testid={`row-member-${m.id}`}>
            {m.kind === "ai" ? <Bot className="h-4 w-4 text-accent shrink-0" aria-label="AI player" /> : <User className="h-4 w-4 text-primary shrink-0" aria-label="Human player" />}
            <span className="flex-1 min-w-0 text-sm">
              <span className="block truncate">{m.name}{m.id === meId && <span className="text-muted-foreground"> (you)</span>}{m.id === room.ownerId && <Crown className="inline h-3.5 w-3.5 ml-1.5 text-accent" aria-label="room owner" />}</span>
              <span className="block text-xs text-muted-foreground" data-testid={`text-member-seat-${m.id}`}>
                {g ? (seated(m.id) ? "in the game" : "plays the next game") : [m.id === room.ownerId ? "owner" : m.kind === "ai" ? `AI · ${m.model ?? m.provider ?? ""}` : null, m.ready ? "ready" : null, m.status ?? null].filter(Boolean).join(" · ")}
              </span>
            </span>
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
          <li key={`open-${i}`} className="px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-3"><span aria-hidden className="h-4 w-4 rounded-full border border-dashed" />waiting for a player…</li>
        ))}
      </ul>
      {isOwner && manifest?.aiFunding.configured === false && <p className="border-t px-4 py-2 text-xs text-muted-foreground">AI players are not set up on this server.</p>}
    </Section>
  );
}

const SETUP_NEW = "__new", SETUP_CUSTOM = "__custom";

function NextGame({ room, isOwner }: { room: RoomState; isOwner: boolean }) {
  const { act, manifest, openSheet } = usePage();
  const [, navigate] = useLocation();
  const runner = useRun();
  const presets = manifest?.presets ?? [];
  // The room records the preset it was set from; matching the settings covers rooms from before that record existed.
  const origin = room.settingsOrigin;
  const current = origin ? (origin.kind === "preset" && !origin.modified ? presets.find(p => p.id === origin.id) : undefined) : matchPreset(room.settings, presets);
  const frozen = room.activeGame;
  const configure = `/rooms/${room.shortCode}/configure`;
  const used = (room.aiInputTokens ?? 0) + (room.aiOutputTokens ?? 0);
  const value = current?.id ?? SETUP_CUSTOM;
  return (
    <Section title="Next game" testId="section-next-game">
      <div className="p-4 space-y-3">
        {isOwner ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm min-w-0">
              <span>Setup</span>
              <select value={value} disabled={!!frozen || runner.pending || !presets.length} data-testid="select-setup"
                onChange={e => {
                  const v = e.target.value;
                  if (v === SETUP_NEW) navigate(configure);
                  else if (v !== SETUP_CUSTOM) runner.run("Choose the next game's setup", () => act.applyPreset(v));
                }}
                className="min-w-0 max-w-[22rem] border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-50">
                {!presets.length && <option value={value}>Loading…</option>}
                <optgroup label="Recommended">
                  {presets.map(p => <option key={p.id} value={p.id} disabled={!p.offered}>{p.label}: {p.kid}{p.offered ? "" : " (not on this server yet)"}</option>)}
                </optgroup>
                {!current && <option value={SETUP_CUSTOM}>Current (custom)</option>}
                <option disabled value="">──────────</option>
                <option value={SETUP_NEW}>New configuration…</option>
              </select>
            </label>
            <Action k="ui.nav.newConfiguration" label="New configuration →" tone="link" href={configure} testId="link-new-configuration" />
          </div>
        ) : (
          <p className="text-sm">This room plays: <span className="font-medium" data-testid="text-setup">{current?.label ?? "a custom setup"}</span>
            {" · "}<Action k="ui.nav.newConfiguration" label="See all settings →" tone="link" href={configure} testId="link-new-configuration" /></p>
        )}
        {frozen && <p className="text-xs text-muted-foreground" data-testid="text-settings-frozen">Changes apply after game {frozen.shortCode} ends.</p>}
        <p className="text-sm text-muted-foreground" data-testid="text-next-game-summary">{current ? `${current.kid}. ` : ""}{settingsSummary(room.settings, room.objectInstance)}</p>
        <details className="text-sm" data-testid="details-next-game">
          <summary className="cursor-pointer select-none">Details</summary>
          <div className="mt-3 space-y-4">
            <SettingsList settings={room.settings} instance={room.objectInstance} />
            <p className="text-sm" data-testid="text-ai-spending">
              AI players: {fmt(used)} of {fmt(room.aiBudget)} tokens · Assistant: {room.assistantBudget ? `${fmt(room.assistantBudget)} per player` : "off"}
              {isOwner && <> · <button type="button" className="underline underline-offset-4" onClick={() => openSheet("ai-spending")} data-testid="button-ai-spending">Change</button></>}
            </p>
            <UtilityFamilies catalog={catalogOf(room.utilityCatalog)} classes={manifest?.objectTypes.find(t => t.id === room.settings.objectType)?.classes} />
          </div>
        </details>
      </div>
    </Section>
  );
}

function RoomBody({ room, games }: { room: RoomState; games?: GameRecord[] }) {
  const { user } = useAuth();
  const { manifest, run } = usePage();
  const act = useRun();
  const sendChat = useSendChat(room.id);
  const isOwner = room.ownerId === user?.id;
  const isMember = room.members.some(m => m.id === user?.id);
  const minPlayers = manifest?.minimumPlayers ?? 3;
  const step = nextStep(user?.id, room, { minPlayers, maxPlayers: manifest?.maximumPlayers ?? 8, aiAvailable: manifest?.aiFunding.configured !== false });
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
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Players room={room} meId={user?.id} isOwner={isOwner} minPlayers={minPlayers} />
        <Chat messages={room.chat} canPost={isMember} pending={act.pending} placeholder={isMember ? "Say something to everyone…" : "Join the room to chat"}
          onSend={(text, done) => act.run("chat", () => sendChat(text), done)} />
      </div>
      <NextGame room={room} isOwner={isOwner} />
      <Section title="Past games" count={games?.length ?? 0} collapsible defaultOpen={false} testId="section-past-games"
        summary={games?.[0] ? `last: ${games[0].shortCode}` : undefined}>
        {!games?.length ? <EmptyState title="No games yet" body="Finished games and their winners appear here." /> : <ul className="divide-y">{games.map(g => <PastGameRow key={g.id} g={g} />)}</ul>}
      </Section>
    </div>
  );
}

export default function Room() {
  const { id = "" } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const requestedGame = new URLSearchParams(useSearch()).get("game");
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const live = !!id && isAuthenticated && !requestedGame;
  const q = useLive(api.rooms.get, live ? { room: id } : "skip");
  const room = q.data;
  const history = useLive(api.rooms.history, live && room ? { room: room.id } : "skip");
  const games = history.data?.filter((g): g is GameRecord => !!g);
  const manifest = useManifest().data;
  // Legacy links: /rooms/:id?game=CODE now belong to the game's own page.
  useEffect(() => { if (requestedGame) navigate(`/games/${encodeURIComponent(requestedGame)}`, { replace: true }); }, [requestedGame, navigate]);
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
    if (activeId && room.activeGame) navigate(`/games/${room.activeGame.shortCode}`);
  }, [activeId, room, navigate]);
  useEffect(() => { document.title = `Room ${room?.shortCode ?? id} · Code Gods`; }, [room?.shortCode, id]);
  const code = room?.shortCode ?? id.toUpperCase();
  const step = room ? nextStep(user?.id, room, { minPlayers: manifest?.minimumPlayers, maxPlayers: manifest?.maximumPlayers, aiAvailable: manifest?.aiFunding.configured !== false }) : null;

  return (
    <Page room={room ?? null} history={games} crumbs={[{ label: code }]} placeholder={`Search or do anything in ${code}`}
      suggested={step ? [step.primary, ...step.secondary].filter((s): s is NonNullable<typeof s> => !!s) : []} conn={room ? { ok: !q.error } : null}>
      {requestedGame ? <p className="mx-auto max-w-lg px-4 py-20" role="status" data-testid="status-legacy-redirect">Opening game {requestedGame}…</p>
      : authLoading ? null : !isAuthenticated ? <Invited code={code} />
      : q.isLoading ? (
        <div className="mx-auto max-w-[1200px] px-6 py-8 space-y-4"><Skeleton className="h-20 w-1/2" /><div className="grid lg:grid-cols-2 gap-4"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>
      ) : !room ? (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4">
          <ErrorLine message={q.error ? errMsg(q.error) : "Room not found. Check the code, or ask the owner for the link."} />
          <Link href="/" className="underline underline-offset-4" data-testid="link-back">Your rooms</Link>
        </div>
      ) : <RoomBody room={room} games={games} />}
    </Page>
  );
}

function Invited({ code }: { code: string }) {
  const { run } = usePage();
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center rise space-y-4">
      <h1 className="font-display text-5xl">Room {code}</h1>
      <p className="text-muted-foreground" data-testid="text-viewer-seat">You were invited to room {code}. Sign in to see who is here and take a seat.</p>
      <Action k="ui.auth.signIn" tone="primary" onClick={() => run("ui.auth.signIn")} testId="button-login-room" />
    </div>
  );
}
