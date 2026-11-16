/** v1's retry-uncertain banner: a command whose answer never came, sent again with its requestId (applied at most once). */
import { useState } from "react";
import { useRuntime } from "@/core/affordance-runtime";
import { clearUncertain, useUncertain } from "@/core/uncertain";

export function UncertainBanner() {
  const u = useUncertain();
  const rt = useRuntime();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!u) return null;
  const retry = async () => {
    setBusy(true); setNote(null);
    const out = await rt.perform(u.id as never, u.args);
    setBusy(false);
    if (out.ok) { clearUncertain(); return; }
    setNote(out.error.message);
  };
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-3 py-1.5 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50" data-testid="banner-uncertain">
      <span className="flex-1">“{u.title}” may not have gone through: the connection dropped before its answer came. Sending it again applies it at most once.</span>
      <button type="button" className="border px-2 py-0.5 text-xs font-medium" disabled={busy} onClick={() => void retry()} data-testid="button-uncertain-retry">{busy ? "Sending…" : "Send it again"}</button>
      <button type="button" className="px-2 py-0.5 text-xs underline underline-offset-4" onClick={clearUncertain} data-testid="button-uncertain-dismiss">Dismiss</button>
      {note && <span className="w-full text-xs">{note}</span>}
    </div>
  );
}
