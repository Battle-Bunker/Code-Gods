/**
 * The warning where a player composes a move (What if; docs/engine-v2/locks.md §7): when the object has locks, one press
 * asks the server which of them the change would break (`lock.test`: the programs run in the sandbox, so it is not
 * worked out in the browser) and says what removing them would cost. Nothing is spent.
 */
import { useState } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { useObjectLocks } from "@/sdk";
import { breakLine } from "./locks-model";

type Call = { mutator: string; site: number; args: Record<string, string> };

export function LockWarning({ objectId, call, noun }: { objectId: string; call: Call; noun: string }) {
  const locks = useObjectLocks(objectId);
  const test = useAffordance("lock.test");
  const key = JSON.stringify(call);
  const [answer, setAnswer] = useState<{ key: string; text: string; breaks: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!locks?.length) return null;
  const fresh = answer?.key === key ? answer : null;
  const ask = () => {
    if (busy) return;
    setBusy(true);
    test.run({ objectId, calls: [call] }).then(r => {
      const line = breakLine(r.breaks.map(b => ({ title: b.words, removeCost: b.energy })));
      setAnswer({ key, breaks: !!line, text: line ?? (r.reason ? `This change is not allowed: ${r.reason}.` : `No lock on this ${noun} refuses this change.`) });
    }, e => setAnswer({ key, breaks: false, text: e instanceof Error ? e.message : String(e) })).finally(() => setBusy(false));
  };
  return (
    <div className="text-xs" data-testid="what-if-locks">
      {fresh ? (
        <p className={fresh.breaks ? "border-l-2 border-amber-500 pl-2" : "text-muted-foreground"} data-testid="text-what-if-lock" data-breaks={fresh.breaks || undefined}>{fresh.text}</p>
      ) : (
        <button type="button" className="underline underline-offset-4" onClick={ask} disabled={busy} data-testid="button-what-if-locks">
          {busy ? "Checking the locks…" : `This ${noun} has ${locks.length} lock${locks.length === 1 ? "" : "s"}: would one refuse this change?`}
        </button>
      )}
    </div>
  );
}
