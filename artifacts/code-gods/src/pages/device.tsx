import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Link } from "wouter";
import { Shell, ErrorLine } from "@/components/shell";
import { useAuth } from "@/hooks/use-auth";
import { api, useLive } from "@/lib/convex";
import { errMsg } from "@/lib/errors";
import { Check } from "lucide-react";
import { ownerApprovalBlocker } from "@/lib/device-approval";
import { OwnerAccessWarning, OwnerConsentCheck, permissionDescription } from "@/components/grant-review";

const normal = (code: string) => code.trim().toUpperCase();
const validCode = (code: string) => /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(normal(code));

/**
 * Device approval for player apps and room assistants (`pnpm player connect`): the human reviews the
 * resolved room, the requested permission, the self-reported label, the expiry and the comparison code,
 * then approves (an owner grant needs explicit consent) or denies. `auth/device:pending` is reactive.
 */
export default function Device() {
  const { user, isAuthenticated, isLoading, login } = useAuth();
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
  const d = reviewing ? details.data : undefined;
  const expires = d ? d.expiresAt : NaN;
  const ownerBlocker = d ? ownerApprovalBlocker(d.status, expires, now, d.canApprove) : null;
  const canDecide = !!d && d.status === "pending" && (d.permission === "read" || d.permission === "act" || d.permission === "owner") && expires > now && !pending;
  const canApprove = canDecide && d.canApprove && (d.permission !== "owner" || ownerConsent);
  const decide = (action: "approved" | "denied") => {
    if (!d || !canDecide || (action === "approved" && !canApprove)) return;
    setPending(true); setError(null);
    const call = action === "approved"
      ? approve({ userCode: d.userCode, ...(d.permission === "owner" ? { ownerConsent: true } : {}) })
      : deny({ userCode: d.userCode });
    call.then(() => setResult(action), setError).finally(() => setPending(false));
  };
  return (
    <Shell>
      <div className="mx-auto max-w-lg px-4 py-16 rise">
        <p className="label-mono">Device authorization</p>
        <h1 className="font-display text-5xl mt-2">Review a client’s access.</h1>
        <p className="text-muted-foreground mt-4">A player app or room assistant is requesting access to one room as you. Continue only if you started this request and the code below matches the one your client printed.</p>
        {isLoading ? null : !isAuthenticated ? (
          <button onClick={login} className="mt-8 bg-foreground text-background px-5 py-3" data-testid="button-login-device">Log in to approve</button>
        ) : result ? (
          <div className="mt-8 border border-primary bg-primary/5 p-5 flex gap-3 items-start" data-testid={`status-${result}`}>
            <Check className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">{result === "approved" ? "Access approved" : "Request denied"}</p>
              <p className="text-sm text-muted-foreground">{result === "approved"
                ? <>Return to your client: it receives its credential once, and should store it as the Secret <code className="font-mono">CODE_GODS_CREDENTIAL</code>. It lasts up to 7 days unless revoked. Revoke it any time under “Your player apps” in the room{d?.roomCode ? <> (<Link href={`/rooms/${d.roomCode}`} className="underline">{d.roomCode}</Link>)</> : null}.</>
                : "No access was granted. You can close this tab."}</p>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); if (validCode(code)) { setReviewedCode(normal(code)); setError(null); } }}>
            <label htmlFor="device-code" className="label-mono">Authorization code</label>
            <input id="device-code" value={code} disabled={pending} onChange={(e) => { setCode(e.target.value.toUpperCase()); setReviewedCode(""); setOwnerConsent(false); setError(null); }} maxLength={32} placeholder="XXXX-XXXX" className="w-full border bg-card px-4 py-4 font-mono text-3xl tracking-[0.3em] text-center outline-none focus:border-primary" data-testid="input-device-code" />
            <button disabled={!validCode(code) || pending || (reviewing && details.isLoading)} className="w-full border py-3 disabled:opacity-50" data-testid="button-review-device">{reviewing && details.isLoading ? "Loading request..." : "Review request"}</button>
            {reviewing && details.data === null && (
              <p role="alert" className="text-sm text-destructive" data-testid="text-device-unknown">No request with this code is waiting for you. Check the code, ask the client for a fresh one, or join its room first: only room members can approve.</p>
            )}
            {d && (
              <div className="border bg-card p-5 space-y-3 text-sm" data-testid="panel-device-details">
                <dl className="space-y-3">
                  <div><dt className="label-mono">Comparison code — must match your client</dt><dd className="font-mono text-2xl tracking-[0.2em]" data-testid="text-device-code">{d.userCode}</dd></div>
                  <div><dt className="label-mono">Resolved room</dt><dd className="font-mono break-all" data-testid="text-device-room">{d.roomCode} · {d.roomId}{d.isRoomOwner ? " · you own it" : ""}</dd></div>
                  <div><dt className="label-mono">Requester label — self-reported, not verified</dt><dd className="break-words" data-testid="text-device-requester">{d.label || "No label supplied"}</dd></div>
                  <div><dt className="label-mono">Requested permission</dt><dd data-testid="text-device-permission">{permissionDescription(d.permission)}</dd></div>
                  <div><dt className="label-mono">Approval request expires</dt><dd data-testid="text-device-expiry">{Number.isFinite(expires) ? new Date(expires).toLocaleString() : "Invalid expiry"}{expires <= now ? " · expired" : ` · in ${Math.max(0, Math.round((expires - now) / 1000))}s`}</dd></div>
                  <div><dt className="label-mono">Request status</dt><dd data-testid="text-device-status">{d.status}</dd></div>
                </dl>
                <p className="text-muted-foreground">Approval issues a credential for this room only, valid for up to 7 days; you can revoke it at any time from the room page. A requester label is not proof of identity. Deny any request you do not recognize.</p>
                {d.permission === "owner" && (
                  <div className="space-y-3" data-testid="panel-device-owner-warning">
                    <OwnerAccessWarning />
                    {ownerBlocker ? (
                      <p role="alert" className="text-destructive" data-testid="text-device-owner-required">{ownerBlocker}</p>
                    ) : (
                      <OwnerConsentCheck id="device-owner-consent" checked={ownerConsent} disabled={!canDecide} onChange={setOwnerConsent} testId="checkbox-device-owner-consent" />
                    )}
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={() => decide("approved")} disabled={!canApprove} className="flex-1 bg-primary text-primary-foreground py-3 disabled:opacity-50" data-testid="button-approve-device">{pending ? "Working..." : "Approve access"}</button>
                  <button type="button" onClick={() => decide("denied")} disabled={!canDecide} className="flex-1 border py-3 disabled:opacity-50" data-testid="button-deny-device">Deny request</button>
                </div>
              </div>
            )}
            {details.error && <ErrorLine message={errMsg(details.error)} />}
            {!!error && <ErrorLine message={errMsg(error)} />}
          </form>
        )}
      </div>
    </Shell>
  );
}
