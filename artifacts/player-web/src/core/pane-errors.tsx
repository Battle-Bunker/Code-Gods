/**
 * One pane's failed live queries, said above its content: the content stays mounted (so its subscriptions stay live
 * and the line goes by itself when a value arrives), "Try again" remounts it. The dock and the other panes are
 * untouched. Used by the built-in panels (core/panels/index.tsx) and by file panels (dock/panels.tsx). Failures are
 * counted per holder (sdk/query-errors.ts): several components of one pane may share a failed query.
 */
import { useMemo, useState, type ReactNode } from "react";
import { PaneErrorContext } from "@/sdk/pane-error-context";
import { NO_ERRORS, holdError, lasting, paneErrorLine, releaseError, type ErrorRecord } from "@/sdk/query-errors";

export function PaneErrors({ children }: { children: ReactNode }) {
  const [errors, setErrors] = useState(NO_ERRORS);
  const [attempt, setAttempt] = useState(0);
  const record = useMemo<ErrorRecord>(() => ({
    hold: (key, message) => setErrors(e => holdError(e, key, message)),
    release: key => setErrors(e => releaseError(e, key)),
  }), []);
  const messages = [...errors.failed.values()].map(f => f.message);
  const line = paneErrorLine(messages);
  return (
    <PaneErrorContext.Provider value={record}>
      {line && (
        <p role="status" data-testid="text-pane-error" className="mb-2 flex flex-wrap items-center gap-2 border-l-2 border-destructive pl-2 text-xs text-muted-foreground">
          <span>{line}</span>
          {/* Trying again helps only for a failure that can pass; lost access or a sign-out does not. */}
          {!messages.some(m => lasting(m)) && <button type="button" className="underline" data-testid="button-pane-retry" onClick={() => setAttempt(a => a + 1)}>Try again</button>}
        </p>
      )}
      <div key={attempt} className="contents">{children}</div>
    </PaneErrorContext.Provider>
  );
}
