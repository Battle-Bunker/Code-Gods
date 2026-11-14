/** The account's side sheet: connected apps (credentials), listed and revoked. */
import { useState } from "react";
import { useMutation } from "convex/react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorLine } from "@/site/components/page-parts";
import { useRun } from "@/site/hooks/use-run";
import { api, useLive } from "@/site/lib/convex";
import { errMsg } from "@/site/lib/errors";
import { kindLabel } from "@/site/lib/device-approval";
import { fmtWhen } from "@/site/lib/time";
import type { FunctionReturnType } from "convex/server";

type Credential = FunctionReturnType<typeof api.auth.credentials.list>[number];

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

