import { getGetManifestQueryKey, useGetManifest } from "@workspace/api-client-react";
import { useActivityReady, useServerIdle } from "./use-server-idle";

/** The manifest is idle-gated just like room queries; wait for the human wake. */
export function useManifest() {
  const ready = useActivityReady();
  const idle = useServerIdle();
  return useGetManifest({
    query: {
      queryKey: getGetManifestQueryKey(),
      enabled: ready && !idle,
    },
  });
}
