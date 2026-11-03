import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/site/lib/convex";
import type { Manifest } from "@/site/lib/types";

/**
 * The settings manifest (object types, offered instantiations, options, runtimes). It is a
 * Convex action, not a reactive query; it only changes with a deploy, so one load per page session.
 */
let cached: Promise<Manifest> | null = null;

/** `enabled` false (signed out): no request; the manifest is for signed-in callers. */
export function useManifest(enabled = true) {
  const get = useAction(api.manifest.get);
  const [data, setData] = useState<Manifest | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    cached ??= get({}).then(m => m as unknown as Manifest);
    cached.then(m => { if (live) { setData(m); setError(null); } },
      e => { cached = null; if (live) setError(e instanceof Error ? e : new Error(String(e))); });
    return () => { live = false; };
  }, [get, nonce, enabled]);
  const refetch = useCallback(() => { cached = null; setError(null); setNonce(n => n + 1); }, []);
  return { data: enabled ? data : undefined, error, isError: !!error, isLoading: enabled && !data && !error, refetch };
}
