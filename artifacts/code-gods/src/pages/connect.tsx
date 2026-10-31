import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Page } from "@/components/layout";
import { ErrorLine } from "@/components/page-parts";
import { OwnerAccessWarning, OwnerConsentCheck, permissionDescription } from "@/components/grant-review";
import { SignIn } from "@/pages/device";
import { useAuth } from "@/hooks/use-auth";
import { api, useLive } from "@/lib/convex";
import { connectBlocker, permissionChoices, type Permission } from "@/lib/device-approval";
import { errMsg } from "@/lib/errors";
import { completionSecret } from "@/lib/connect-completion";

/**
 * MCP connection approval (OAuth from Claude or another MCP client: GET /oauth/authorize sends the browser here with
 * `?request=…`), palette-and-pages.md §3.6. In view: the self-reported client name, where the browser returns, the
 * room, the permission as a sentence and, for owner access, the warning and consent. "Change permission" reveals the
 * choice (never above what the client asked); client metadata and expiry sit under Details. After deciding, the
 * browser goes to /oauth/authorize/complete with a one-time completion secret generated here.
 */
export default function Connect() {
  const { isAuthenticated, isLoading } = useAuth();
  const request = new URLSearchParams(window.location.search).get("request") ?? "";
  const details = useLive(api.agent.connect.pending, isAuthenticated && request ? { request } : "skip");
  const approve = useMutation(api.agent.connect.approve);
  const deny = useMutation(api.agent.connect.deny);
  const [roomId, setRoomId] = useState("");
  const [permission, setPermission] = useState<Permission | null>(null);
  const [ownerConsent, setOwnerConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { document.title = "Approve a connection · Code Gods"; }, []);
  const d = details.data;
  useEffect(() => {
    if (!d) return;
    setPermission(p => p ?? d.permission);
    setRoomId(r => r || (d.rooms.length === 1 ? d.rooms[0].roomId : ""));
  }, [d]);
  useEffect(() => { setOwnerConsent(false); }, [roomId, permission]);
  const room = d?.rooms.find(r => r.roomId === roomId);
  const chosen = permission ?? d?.permission ?? "read";
  const blocker = d ? connectBlocker({ status: d.status, expiresAt: d.expiresAt, now, roomId, permission: chosen, isRoomOwner: !!room?.isOwner, ownerConsent }) : null;
  // The code is released only with this one-time secret, so only this browser can collect it (agent/connect.ts).
  const [completion] = useState(() => completionSecret((() => { try { return window.sessionStorage; } catch { return null; } })(), request));
  const finish = () => window.location.assign(`/oauth/authorize/complete?request=${encodeURIComponent(request)}&completion=${encodeURIComponent(completion)}`);
  const decide = (action: "approve" | "deny") => {
    if (!d || pending || (action === "approve" && blocker)) return;
    setPending(true); setError(null);
    const call = action === "approve"
      ? approve({ request, roomId, permission: chosen, completion, ...(chosen === "owner" ? { ownerConsent: true } : {}) })
      : deny({ request });
    call.then(finish, e => { setError(e); setPending(false); });
  };
  return (
    <Page crumbs={[{ label: "Approve a connection" }]}>
      <div className="mx-auto max-w-lg px-4 py-14 rise">
        <h1 className="font-display text-5xl">Approve a connection</h1>
        <p className="text-muted-foreground mt-3">An app such as Claude asks to play as you in one room. Approve only if you started this from that app.</p>
        {!request ? <div className="mt-8"><ErrorLine message="This page needs a connection request. Start again from your app." /></div>
        : isLoading ? null
        : !isAuthenticated ? <SignIn testId="button-login-connect" />
        : details.isLoading ? <p className="mt-8 text-sm text-muted-foreground">Loading the request…</p>
        : d === null ? <p role="alert" className="mt-8 text-sm text-destructive" data-testid="text-connect-unknown">No connection request is waiting for you here. It may have expired or been decided; start again from your app.</p>
        : d ? (
          <div className="mt-8 border bg-card p-5 space-y-4 text-sm" data-testid="panel-connect-details">
            <dl className="space-y-3">
              <div><dt className="label-mono">App (self-reported)</dt><dd className="break-words" data-testid="text-connect-client">{d.clientName}</dd></div>
              <div><dt className="label-mono">Returns to</dt><dd className="font-mono break-all" data-testid="text-connect-redirect">{d.redirectHost}</dd></div>
            </dl>
            <label className="block space-y-1" htmlFor="connect-room">
              <span className="label-mono">Room</span>
              <select id="connect-room" value={roomId} disabled={pending} onChange={e => setRoomId(e.target.value)} className="w-full border bg-background px-3 py-2" data-testid="select-connect-room">
                <option value="">{d.rooms.length ? "Choose one of your rooms" : "You are not in any room yet"}</option>
                {d.rooms.map(r => <option key={r.roomId} value={r.roomId}>{r.shortCode}{r.isOwner ? " · you own it" : ""}</option>)}
              </select>
            </label>
            <p data-testid="text-connect-requested">It may: {permissionDescription(chosen)}</p>
            {permissionChoices(d.permission).length > 1 && (
              <details>
                <summary className="cursor-pointer">Change permission</summary>
                <fieldset className="mt-2 space-y-2">
                  <legend className="sr-only">Permission (you may lower it)</legend>
                  {permissionChoices(d.permission).map(p => (
                    <label key={p} className="flex items-start gap-3">
                      <input type="radio" name="connect-permission" checked={chosen === p} disabled={pending} onChange={() => setPermission(p)} className="mt-1" data-testid={`radio-connect-${p}`} />
                      <span>{permissionDescription(p)}</span>
                    </label>
                  ))}
                </fieldset>
              </details>
            )}
            {chosen === "owner" && (
              <div className="space-y-3" data-testid="panel-connect-owner-warning">
                <OwnerAccessWarning />
                {room?.isOwner && <OwnerConsentCheck id="connect-owner-consent" checked={ownerConsent} disabled={pending} onChange={setOwnerConsent} testId="checkbox-connect-owner-consent" />}
              </div>
            )}
            <p className="text-muted-foreground">Listed under Connected apps; revoke it there any time. It expires after 30 days without use.</p>
            {blocker && <p className="text-muted-foreground" data-testid="text-connect-blocker">{blocker}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => decide("approve")} disabled={!!blocker || pending} className="flex-1 bg-primary text-primary-foreground py-3 disabled:opacity-50" data-testid="button-approve-connect">{pending ? "Working…" : "Approve connection"}</button>
              <button type="button" onClick={() => decide("deny")} disabled={pending || d.status !== "pending"} className="flex-1 border py-3 disabled:opacity-50" data-testid="button-deny-connect">Deny</button>
            </div>
            <details className="text-muted-foreground">
              <summary className="cursor-pointer">Details</summary>
              <dl className="mt-2 space-y-2">
                {d.clientId.startsWith("https://") && <div><dt className="label-mono">Client metadata</dt><dd className="font-mono text-xs break-all">{d.clientId}</dd></div>}
                <div><dt className="label-mono">Full return address</dt><dd className="font-mono text-xs break-all">{d.redirectUri}</dd></div>
                <div><dt className="label-mono">Request expires</dt><dd>{new Date(d.expiresAt).toLocaleString()}{d.expiresAt <= now ? " · expired" : ` · in ${Math.max(0, Math.round((d.expiresAt - now) / 1000))} s`}</dd></div>
              </dl>
            </details>
          </div>
        ) : null}
        {details.error && <div className="mt-4"><ErrorLine message={errMsg(details.error)} /></div>}
        {!!error && <div className="mt-4"><ErrorLine message={errMsg(error)} /></div>}
      </div>
    </Page>
  );
}
