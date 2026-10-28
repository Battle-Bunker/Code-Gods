import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAssistantGrants, isDaemonMode, revokeAssistantGrant } from "@/player-api";

const grantsKey = ["player-assistant-grants"];
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function AssistantGrants() {
  const daemon = isDaemonMode();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const grants = useQuery({
    queryKey: grantsKey, queryFn: getAssistantGrants, enabled: !daemon,
    staleTime: 0, gcTime: 0, retry: false, refetchInterval: 30000,
  });
  const revoke = useMutation({
    mutationFn: revokeAssistantGrant,
    onSuccess: async (_, delegateId) => {
      await client.cancelQueries({ queryKey: grantsKey });
      client.setQueryData<Awaited<ReturnType<typeof getAssistantGrants>>>(grantsKey, old =>
        old ? { grants: old.grants.filter(grant => grant.delegateId !== delegateId) } : old);
      setNotice("Assistant grant revoked. Its credential can no longer be used.");
      await client.invalidateQueries({ queryKey: grantsKey });
    },
  });
  useEffect(() => {
    const clear = () => { client.removeQueries({ queryKey: grantsKey }); };
    window.addEventListener("player-expired", clear);
    return () => { clear(); window.removeEventListener("player-expired", clear); };
  }, [client]);

  if (daemon) return (
    <p className="text-sm text-muted-foreground" data-testid="text-assistant-authority-controls">
      Manage and revoke your assistant grants in the Player console on your authoritative room server, signed in with Replit. This local daemon cannot use browser authority controls or your browser cookie.
    </p>
  );

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">Your assistant grants across rooms on this server. Labels are self-reported, not verified. Revoking access does not undo actions already taken.</p>
      <button type="button" data-testid="button-refresh-assistant-grants" disabled={grants.isFetching || revoke.isPending}
        onClick={() => void grants.refetch()} className="label underline disabled:opacity-35">Refresh grants</button>
      {grants.isPending && <p data-testid="status-assistant-grants-loading">Loading grants…</p>}
      {grants.error && <p role="alert" className="text-destructive" data-testid="text-assistant-grants-error">{message(grants.error)}</p>}
      {grants.data && !grants.isError && (grants.data.grants.length === 0 ? (
        <p className="text-muted-foreground" data-testid="text-assistant-grants-empty">No assistant grants.</p>
      ) : (
        <ul className="space-y-3">
          {grants.data.grants.map(grant => {
            const expires = new Date(grant.expiresAt).getTime();
            return (
              <li key={grant.delegateId} className="border border-[hsl(var(--card-border))] p-3 space-y-2" data-testid={`row-assistant-grant-${grant.delegateId}`}>
                <p className="font-semibold break-words">{grant.clientLabel || "Unlabeled assistant"} <span className="font-normal text-muted-foreground">(not verified)</span></p>
                <p className="font-mono text-xs break-all">room {grant.roomId}</p>
                <p>{grant.permission === "read" ? "Read only — private room observation" : grant.permission === "act" ? "Act — observe and send game actions as you" : grant.permission === "owner" ? "Owner — full room settings, paid AI budget approvals and provider spending, AI seats, start/end/resume, and playing as you. This room only; not global admin." : "Unknown permission"}</p>
                <p className="text-xs text-muted-foreground">Credential expires: {Number.isFinite(expires) ? new Date(expires).toLocaleString() : "Invalid expiry"}. Credentials last 15 minutes.</p>
                <button type="button" data-testid={`button-revoke-assistant-${grant.delegateId}`} disabled={revoke.isPending}
                  onClick={() => { setNotice(""); revoke.mutate(grant.delegateId); }}
                  className="border border-[hsl(var(--input))] px-3 py-2 font-semibold disabled:opacity-35">
                  {revoke.isPending && revoke.variables === grant.delegateId ? "Revoking…" : "Revoke access"}
                </button>
              </li>
            );
          })}
        </ul>
      ))}
      {revoke.error && <p role="alert" className="text-destructive" data-testid="text-assistant-revoke-error">{message(revoke.error)}</p>}
      {notice && <p role="status" data-testid="status-assistant-revoked">{notice}</p>}
    </div>
  );
}
