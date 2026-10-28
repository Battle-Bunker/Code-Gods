import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useApproveDevice } from "@workspace/api-client-react";
import { Shell, ErrorLine } from "@/components/shell";
import { useAuth } from "@/hooks/use-auth";
import { errMsg } from "@/lib/errors";
import { Check } from "lucide-react";

type DeviceDetails = {
  roomId: string; roomCode: string; clientLabel: string;
  permission: "read" | "act" | "owner"; expiresAt: string | number; status: string;
  canApprove: boolean;
};

async function deviceRequest<T>(path: string, code?: string): Promise<T> {
  const response = await fetch(`/api/device/${path}`, {
    credentials: "same-origin", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(15000),
    ...(code ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) } : {}),
  });
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error("Device authorization service is unavailable.");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || `Device request failed (${response.status}).`);
  return data;
}

export default function Device() {
  const { user, isAuthenticated, isLoading, login } = useAuth();
  const initial = new URLSearchParams(window.location.search).get("code") ?? "";
  const [code, setCode] = useState(initial.toUpperCase());
  const [reviewedCode, setReviewedCode] = useState(initial.trim().toUpperCase());
  const [result, setResult] = useState<"approved" | "denied" | null>(null);
  const [ownerConsent, setOwnerConsent] = useState(false);
  const [now, setNow] = useState(Date.now());
  const approve = useApproveDevice();
  const deny = useMutation({ mutationFn: (value: string) => deviceRequest("deny", value) });
  const valid = code.trim().length >= 4 && code.trim().length <= 32;
  const details = useQuery({
    queryKey: ["device-details", user?.id, reviewedCode],
    queryFn: () => deviceRequest<DeviceDetails>(`details?code=${encodeURIComponent(reviewedCode)}`),
    enabled: isAuthenticated && valid && reviewedCode === code.trim() && !result,
    retry: false, staleTime: 0, refetchInterval: 15000,
  });
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setOwnerConsent(false); }, [code, user?.id]);
  const d = details.data;
  const expires = d ? new Date(d.expiresAt).getTime() : NaN;
  const pending = approve.isPending || deny.isPending;
  const canDecide = !!d && !details.isError && reviewedCode === code.trim() && d.status === "pending" &&
    (d.permission === "read" || d.permission === "act" || d.permission === "owner") && expires > now && !pending;
  const canApprove = canDecide && (d?.permission !== "owner" || (d.canApprove === true && ownerConsent));
  const decide = (action: "approved" | "denied") => {
    if (!canDecide) return;
    if (action === "approved" && !canApprove) return;
    if (action === "approved") approve.mutate({ data: { code: reviewedCode } }, { onSuccess: () => setResult("approved") });
    else deny.mutate(reviewedCode, { onSuccess: () => setResult("denied") });
  };
  return (
    <Shell>
      <div className="mx-auto max-w-lg px-4 py-16 rise">
        <p className="label-mono">Device authorization</p>
        <h1 className="font-display text-5xl mt-2">Review a client’s access.</h1>
        <p className="text-muted-foreground mt-4">A terminal, player client, or room assistant is requesting access as you. Continue only if you initiated this request and the code matches the one your client displays.</p>
        {isLoading ? null : !isAuthenticated ? (
          <button onClick={login} className="mt-8 bg-foreground text-background px-5 py-3" data-testid="button-login-device">Log in to approve</button>
        ) : result ? (
          <div className="mt-8 border border-primary bg-primary/5 p-5 flex gap-3 items-start" data-testid={`status-${result}`}>
            <Check className="h-5 w-5 text-primary mt-0.5" />
            <div><p className="font-medium">{result === "approved" ? "Access approved" : "Request denied"}</p><p className="text-sm text-muted-foreground">{result === "approved" ? "Return to your client. Its credential expires 15 minutes after it is issued. Manage assistant grants in the Player console on this server." : "No access was granted. You can close this tab."}</p></div>
          </div>
        ) : (
          <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) { if (reviewedCode === code.trim()) void details.refetch(); else setReviewedCode(code.trim()); approve.reset(); deny.reset(); } }}>
            <label htmlFor="device-code" className="label-mono">Authorization code</label>
            <input id="device-code" value={code} disabled={pending} onChange={(e) => { setCode(e.target.value.toUpperCase()); setReviewedCode(""); setOwnerConsent(false); approve.reset(); deny.reset(); }} maxLength={32} placeholder="XXXX-XXXX" className="w-full border bg-card px-4 py-4 font-mono text-3xl tracking-[0.3em] text-center outline-none focus:border-primary" data-testid="input-device-code" />
            <button disabled={!valid || pending || details.isFetching} className="w-full border py-3 disabled:opacity-50" data-testid="button-review-device">{details.isFetching ? "Loading request..." : "Review request"}</button>
            {d && reviewedCode === code.trim() && (
              <div className="border bg-card p-5 space-y-3 text-sm" data-testid="panel-device-details">
                <dl className="space-y-3">
                  <div><dt className="label-mono">Resolved room</dt><dd className="font-mono break-all" data-testid="text-device-room">{d.roomCode} · {d.roomId}</dd></div>
                  <div><dt className="label-mono">Requester label — self-reported, not verified</dt><dd className="break-words" data-testid="text-device-requester">{d.clientLabel || "No label supplied"}</dd></div>
                  <div><dt className="label-mono">Requested permission</dt><dd data-testid="text-device-permission">{d.permission === "read" ? "Read — view your private room observation; no game actions." : d.permission === "act" ? "Act — view your private room observation and send game actions as you." : d.permission === "owner" ? "Owner — full control of this room and permission to play as you." : "Unknown permission — do not approve."}</dd></div>
                  <div><dt className="label-mono">Approval request expires</dt><dd data-testid="text-device-expiry">{Number.isFinite(expires) ? new Date(expires).toLocaleString() : "Invalid expiry"}{expires <= now ? " · expired" : ""}</dd></div>
                  <div><dt className="label-mono">Request status</dt><dd data-testid="text-device-status">{d.status}</dd></div>
                </dl>
                <p className="text-muted-foreground">Approval issues a credential valid for 15 minutes. A requester label is not proof of identity or a verified Replit affiliation. Deny any request you do not recognize.</p>
                {d.permission === "owner" && (
                  <div className="space-y-3" data-testid="panel-device-owner-warning">
                    <p>Owner access allows full room settings changes, approving paid AI budgets and changing provider spending, managing AI seats, starting, ending, and resuming the room, viewing your private observation, and playing as you. The credential lasts 15 minutes and applies only to this room — it does not grant global admin access.</p>
                    {d.canApprove !== true ? (
                      <p role="alert" className="text-destructive" data-testid="text-device-owner-required">Only the room owner can approve this request. You are not authorized to grant owner access.</p>
                    ) : (
                      <label className="flex items-start gap-3" htmlFor="device-owner-consent">
                        <input id="device-owner-consent" type="checkbox" checked={ownerConsent} disabled={!canDecide} onChange={(e) => setOwnerConsent(e.target.checked)} className="mt-1" data-testid="checkbox-device-owner-consent" />
                        <span>I understand and explicitly authorize this client to control this room, approve paid AI budgets, change provider spending and AI seats, start/end/resume it, and play as me for 15 minutes.</span>
                      </label>
                    )}
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={() => decide("approved")} disabled={!canApprove} className="flex-1 bg-primary text-primary-foreground py-3 disabled:opacity-50" data-testid="button-approve-device">{approve.isPending ? "Approving..." : "Approve access"}</button>
                  <button type="button" onClick={() => decide("denied")} disabled={!canDecide} className="flex-1 border py-3 disabled:opacity-50" data-testid="button-deny-device">{deny.isPending ? "Denying..." : "Deny request"}</button>
                </div>
              </div>
            )}
            {details.error && <ErrorLine message={errMsg(details.error)} />}
            {approve.error && <ErrorLine message={errMsg(approve.error)} />}
            {deny.error && <ErrorLine message={errMsg(deny.error)} />}
          </form>
        )}
      </div>
    </Shell>
  );
}
