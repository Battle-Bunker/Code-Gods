/**
 * Keeps the player's screen standing: an error in the core (a query failing while the engine is unreachable, or the
 * credential refused) shows a banner instead of taking down the page. Panels have their own boundaries
 * (shell/panel-frame.tsx). Nothing retries on a timer: when Convex reconnects it resubscribes every query, so the core
 * remounts once after a fresh connection (core-boundary-model.ts); "Try again" remounts it on request. A refused
 * credential shows how to reconnect instead.
 */
import { Component, useCallback, useSyncExternalStore, type ErrorInfo, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { clearsOnReconnect, coreErrorKind, type CaughtError } from "./core-boundary-model";

export function CoreBoundary({ children }: { children: ReactNode }) {
  // Only the count of connections made (not every in-flight request): a rise means Convex has resubscribed.
  const convex = useConvex();
  const subscribe = useCallback((onChange: () => void) => convex.subscribeToConnectionState(onChange), [convex]);
  const connectionCount = useSyncExternalStore(subscribe, () => convex.connectionState().connectionCount);
  return <Boundary connectionCount={connectionCount}>{children}</Boundary>;
}

type Props = { connectionCount: number; children: ReactNode };
type State = { error: Error | null; caught: CaughtError | null; attempt: number };

class Boundary extends Component<Props, State> {
  state: State = { error: null, caught: null, attempt: 0 };
  static getDerivedStateFromError(error: Error): Partial<State> { return { error, caught: null }; }
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (!state.error) return null;
    // The connection the error happened on; then, once Convex has connected afresh, one remount to resubscribe.
    if (!state.caught) return { caught: { kind: coreErrorKind(state.error), atConnection: props.connectionCount } };
    return clearsOnReconnect(state.caught, props.connectionCount) ? { error: null, caught: null, attempt: state.attempt + 1 } : null;
  }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn("[core]", error.message, info.componentStack); }
  private retry = () => this.setState(s => ({ error: null, caught: null, attempt: s.attempt + 1 }));
  render() {
    const { error, caught, attempt } = this.state;
    if (!error) return <div key={attempt} className="contents">{this.props.children}</div>;
    const credential = caught?.kind === "credential";
    return (
      <div role="alert" data-testid="banner-core-error" className="m-4 border border-primary p-4 text-sm space-y-2">
        <p className="font-semibold">{credential ? "The engine no longer accepts this client's credential." : "This view failed. It reloads by itself after a lost connection returns, or try again."}</p>
        <p className="font-mono text-xs opacity-70 break-words">{error.message.split("\n")[0].slice(0, 300)}</p>
        {credential
          ? <p className="opacity-80">Reconnect: sign in again (reload this page), or for a player app run <code>pnpm player connect --room CODE</code> again.</p>
          : null}
        <div className="flex gap-2">
          {credential
            ? <button type="button" className="border border-border px-2 py-1 text-xs" data-testid="button-core-reload" onClick={() => window.location.reload()}>Reload</button>
            : <button type="button" className="border border-border px-2 py-1 text-xs" data-testid="button-core-retry" onClick={this.retry}>Try again</button>}
        </div>
      </div>
    );
  }
}
