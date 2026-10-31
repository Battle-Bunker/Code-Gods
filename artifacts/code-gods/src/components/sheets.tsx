/**
 * Secondary surfaces reached from the palette and Details (palette-and-pages.md §3.3, onboarding §0, S2a/S3a):
 * the AI spending sheet, connected apps, scoring, past games; the room-creation "turn on the assistant" dialog and
 * the AI budget approval that comes with the first AI player. Spending approvals always keep their consent text and
 * checkbox here; the palette never approves money.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "convex/react";
import { HowScoringWorks, objectNoun } from "@workspace/object-views";
import { ROOM_BUDGET_DOCS } from "@workspace/game-core";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorLine } from "@/components/page-parts";
import { useRun } from "@/hooks/use-run";
import { api, useLive } from "@/lib/convex";
import { errMsg, fmt } from "@/lib/errors";
import { kindLabel } from "@/lib/device-approval";
import { endReasonLabel, fmtDuration, fmtWhen, isoWhen, toMs } from "@/lib/time";
import type { Credential, GameRecord, Manifest, RoomState } from "@/lib/types";

export const DEFAULT_ASSISTANT_TOKENS = 200_000;
export const DEFAULT_AI_TOKENS = 300_000;
export type AiModelInfo = NonNullable<Manifest["aiFunding"]["models"]>[number];

/** "Up to about $0.40 per player per game at Claude Sonnet 5.5 rates", from the model's input price. */
export function costLine(tokens: number, model: AiModelInfo | undefined, per: string): string {
  if (!model?.inputUsdPerMillion || !Number.isFinite(tokens) || tokens <= 0) return "Separate dollar caps of $2 per game and $5 per day always apply.";
  const usd = (tokens * model.inputUsdPerMillion) / 1e6;
  return `Up to about $${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)} ${per} at ${model.label} rates; dollar caps of $2 per game and $5 per day always apply.`;
}

const field = "w-full min-w-0 border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-primary";
const whole = (raw: string, max: number) => { const v = Number(raw); return raw.trim() !== "" && Number.isInteger(v) && v >= 0 && v <= max ? v : null; };

/** The room's spending: the AI players' token budget (frozen during games) and the assistant allowance per player. */
export function AiSpendingSheet({ room, manifest, open, onOpenChange }: { room: RoomState; manifest?: Manifest; open: boolean; onOpenChange(o: boolean): void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="sheet-ai-spending">
        <SheetHeader>
          <SheetTitle>AI spending</SheetTitle>
          <SheetDescription>Tokens are billed to the server owner's provider accounts. Every change needs your explicit approval.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-8">
          {manifest?.aiFunding.configured === false ? <p className="text-sm text-muted-foreground">AI players and assistants are not set up on this server.</p> : (<>
            <AiBudgetForm room={room} manifest={manifest} />
            <AssistantForm room={room} manifest={manifest} />
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AiBudgetForm({ room, manifest }: { room: RoomState; manifest?: Manifest }) {
  const approve = useMutation(api.rooms.approveAiBudget);
  const act = useRun();
  const [budget, setBudget] = useState(String(room.aiBudget || DEFAULT_AI_TOKENS));
  const [agree, setAgree] = useState(false);
  const b = whole(budget, 1_000_000);
  const used = (room.aiInputTokens ?? 0) + (room.aiOutputTokens ?? 0);
  const frozen = !!room.activeGame;
  return (
    <section className="space-y-3" data-testid="ai-funding-status">
      <h3 className="font-medium">AI players</h3>
      <p className="text-sm text-muted-foreground">{ROOM_BUDGET_DOCS.aiBudget.meaning} {ROOM_BUDGET_DOCS.aiBudget.consequence}</p>
      {manifest?.aiFunding.mock && <p className="text-sm text-accent" data-testid="text-ai-mock">Development server: AI players play scripted moves and nothing is billed.</p>}
      <p className="text-sm" data-testid="text-ai-usage">{fmt(used)} / {fmt(room.aiBudget)} used</p>
      <div className="h-1.5 bg-muted overflow-hidden"><div className="h-full bg-accent origin-left" style={{ transform: `scaleX(${room.aiBudget ? Math.min(1, used / room.aiBudget) : 0})` }} /></div>
      <label className="block text-sm space-y-1"><span>Tokens per game for all AI players</span>
        <input type="number" min={0} max={1_000_000} step={1000} value={budget} disabled={frozen} onChange={e => { setBudget(e.target.value); setAgree(false); }} className={field} data-testid="input-ai-budget" /></label>
      {b === null && <p role="alert" className="text-xs text-destructive">Enter a whole number from 0 to 1,000,000 tokens.</p>}
      {frozen && <p className="text-xs text-muted-foreground">The AI budget can change after game {room.activeGame?.shortCode} ends.</p>}
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={agree} disabled={frozen} onChange={e => setAgree(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-approve-budget" />
        I approve AI players in this room using up to {b !== null ? fmt(b) : "?"} tokens per game, billed to the server owner's provider accounts.
      </label>
      <button type="button" disabled={b === null || !agree || act.pending || frozen} onClick={() => act.run("AI budget", () => approve({ roomId: room.id, aiBudget: b! }), () => setAgree(false))}
        className="w-full border py-2 text-sm hover:bg-muted disabled:opacity-40" data-testid="button-save-budget">Approve AI budget</button>
    </section>
  );
}

function AssistantForm({ room, manifest }: { room: RoomState; manifest?: Manifest }) {
  const approve = useMutation(api.rooms.approveAiBudget);
  const act = useRun();
  const max = manifest?.aiFunding.assistantBudgetMax ?? 2_000_000;
  const models = manifest?.aiFunding.models ?? [];
  const [tokens, setTokens] = useState(String(room.assistantBudget || DEFAULT_ASSISTANT_TOKENS));
  const [model, setModel] = useState(room.assistantModel);
  const [agree, setAgree] = useState(false);
  const t = whole(tokens, max);
  return (
    <section className="space-y-3" data-testid="assistant-budget">
      <h3 className="font-medium">Assistant <span className="text-sm font-normal text-muted-foreground" data-testid="text-assistant-budget">{room.assistantBudget ? `${fmt(room.assistantBudget)} tokens per player per game` : "off"}</span></h3>
      <p className="text-sm text-muted-foreground">{ROOM_BUDGET_DOCS.assistantBudget.meaning}</p>
      <label className="block text-sm space-y-1"><span>Tokens per player per game (0 turns it off)</span>
        <input type="number" min={0} max={max} step={1000} value={tokens} onChange={e => { setTokens(e.target.value); setAgree(false); }} className={field} data-testid="input-assistant-budget" /></label>
      {t === null && <p role="alert" className="text-xs text-destructive">Enter a whole number from 0 to {fmt(max)} tokens.</p>}
      <label className="block text-sm space-y-1"><span>Model</span>
        <select value={model} onChange={e => { setModel(e.target.value); setAgree(false); }} className={field} data-testid="select-assistant-model">
          {(models.length ? models : [{ id: room.assistantModel, label: room.assistantModel, configured: true }]).map(m => (
            <option key={m.id} value={m.id} disabled={!m.configured}>{m.label}{m.configured ? "" : " (not set up on this server)"}</option>
          ))}
        </select></label>
      <p className="text-xs text-muted-foreground">{costLine(t ?? 0, models.find(m => m.id === model), "per player per game")}</p>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-approve-assistant" />
        I approve each player's assistant in this room using up to {t !== null ? fmt(t) : "?"} tokens per game, billed to the server owner's provider accounts.
      </label>
      <button type="button" disabled={t === null || !agree || act.pending} onClick={() => act.run("assistant allowance", () => approve({ roomId: room.id, aiBudget: room.aiBudget, assistantBudget: t!, assistantModel: model }), () => setAgree(false))}
        className="w-full border py-2 text-sm hover:bg-muted disabled:opacity-40" data-testid="button-save-assistant-budget">Approve assistant allowance</button>
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
        <span className="block text-xs text-muted-foreground">{kindLabel(c.kind)} · {c.permission} · room {c.roomCode ?? "gone"} · expires {fmtWhen(c.expiresAt)}</span>
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
export function PastGameRow({ g }: { g: GameRecord }) {
  return (
    <li className="px-4 py-3 space-y-1" data-testid={`row-game-${g.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <Link href={`/games/${g.shortCode}`} className="font-mono font-semibold underline underline-offset-4" data-testid={`link-game-${g.shortCode}`}>{g.shortCode}</Link>
        <time dateTime={isoWhen(g.startedAt)}>{fmtWhen(g.startedAt)}</time>
        {g.endedAt !== null && <span className="text-muted-foreground">{fmtDuration(toMs(g.endedAt) - toMs(g.startedAt))}</span>}
        <span className="text-muted-foreground">{endReasonLabel(g.endReason)}</span>
      </div>
      <p className="text-sm" data-testid={`text-game-winners-${g.id}`}>{g.winners.length ? `Won by ${g.winners.map(w => w.name).join(", ")}${g.winners.length > 1 ? " (tie)" : ""}` : "No winner recorded"}</p>
    </li>
  );
}

export function PastGamesSheet({ open, onOpenChange, games }: { open: boolean; onOpenChange(o: boolean): void; games?: readonly GameRecord[] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Past games</SheetTitle><SheetDescription>Finished games of this room, newest first.</SheetDescription></SheetHeader>
        {!games?.length ? <EmptyState title="No games yet" body="Finished games and their winners appear here." /> : <ul className="mt-4 divide-y -mx-4">{games.map(g => <PastGameRow key={g.id} g={g} />)}</ul>}
      </SheetContent>
    </Sheet>
  );
}

/**
 * S2a: right after "Create room", once: turn on the assistant for everyone in the room, pre-filled, with the cost and
 * a consent checkbox. "Not now" keeps it off (0 tokens).
 */
export function CreateRoomDialog({ open, onOpenChange, manifest, pending, onCreate }: {
  open: boolean; onOpenChange(o: boolean): void; manifest?: Manifest; pending: boolean;
  onCreate(assistant: { assistantBudget: number; assistantModel: string } | null): void;
}) {
  const models = (manifest?.aiFunding.models ?? []).filter(m => m.configured);
  const [tokens, setTokens] = useState(String(DEFAULT_ASSISTANT_TOKENS));
  const [model, setModel] = useState(models[0]?.id ?? manifest?.aiFunding.model ?? "claude-sonnet-5-5");
  const [agree, setAgree] = useState(false);
  const max = manifest?.aiFunding.assistantBudgetMax ?? 2_000_000;
  const t = whole(tokens, max);
  const chosen = models.find(m => m.id === model) ?? models[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-create-room">
        <DialogHeader>
          <DialogTitle>Turn on the assistant for everyone in this room</DialogTitle>
          <DialogDescription>Each player gets their own assistant in the player client: it explains the game, writes agents and drafts messages.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1"><span>Tokens per player per game</span>
            <input type="number" min={0} max={max} step={1000} value={tokens} onChange={e => { setTokens(e.target.value); setAgree(false); }} className={field} data-testid="input-create-assistant-budget" /></label>
          {t === null && <p role="alert" className="text-xs text-destructive">Enter a whole number from 0 to {fmt(max)} tokens.</p>}
          <label className="block space-y-1"><span>Model</span>
            <select value={chosen?.id ?? model} onChange={e => { setModel(e.target.value); setAgree(false); }} className={field} data-testid="select-create-assistant-model">
              {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select></label>
          <p className="text-xs text-muted-foreground" data-testid="text-create-cost">{costLine(t ?? 0, chosen, "per player per game")}</p>
          <label className="flex items-start gap-2 text-muted-foreground">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-create-assistant" />
            I approve each player's assistant in this room using up to {t !== null ? fmt(t) : "?"} tokens per game, billed to the server owner's provider accounts.
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <button type="button" disabled={pending} onClick={() => onCreate(null)} className="px-3 py-2 text-sm underline underline-offset-4 disabled:opacity-40" data-testid="button-assistant-not-now">Not now</button>
          <button type="button" disabled={pending || t === null || !agree || !chosen} onClick={() => onCreate({ assistantBudget: t!, assistantModel: chosen!.id })}
            className="bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-40" data-testid="button-assistant-turn-on">{pending ? "Creating…" : "Turn on"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** S3a: the first AI player needs an AI budget; approve it (pre-filled) and seat the player in one step. */
export function AiBudgetDialog({ open, onOpenChange, templateName, pending, onApprove }: {
  open: boolean; onOpenChange(o: boolean): void; templateName?: string; pending: boolean; onApprove(tokens: number): void;
}) {
  const [tokens, setTokens] = useState(String(DEFAULT_AI_TOKENS));
  const [agree, setAgree] = useState(false);
  const t = whole(tokens, 1_000_000);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-ai-budget">
        <DialogHeader>
          <DialogTitle>Approve AI play</DialogTitle>
          <DialogDescription>{templateName ? `${templateName} needs` : "AI players need"} a token budget for each game. {ROOM_BUDGET_DOCS.aiBudget.consequence}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1"><span>Tokens per game for all AI players</span>
            <input type="number" min={1} max={1_000_000} step={1000} value={tokens} onChange={e => { setTokens(e.target.value); setAgree(false); }} className={field} data-testid="input-dialog-ai-budget" /></label>
          {(t === null || t === 0) && <p role="alert" className="text-xs text-destructive">Enter a whole number from 1 to 1,000,000 tokens.</p>}
          <label className="flex items-start gap-2 text-muted-foreground">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-dialog-ai-budget" />
            I approve AI players in this room using up to {t ? fmt(t) : "?"} tokens per game, billed to the server owner's provider accounts.
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <button type="button" onClick={() => onOpenChange(false)} className="px-3 py-2 text-sm underline underline-offset-4">Cancel</button>
          <button type="button" disabled={pending || !t || !agree} onClick={() => onApprove(t!)} className="bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-40" data-testid="button-dialog-approve-ai">Approve and add</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
