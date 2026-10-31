import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/lib/convex";
import type { Manifest } from "@/lib/types";

/**
 * The settings manifest (object types, offered instantiations, options, runtimes). It is a
 * Convex action, not a reactive query; it only changes with a deploy, so one load per page session.
 */
let cached: Promise<Manifest> | null = null;

export function useManifest() {
  const get = useAction(api.manifest.get);
  const [data, setData] = useState<Manifest | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    cached ??= get({}).then(m => m as unknown as Manifest);
    cached.then(m => { if (live) { setData(m); setError(null); } },
      e => { cached = null; if (live) setError(e instanceof Error ? e : new Error(String(e))); });
    return () => { live = false; };
  }, [get, nonce]);
  const refetch = useCallback(() => { cached = null; setError(null); setNonce(n => n + 1); }, []);
  return { data, error, isError: !!error, isLoading: !data && !error, refetch };
}
