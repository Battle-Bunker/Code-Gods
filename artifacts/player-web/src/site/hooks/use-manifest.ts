import { useEffect } from "react";
import { useAction } from "convex/react";
import { api, useLive } from "@/site/lib/convex";
import type { Manifest } from "@/site/lib/types";

/**
 * The settings manifest (object types, offered instantiations, options, runtimes): a live subscription to
 * `manifest.get`, a query over the document each deploy stores (convex/manifest.ts), held once however many components
 * show it. It updates as the sandboxes boot. `enabled` false (signed out): no subscription.
 */
export function useManifest(enabled = true) {
  const { data, error, isLoading } = useLive(api.manifest.get, enabled ? {} : "skip");
  return { data: (data ?? undefined) as Manifest | undefined, error, isError: !!error, isLoading: enabled && (isLoading || data === null) };
}

/** The users whose sandbox warm-up this page has asked for (once per signed-in user per page load: not a read). */
const warmed = new Set<string>();

/**
 * Once per signed-in session: warm the agent sandboxes (so a game's start finds them ready) and refresh the stored
 * manifest (manifest/node.warm; the null manifest of a deployment that has none yet gets one). Reading the manifest
 * never warms anything.
 */
export function useWarmSandboxes(userId: string | undefined) {
  const warm = useAction(api.manifest.node.warm);
  useEffect(() => {
    if (!userId || warmed.has(userId)) return;
    warmed.add(userId);
    void warm({}).catch(error => { warmed.delete(userId); console.warn("[manifest] warming the sandboxes failed:", error); });
  }, [userId, warm]);
}
