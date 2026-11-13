/**
 * "Back to the results", in the replay's header: shown while an ended game shows the player's own panes ("Show my
 * panes" in the results), so there is always a way back to the results with the timeline (dock/store.ts).
 */
import { useDock, useDockStore } from "./store";

export function BackToResults() {
  const store = useDockStore();
  const { myPanes } = useDock();
  if (!myPanes) return null;
  return (
    <button type="button" data-testid="button-back-to-results" onClick={() => store.showResults()}
      className="bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground hover:opacity-90">Back to the results</button>
  );
}
