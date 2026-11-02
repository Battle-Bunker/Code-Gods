/**
 * Keeping this page current after a deploy (lib/player-client/src/update.ts): a hosted build (`/client/`, with a build
 * id in its index.html) updates itself at a safe moment and keeps the route; a dev server only gets a dismissible note
 * when the engine's functions change (it has its own hot reload). The assistant's draft is saved across the reload.
 * Every failed call is checked for a client-too-old rejection, which updates at once.
 */
import type { ConvexReactClient } from "convex/react";
import { guardConvexClient, ownBuild, registerDraft, startAutoUpdate } from "@workspace/player-client/update";
import { composer } from "./chat/composer";

export function keepCurrent(client: ConvexReactClient): void {
  const updates = startAutoUpdate({ client, site: "player", reload: ownBuild() !== null });
  guardConvexClient(client, error => updates.reportError(error));
  registerDraft({ key: "assistant", selector: "[data-testid=input-assistant]", read: () => composer.get().draft, write: text => composer.setDraft(text) });
}
