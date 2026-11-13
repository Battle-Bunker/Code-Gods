/**
 * The ended game's two views, in the replay's header: "Back to the results" while the player's own panes show, and
 * "Show my panes" while the results and the timeline do (also offered in the results pane, which can be closed), so
 * there is always a way to the other view (dock/store.ts).
 */
import { useDock, useDockStore } from "./store";

export function BackToResults() {
  const store = useDockStore();
  const { myPanes, hiddenPanes } = useDock();
  // The other way too, here as well as in the results pane: closing that pane must not leave the player with no button.
  if (!myPanes && hiddenPanes) {
    return (
      <button type="button" data-testid="button-show-my-panes-header" onClick={() => store.showMyPanes()}
        className="border border-[hsl(var(--input))] px-3 py-1 text-sm font-semibold hover:bg-muted">Show my panes</button>
    );
  }
  if (!myPanes) return null;
  return (
    <button type="button" data-testid="button-back-to-results" onClick={() => store.showResults()}
      className="bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground hover:opacity-90">Back to the results</button>
  );
}
