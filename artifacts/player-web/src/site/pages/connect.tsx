import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Page } from "@/site/components/layout";
import { ErrorLine } from "@/site/components/page-parts";
import { OwnerAccessWarning, OwnerConsentCheck, permissionDescription } from "@/site/components/grant-review";
import { SignIn } from "@/site/pages/device";
import { useAuth } from "@/site/hooks/use-auth";
import { api, useLive } from "@/site/lib/convex";
import { connectBlocker, initialConnectChoice, permissionChoices, type Permission } from "@/site/lib/device-approval";
import { errMsg } from "@/site/lib/errors";
import { completionSecret } from "@/site/lib/connect-completion";

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
  const join = useMutation(api.rooms.join);
  const [joining, setJoining] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [permission, setPermission] = useState<Permission | null>(null);
  const [ownerConsent, setOwnerConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { document.title = "Approve a connection · Code Gods"; }, []);
  const d = details.data;
  // The first choice, once: later updates of the request (a join, another room's change) never undo the human's picks.
  const initialised = useRef(false);
  useEffect(() => {
    if (!d || initialised.current || d.permission === "account") return;
    initialised.current = true;
    const first = initialConnectChoice({ requested: d.permission, rooms: d.rooms, hint: d.roomHint });
    setRoomId(first.roomId);
    setPermission(first.permission);
  }, [d]);
  useEffect(() => { setOwnerConsent(false); }, [roomId, permission]);
  const room = d?.rooms.find(r => r.roomId === roomId);
  const requested: Permission = d && d.permission !== "account" ? d.permission : "read";
  const chosen = permission ?? requested;
  const blocker = d ? connectBlocker({ status: d.status, expiresAt: d.expiresAt, now, roomId, permission: chosen, isRoomOwner: !!room?.isOwner, ownerConsent }) : null;
  // The code is released only with this one-time secret, so only this browser can collect it (agent/connect.ts).
  const [completion] = useState(() => completionSecret((() => { try { return window.sessionStorage; } catch { return null; } })(), request));
  const finish = () => window.location.assign(`/oauth/authorize/complete?request=${encodeURIComponent(request)}&completion=${encodeURIComponent(completion)}`);
  const joinHinted = () => {
    if (!d?.roomHint || joining) return;
    setJoining(true); setError(null);
    const hinted = d.roomHint.roomId;
    join({ room: hinted }).then(() => {
      setRoomId(hinted);
      if (requested === "owner" && !d.roomHint!.isOwner) setPermission("act");
      setJoining(false);
    }, e => { setError(e); setJoining(false); });
  };
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
        <p className="text-muted-foreground mt-3">{d?.permission === "account" ? "An app asks to act as you in every room." : "An app (Claude, a player client, a coding agent) asks to play as you in one room."} Approve only if you started this from that app.</p>
        {!request ? <div className="mt-8"><ErrorLine message="This page needs a connection request. Start again from your app." /></div>
        : isLoading ? null
        : !isAuthenticated ? <SignIn testId="button-login-connect" />
        : details.isLoading ? <p className="mt-8 text-sm text-muted-foreground">Loading the request…</p>
        : d === null ? <p role="alert" className="mt-8 text-sm text-destructive" data-testid="text-connect-unknown">No connection request is waiting for you here. It may have expired or been decided; start again from your app.</p>
        : d?.permission === "account" ? <AccountRequest d={d} pending={pending} decide={consent => {
            if (pending) return;
            setPending(true); setError(null);
            (consent === null ? deny({ request }) : approve({ request, permission: "account", completion, accountConsent: consent })).then(finish, e => { setError(e); setPending(false); });
          }} now={now} />
        : d ? (
          <div className="mt-8 border bg-card p-5 space-y-4 text-sm" data-testid="panel-connect-details">
            {d.roomHint && !d.roomHint.member && (
              <div className="border border-primary/40 p-3 space-y-2" data-testid="panel-connect-join">
                <p>The app asks for room <span className="font-mono">{d.roomHint.shortCode}</span>, which you have not joined. Joining shows your name in the room; joining mid-game makes you a spectator until the next game.</p>
                <button type="button" onClick={joinHinted} disabled={joining || pending} className="border px-3 py-2 disabled:opacity-50" data-testid="button-join-room">{joining ? "Joining…" : `Join room ${d.roomHint.shortCode}`}</button>
              </div>
            )}
            {d.roomHintUnknown && <p className="text-muted-foreground" data-testid="text-connect-hint-unknown">The app asked for a room that does not exist here. Choose one of yours.</p>}
            <dl className="space-y-3">
              <div><dt className="label-mono">App (self-reported)</dt><dd className="break-words" data-testid="text-connect-client">{d.clientName}</dd></div>
              <div><dt className="label-mono">Returns to</dt><dd className="font-mono break-all" data-testid="text-connect-redirect">{d.redirectHost}</dd></div>
              <div className="text-muted-foreground" data-testid="text-connect-foreign">This app runs on {d.redirectHost}: it gets a token to play as you in the room below. Approve only if you started it.</div>
            </dl>
            <label className="block space-y-1" htmlFor="connect-room">
              <span className="label-mono">Room</span>
              <select id="connect-room" value={roomId} disabled={pending} onChange={e => setRoomId(e.target.value)} className="w-full border bg-background px-3 py-2" data-testid="select-connect-room">
                <option value="">{d.rooms.length ? "Choose one of your rooms" : "You are not in any room yet"}</option>
                {d.rooms.map(r => <option key={r.roomId} value={r.roomId}>{r.shortCode}{r.isOwner ? " · you own it" : ""}</option>)}
              </select>
            </label>
            <p data-testid="text-connect-requested">It may: {permissionDescription(chosen)}</p>
            {permissionChoices(requested).length > 1 && (
              <details>
                <summary className="cursor-pointer">Change permission</summary>
                <fieldset className="mt-2 space-y-2">
                  <legend className="sr-only">Permission (you may lower it)</legend>
                  {permissionChoices(requested).map(p => (
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

/**
 * An account request (scope=account, docs/external-clients.md): the app asks to act as the human in every room. It is
 * approved as asked (explicit consent, never without a click) or denied; there is no room or permission to choose.
 */
function AccountRequest({ d, pending, decide, now }: {
  d: { clientName: string; clientId: string; redirectHost: string; redirectUri: string; status: string; expiresAt: number };
  /** The human's answer: the consent checkbox's state to approve (the engine refuses without it), null to deny. */
  pending: boolean; decide: (consent: boolean | null) => void; now: number;
}) {
  const [consent, setConsent] = useState(false);
  const open = d.status === "pending" && d.expiresAt > now;
  return (
    <div className="mt-8 border bg-card p-5 space-y-4 text-sm" data-testid="panel-connect-account">
      <dl className="space-y-3">
        <div><dt className="label-mono">App (self-reported)</dt><dd className="break-words" data-testid="text-connect-client">{d.clientName}</dd></div>
        <div><dt className="label-mono">Returns to</dt><dd className="font-mono break-all" data-testid="text-connect-redirect">{d.redirectHost}</dd></div>
      </dl>
      <p className="border-2 border-accent p-3" data-testid="text-connect-account">
        This app asks to act as you <b>in every room</b>: it can see your rooms, create and join rooms, play, chat and run the rooms you own,
        exactly as you can on this site. It cannot approve other apps, see or revoke your connections, or use admin pages.
        It runs on <span className="font-mono">{d.redirectHost}</span>. Approve only if you started it and trust that app.
      </p>
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={consent} disabled={pending || !open} onChange={e => setConsent(e.target.checked)} className="mt-1" data-testid="checkbox-connect-account-consent" />
        <span>I allow this app to act as me in every room.</span>
      </label>
      <p className="text-muted-foreground">Listed under Connected apps; revoke it there any time. It expires after 7 days without use.</p>
      {!open && <p className="text-muted-foreground" data-testid="text-connect-blocker">This request is no longer waiting; start again from your app.</p>}
      <div className="flex gap-3">
        <button type="button" onClick={() => decide(consent)} disabled={!consent || pending || !open} className="flex-1 bg-primary text-primary-foreground py-3 disabled:opacity-50" data-testid="button-approve-connect">{pending ? "Working…" : "Allow"}</button>
        <button type="button" onClick={() => decide(null)} disabled={pending || d.status !== "pending"} className="flex-1 border py-3 disabled:opacity-50" data-testid="button-deny-connect">Deny</button>
      </div>
      <details className="text-muted-foreground"><summary className="cursor-pointer">Details</summary>
        <dl className="mt-2 space-y-2">
          {d.clientId.startsWith("https://") && <div><dt className="label-mono">Client metadata</dt><dd className="font-mono text-xs break-all">{d.clientId}</dd></div>}
          <div><dt className="label-mono">Full return address</dt><dd className="font-mono text-xs break-all">{d.redirectUri}</dd></div>
          <div><dt className="label-mono">Request expires</dt><dd>{new Date(d.expiresAt).toLocaleString()}</dd></div>
        </dl></details>
    </div>
  );
}
