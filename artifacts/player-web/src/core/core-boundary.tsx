/**
 * Keeps the core console standing: an error in the core (most often a query failing while the engine
 * is unreachable or the credential was revoked) shows a banner and retries by itself every few
 * seconds, instead of taking down the page. Panels have their own boundaries (shell/panel-frame.tsx).
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

const RETRY_MS = 3000;
type State = { error: Error | null; attempt: number };

export class CoreBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, attempt: 0 };
  private timer: ReturnType<typeof setTimeout> | undefined;
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[core]", error.message, info.componentStack);
    this.timer = setTimeout(() => this.setState(s => ({ error: null, attempt: s.attempt + 1 })), RETRY_MS);
  }
  componentWillUnmount() { if (this.timer) clearTimeout(this.timer); }
  render() {
    const { error, attempt } = this.state;
    if (!error) return <div key={attempt} className="contents">{this.props.children}</div>;
    const reconnect = /UNAUTHENTICATED|reconnect|revoked/i.test(error.message);
    return (
      <div role="alert" data-testid="banner-core-error" className="m-4 border border-primary p-4 text-sm space-y-1">
        <p className="font-semibold">{reconnect ? "The engine no longer accepts this client's credential." : "Lost contact with the engine."} Retrying…</p>
        <p className="font-mono text-xs opacity-70 break-words">{error.message.split("\n")[0].slice(0, 300)}</p>
        {reconnect && <p className="opacity-80">If it was revoked or expired, run <code>pnpm player connect --room CODE</code> again.</p>}
      </div>
    );
  }
}
