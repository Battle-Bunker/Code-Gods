/**
 * Keeping this page current after a deploy (lib/player-client/src/update.ts): a build the engine serves (with a build
 * id in its index.html) updates itself at a safe moment and keeps the route; a dev server only gets a dismissible note
 * when the engine's functions change (it has its own hot reload).
 * Every failed call is checked for a client-too-old rejection, which updates at once.
 */
import type { ConvexReactClient } from "convex/react";
import { guardConvexClient, ownBuild, startAutoUpdate } from "@workspace/v2-client/update";

export function keepCurrent(client: ConvexReactClient): void {
  const updates = startAutoUpdate({ client, site: "app", reload: ownBuild() !== null });
  guardConvexClient(client, error => updates.reportError(error));
}
