/**
 * Keeps the dock layout in step with panels.layout, so it follows the player across devices. The server's layout
 * wins when it arrives or changes (another device moved a panel); local changes are pushed, debounced. A read-only
 * credential only follows.
 */
import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { layoutStore } from "./layout";

const DEBOUNCE_MS = 800;

export function useLayoutSync(enabled: boolean, canWrite: boolean) {
  const server = useQuery(api.panels.layout, enabled ? {} : "skip");
  const setLayout = useMutation(api.panels.setLayout);
  const synced = useRef<string>(undefined);

  useEffect(() => {
    if (server === undefined) return;
    const local = JSON.stringify(layoutStore.get());
    if (server === null) {
      // Nothing stored yet: this browser's layout becomes the player's.
      if (synced.current === undefined && canWrite) { synced.current = local; void setLayout({ layout: layoutStore.get() }).catch(() => {}); }
      synced.current ??= local;
      return;
    }
    const remote = JSON.stringify(server);
    if (remote === synced.current) return;
    synced.current = remote;
    if (remote !== local) layoutStore.replace(server);
  }, [server, canWrite, setLayout]);

  useEffect(() => {
    if (!enabled || !canWrite) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = layoutStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const json = JSON.stringify(layoutStore.get());
        if (synced.current === undefined || json === synced.current) return;
        synced.current = json;
        void setLayout({ layout: layoutStore.get() }).catch(error => console.warn("[layout] not saved:", error));
      }, DEBOUNCE_MS);
    });
    return () => { unsubscribe(); if (timer) clearTimeout(timer); };
  }, [enabled, canWrite, setLayout]);
}
