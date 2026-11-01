import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Link } from "wouter";
import { Page, usePage } from "@/components/layout";
import { Action } from "@/components/action";
import { ErrorLine } from "@/components/page-parts";
import { useAuth } from "@/hooks/use-auth";
import { api, useLive } from "@/lib/convex";
import { errMsg } from "@/lib/errors";
import { Check } from "lucide-react";
import { ownerApprovalBlocker } from "@/lib/device-approval";
import { OwnerAccessWarning, OwnerConsentCheck, permissionDescription } from "@/components/grant-review";

const normal = (code: string) => code.trim().toUpperCase();
const validCode = (code: string) => /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(normal(code));
const countdown = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/**
 * Device approval for player apps and room assistants (`pnpm player connect`), palette-and-pages.md §3.5: the code,
 * then everything security-relevant in view (the comparison code, the room, the permission in words, the
 * self-reported requester, the countdown, and for owner access the warning and consent), Approve and Deny.
 */
export default function Device() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const initial = new URLSearchParams(window.location.search).get("code") ?? "";
  const [code, setCode] = useState(normal(initial));
  const [reviewedCode, setReviewedCode] = useState(validCode(initial) ? normal(initial) : "");
  const [result, setResult] = useState<"approved" | "denied" | null>(null);
  const [ownerConsent, setOwnerConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());
  const approve = useMutation(api.auth.device.approve);
  const deny = useMutation(api.auth.device.deny);
  const reviewing = isAuthenticated && !!reviewedCode && reviewedCode === normal(code) && !result;
  const details = useLive(api.auth.device.pending, reviewing ? { userCode: reviewedCode } : "skip");
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setOwnerConsent(false); }, [code, user?.id]);
  useEffect(() => { document.title = "Approve a device · Code Gods"; }, []);
  const d = reviewing ? details.data : undefined;
  const expires = d ? d.expiresAt : NaN;
  const ownerBlocker = d ? ownerApprovalBlocker(d.status, expires, now, d.canApprove) : null;
  const canDecide = !!d && d.status === "pending" && (d.permission === "read" || d.permission === "act" || d.permission === "owner") && expires > now && !pending;
  const canApprove = canDecide && d.canApprove && (d.permission !== "owner" || ownerConsent);
  const decide = (action: "approved" | "denied") => {
    if (!d || !canDecide || (action === "approved" && !canApprove)) return;
    setPending(true); setError(null);
    const call = action === "approved" ? approve({ userCode: d.userCode, ...(d.permission === "owner" ? { ownerConsent: true } : {}) }) : deny({ userCode: d.userCode });
    call.then(() => setResult(action), setError).finally(() => setPending(false));
  };
  return (
    <Page crumbs={[{ label: "Approve a device" }]}>
      <div className="mx-auto max-w-lg px-4 py-14 rise">
        <h1 className="font-display text-5xl">Approve a device</h1>
        <p className="text-muted-foreground mt-3">Approve only if you started this and the code matches your client.</p>
        {isLoading ? null : !isAuthenticated ? <SignIn />
        : result ? (
          <div className="mt-8 border border-primary bg-primary/5 p-5 flex gap-3 items-start" data-testid={`status-${result}`}>
            <Check className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium">{result === "approved" ? "Access approved" : "Request denied"}</p>
              <p className="text-sm text-muted-foreground">{result === "approved" ? "Return to your client; it receives its credential now." : "No access was granted. You can close this tab."}</p>
              {result === "approved" && (
                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer">Details</summary>
                  <p className="mt-2">The client should store its credential as the secret <code className="font-mono">CODE_GODS_CREDENTIAL</code>. It lasts up to 7 days unless revoked; revoke it under “Connected apps” in the menu{d?.roomCode ? <> (room <Link href={`/rooms/${d.roomCode}`} className="underline">{d.roomCode}</Link>)</> : null}.</p>
                </details>
              )}
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-4" onSubmit={e => { e.preventDefault(); if (validCode(code)) { setReviewedCode(normal(code)); setError(null); } }}>
            <label htmlFor="device-code" className="text-sm font-medium">The code your client printed</label>
            <input id="device-code" value={code} disabled={pending} onChange={e => { setCode(e.target.value.toUpperCase()); setReviewedCode(""); setOwnerConsent(false); setError(null); }} maxLength={32} placeholder="XXXX-XXXX"
              className="w-full border bg-card px-4 py-4 font-mono text-3xl tracking-[0.3em] text-center outline-none focus:border-primary" data-testid="input-device-code" />
            {!d && <button type="submit" disabled={!validCode(code) || pending || (reviewing && details.isLoading)} className="w-full bg-primary text-primary-foreground py-3 disabled:opacity-50" data-testid="button-review-device">{reviewing && details.isLoading ? "Loading request…" : "Continue"}</button>}
            {reviewing && details.data === null && (
              <p role="alert" className="text-sm text-destructive" data-testid="text-device-unknown">No request with this code is waiting for you. Check the code, ask the client for a fresh one, or join its room first: only room members can approve.</p>
            )}
            {d && (
              <div className="border bg-card p-5 space-y-4 text-sm" data-testid="panel-device-details">
                <dl className="space-y-3">
                  <div><dt className="label-mono">Comparison code (must match your client)</dt><dd className="font-mono text-3xl tracking-[0.2em]" data-testid="text-device-code">{d.userCode}</dd></div>
                  <div><dt className="label-mono">Room</dt><dd className="font-mono" data-testid="text-device-room">{d.roomCode}{d.isRoomOwner ? " · you own it" : ""}</dd></div>
                  <div><dt className="label-mono">Permission</dt><dd data-testid="text-device-permission">{permissionDescription(d.permission)}</dd></div>
                  <div><dt className="label-mono">Requested by (self-reported)</dt><dd className="break-words" data-testid="text-device-requester">{d.label || "No label supplied"}</dd></div>
                  <div><dt className="label-mono">Expires</dt><dd data-testid="text-device-expiry">{!Number.isFinite(expires) ? "Invalid expiry" : expires <= now ? "expired" : `in ${countdown(expires - now)}`}</dd></div>
                </dl>
                <span className="sr-only" data-testid="text-device-status">{d.status}</span>
                {d.permission === "owner" && (
                  <div className="space-y-3" data-testid="panel-device-owner-warning">
                    <OwnerAccessWarning />
                    {ownerBlocker ? <p role="alert" className="text-destructive" data-testid="text-device-owner-required">{ownerBlocker}</p>
                      : <OwnerConsentCheck id="device-owner-consent" checked={ownerConsent} disabled={!canDecide} onChange={setOwnerConsent} testId="checkbox-device-owner-consent" />}
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={() => decide("approved")} disabled={!canApprove} className="flex-1 bg-primary text-primary-foreground py-3 disabled:opacity-50" data-testid="button-approve-device">{pending ? "Working…" : "Approve access"}</button>
                  <button type="button" onClick={() => decide("denied")} disabled={!canDecide} className="flex-1 border py-3 disabled:opacity-50" data-testid="button-deny-device">Deny</button>
                </div>
              </div>
            )}
            {details.error && <ErrorLine message={errMsg(details.error)} />}
            {!!error && <ErrorLine message={errMsg(error)} />}
          </form>
        )}
      </div>
    </Page>
  );
}

function SignIn({ testId = "button-login-device" }: { testId?: string }) {
  const { run } = usePage();
  return <div className="mt-8"><Action k="ui.auth.signIn" tone="primary" onClick={() => run("ui.auth.signIn")} testId={testId} /></div>;
}
export { SignIn };
