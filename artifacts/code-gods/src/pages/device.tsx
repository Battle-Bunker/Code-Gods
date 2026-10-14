import { useState } from "react";
import { useApproveDevice } from "@workspace/api-client-react";
import { Shell, ErrorLine } from "@/components/shell";
import { useAuth } from "@/hooks/use-auth";
import { errMsg } from "@/lib/errors";
import { Check } from "lucide-react";

export default function Device() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const initial = new URLSearchParams(window.location.search).get("code") ?? "";
  const [code, setCode] = useState(initial.toUpperCase());
  const approve = useApproveDevice();
  const valid = code.trim().length >= 4 && code.trim().length <= 32;
  return (
    <Shell>
      <div className="mx-auto max-w-lg px-4 py-16 rise">
        <p className="label-mono">Device authorization</p>
        <h1 className="font-display text-5xl mt-2">Bind a client to your name.</h1>
        <p className="text-muted-foreground mt-4">A terminal or player client is asking to act as you. Approve only if the code below matches the one it displays.</p>
        {isLoading ? null : !isAuthenticated ? (
          <button onClick={login} className="mt-8 bg-foreground text-background px-5 py-3" data-testid="button-login-device">Log in to approve</button>
        ) : approve.isSuccess ? (
          <div className="mt-8 border border-primary bg-primary/5 p-5 flex gap-3 items-start" data-testid="status-approved">
            <Check className="h-5 w-5 text-primary mt-0.5" />
            <div><p className="font-medium">Approved ({approve.data.status})</p><p className="text-sm text-muted-foreground">Return to your client. You can close this tab.</p></div>
          </div>
        ) : (
          <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) approve.mutate({ data: { code: code.trim() } }); }}>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={32} placeholder="XXXX-XXXX" className="w-full border bg-card px-4 py-4 font-mono text-3xl tracking-[0.3em] text-center outline-none focus:border-primary" data-testid="input-device-code" />
            <button disabled={!valid || approve.isPending} className="w-full bg-primary text-primary-foreground py-3 disabled:opacity-50" data-testid="button-approve-device">{approve.isPending ? "Approving..." : "Approve device"}</button>
            {approve.error && <ErrorLine message={errMsg(approve.error)} />}
          </form>
        )}
      </div>
    </Shell>
  );
}
