import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/errors";

/**
 * Runs engine calls for a panel: tracks `pending` and toasts refusals. Nothing is refreshed afterwards:
 * every page reads reactive Convex queries, which update by themselves.
 */
export function useRun() {
  const { toast } = useToast();
  const [count, setCount] = useState(0);
  const run = useCallback(<T,>(label: string, call: () => Promise<T>, onOk?: (result: T) => void) => {
    setCount(c => c + 1);
    call().then(
      result => { onOk?.(result); },
      error => { toast({ title: `Action "${label}" refused`, description: errMsg(error), variant: "destructive" }); },
    ).finally(() => setCount(c => c - 1));
  }, [toast]);
  return { run, pending: count > 0 };
}
export type Run = ReturnType<typeof useRun>;
