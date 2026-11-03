/**
 * Secondary surfaces reached from the palette and Details (palette-and-pages.md §3.3, onboarding §0, S3a):
 * the AI quotas sheet (where the owner sets the AI players' and the assistant's token quotas, from the room page's "Change"),
 * connected apps, scoring and past games.
 */
import { useState } from "react";
import { canOpenGame, gamePath } from "@/site/lib/routes";
import { Link } from "wouter";
import { useMutation } from "convex/react";
import { HowScoringWorks, objectNoun } from "@workspace/object-views";
import { ROOM_QUOTA_DOCS } from "@workspace/game-core";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorLine } from "@/site/components/page-parts";
import { useRun } from "@/site/hooks/use-run";
import { api, useLive } from "@/site/lib/convex";
import { errMsg, fmt } from "@/site/lib/errors";
import { kindLabel } from "@/site/lib/device-approval";
import { endReasonLabel, fmtDuration, fmtWhen, isoWhen, toMs } from "@/site/lib/time";
import type { Credential, GameRecord, Manifest, RoomState } from "@/site/lib/types";

export type AiModelInfo = NonNullable<Manifest["aiFunding"]["models"]>[number];

/** "Up to about $0.40 per player per game at Claude Sonnet 5.5 rates", from the model's input price. */
export function costLine(tokens: number, model: AiModelInfo | undefined, per: string): string {
  if (!model?.inputUsdPerMillion || !Number.isFinite(tokens) || tokens <= 0) return "Separate dollar caps of $2 per game and $5 per day always apply.";
  const usd = (tokens * model.inputUsdPerMillion) / 1e6;
  return `Up to about $${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)} ${per} at ${model.label} rates; dollar caps of $2 per game and $5 per day always apply.`;
}

const field = "w-full min-w-0 border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-primary";
const whole = (raw: string, max: number) => { const v = Number(raw); return raw.trim() !== "" && Number.isInteger(v) && v >= 0 && v <= max ? v : null; };

/** The room's AI quotas: the AI players' token pool per game and the assistant's tokens per player per game (changeable any time). */
export function AiQuotasSheet({ room, manifest, open, onOpenChange }: { room: RoomState; manifest?: Manifest; open: boolean; onOpenChange(o: boolean): void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-ai-quotas">
        <SheetHeader>
          <SheetTitle>AI quotas</SheetTitle>
          <SheetDescription>Tokens are billed to the server owner's provider accounts. Dollar caps of $2 per game and $5 per day always apply.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-8">
          {manifest?.aiFunding.configured === false ? <p className="text-sm text-muted-foreground">AI players and assistants are not set up on this server.</p>
            : <AiQuotasForm room={room} manifest={manifest} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AiQuotasForm({ room, manifest }: { room: RoomState; manifest?: Manifest }) {
  const setQuotas = useMutation(api.rooms.setAiQuotas);
  const act = useRun();
  const q = manifest?.aiFunding.quotas;
  const aiMax = q?.aiMax ?? 1_000_000;
  const assistantMax = q?.assistantMax ?? 2_000_000;
  const models = manifest?.aiFunding.models ?? [];
  const [aiTokens, setAiTokens] = useState(String(room.aiQuota));
  const [tokens, setTokens] = useState(String(room.assistantQuota));
  const [model, setModel] = useState(room.assistantModel);
  const a = whole(aiTokens, aiMax);
  const t = whole(tokens, assistantMax);
  const used = (room.aiInputTokens ?? 0) + (room.aiOutputTokens ?? 0);
  return (
    <section className="space-y-3" data-testid="ai-quotas">
      <h3 className="font-medium">AI players</h3>
      <p className="text-sm text-muted-foreground">{ROOM_QUOTA_DOCS.aiQuota.meaning} {ROOM_QUOTA_DOCS.aiQuota.consequence}</p>
      {manifest?.aiFunding.mock && <p className="text-sm text-accent" data-testid="text-ai-mock">Development server: AI players play scripted moves and nothing is billed.</p>}
      <p className="text-sm" data-testid="text-ai-usage">{fmt(used)} / {fmt(room.aiQuota)} used</p>
      <div className="h-1.5 bg-muted overflow-hidden"><div className="h-full bg-accent origin-left" style={{ transform: `scaleX(${room.aiQuota ? Math.min(1, used / room.aiQuota) : 0})` }} /></div>
      <label className="block text-sm space-y-1"><span>Tokens per game for all AI players (0 for none)</span>
        <input type="number" min={0} max={aiMax} step={1000} value={aiTokens} onChange={e => setAiTokens(e.target.value)} className={field} data-testid="input-ai-quota" /></label>
      {a === null && <p role="alert" className="text-xs text-destructive">Enter a whole number from 0 to {fmt(aiMax)} tokens.</p>}
      <h3 className="font-medium pt-2">Assistant <span className="text-sm font-normal text-muted-foreground" data-testid="text-assistant-quota">{room.assistantQuota ? `${fmt(room.assistantQuota)} tokens per player per game` : "off"}</span></h3>
      <p className="text-sm text-muted-foreground">{ROOM_QUOTA_DOCS.assistantQuota.meaning}</p>
      <label className="block text-sm space-y-1"><span>Tokens per player per game (0 turns it off)</span>
        <input type="number" min={0} max={assistantMax} step={1000} value={tokens} onChange={e => setTokens(e.target.value)} className={field} data-testid="input-assistant-quota" /></label>
      {t === null && <p role="alert" className="text-xs text-destructive">Enter a whole number from 0 to {fmt(assistantMax)} tokens.</p>}
      <label className="block text-sm space-y-1"><span>Model</span>
        <select value={model} onChange={e => setModel(e.target.value)} className={field} data-testid="select-assistant-model">
          {(models.length ? models : [{ id: room.assistantModel, label: room.assistantModel, configured: true }]).map(m => (
            <option key={m.id} value={m.id} disabled={!m.configured}>{m.label}{m.configured ? "" : " (not set up on this server)"}</option>
          ))}
        </select></label>
      <p className="text-xs text-muted-foreground">{costLine(t ?? 0, models.find(m => m.id === model), "per player per game")}</p>
      <button type="button" disabled={a === null || t === null || act.pending} onClick={() => act.run("AI quotas", () => setQuotas({ roomId: room.id, aiQuota: a!, assistantQuota: t!, assistantModel: model }))}
        className="w-full border py-2 text-sm hover:bg-muted disabled:opacity-40" data-testid="button-save-ai-quotas">Save AI quotas</button>
    </section>
  );
}

/** Every app, connector and assistant acting as you, revocable at once (was "Your player apps"). */
export function ConnectedAppsSheet({ open, onOpenChange, roomCode }: { open: boolean; onOpenChange(o: boolean): void; roomCode?: string }) {
  const creds = useLive(api.auth.credentials.list, open ? {} : "skip");
  const revoke = useMutation(api.auth.credentials.revoke);
  const act = useRun();
  const [armed, setArmed] = useState<string | null>(null);
  const row = (c: Credential) => (
    <li key={c.credentialId} className="py-3 flex items-start gap-3 text-sm" data-testid={`row-credential-${c.credentialId}`}>
      <span className="flex-1 min-w-0">
        <span className="block break-words">{c.label || "Unlabelled app"} <span className="text-muted-foreground">(self-reported)</span></span>
        <span className="block text-xs text-muted-foreground">{kindLabel(c.kind)} · {c.permission === "account" ? "acts as you in every room" : <>{c.permission} · room {c.roomCode ?? "gone"}</>} · expires {fmtWhen(c.expiresAt)}</span>
        <span className="block text-xs text-muted-foreground">{c.lastUsedAt ? `last used ${fmtWhen(c.lastUsedAt)}` : "never used"}</span>
      </span>
      <button type="button" disabled={act.pending} data-testid={`button-revoke-${c.credentialId}`}
        onClick={() => { if (armed !== c.credentialId) { setArmed(c.credentialId); return; } setArmed(null); act.run("revoke", () => revoke({ credentialId: c.credentialId })); }}
        className="border border-destructive/50 text-destructive px-2.5 py-1 text-xs hover:bg-destructive/5 disabled:opacity-40">{armed === c.credentialId ? "Click again to revoke" : "Revoke"}</button>
    </li>
  );
  return (
    <Sheet open={open} onOpenChange={o => { setArmed(null); onOpenChange(o); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="panel-player-apps">
        <SheetHeader>
          <SheetTitle>Connected apps</SheetTitle>
          <SheetDescription>Every player app, connector and assistant that acts as you. Revoking cuts access on its next call.</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {creds.isLoading && <Skeleton className="h-10 w-full" />}
          {creds.error && <ErrorLine message={errMsg(creds.error)} />}
          {creds.data && creds.data.length === 0 && <EmptyState title="No connected apps" body={<>Connect one with “Connect a player app…” in the menu{roomCode ? <> or <code className="font-mono text-xs" data-testid="text-connect-command">pnpm player connect --room {roomCode}</code></> : null}.</>} testId="text-no-credentials" />}
          {!!creds.data?.length && <ul className="divide-y" data-testid="list-credentials">{creds.data.map(row)}</ul>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ScoringSheet({ open, onOpenChange, objectType }: { open: boolean; onOpenChange(o: boolean): void; objectType?: string }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>How scoring works</SheetTitle><SheetDescription>Points come from rare objects that the other players also care about.</SheetDescription></SheetHeader>
        <div className="mt-4"><HowScoringWorks noun={objectNoun(objectType)} open /></div>
      </SheetContent>
    </Sheet>
  );
}

/** One finished game: code, date, length, how it ended and who won. */
/** `canOpen`: whether the viewer may open its page (lib/routes canOpenGame); otherwise the code is shown without a link. */
export function PastGameRow({ g, roomCode, canOpen = true }: { g: GameRecord; roomCode?: string | null; canOpen?: boolean }) {
  return (
    <li className="px-4 py-3 space-y-1" data-testid={`row-game-${g.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        {canOpen && roomCode
          ? <Link href={gamePath(roomCode, g.shortCode)} className="font-mono font-semibold underline underline-offset-4" data-testid={`link-game-${g.shortCode}`}>{g.shortCode}</Link>
          : <span className="font-mono font-semibold text-muted-foreground" title="Only the gods who played in it or watched it, and the room owner, can open it" data-testid={`text-game-${g.shortCode}`}>{g.shortCode}</span>}
        <time dateTime={isoWhen(g.startedAt)}>{fmtWhen(g.startedAt)}</time>
        {g.endedAt !== null && <span className="text-muted-foreground">{fmtDuration(toMs(g.endedAt) - toMs(g.startedAt))}</span>}
        <span className="text-muted-foreground">{endReasonLabel(g.endReason)}</span>
      </div>
      <p className="text-sm" data-testid={`text-game-winners-${g.id}`}>{g.winners.length ? `Won by ${g.winners.map(w => w.name).join(", ")}${g.winners.length > 1 ? " (tie)" : ""}` : "No winner recorded"}</p>
    </li>
  );
}

export function PastGamesSheet({ open, onOpenChange, games, roomCode, viewer }: { open: boolean; onOpenChange(o: boolean): void; games?: readonly GameRecord[]; roomCode?: string | null; viewer: Parameters<typeof canOpenGame>[2] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Past games</SheetTitle><SheetDescription>Finished games of this room, newest first.</SheetDescription></SheetHeader>
        {!games?.length ? <EmptyState title="No games yet" body="Finished games and their winners appear here." /> : <ul className="mt-4 divide-y -mx-4">{games.map((g, i) => <PastGameRow key={g.id} g={g} roomCode={roomCode} canOpen={canOpenGame(g, i, viewer)} />)}</ul>}
      </SheetContent>
    </Sheet>
  );
}
