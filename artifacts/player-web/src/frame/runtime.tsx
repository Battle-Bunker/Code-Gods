/**
 * panel-runtime.js: a stored panel's frame ({base}panel-frame.html, a sandboxed iframe with an opaque origin and its
 * own CSP, connect-src 'none'). It owns one React and the v2 `@sdk` (./sdk.ts, answered over the bridge), evaluates the
 * panel's compiled CommonJS (./loader.ts) and renders it inside an error boundary. Built by vite.frame.config.ts.
 */
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { GameScopeProvider } from "../sdk/game";
import * as sdk from "./sdk";
import { BridgeClient, setBridge } from "./bridge-client";
import { createLoader } from "./loader";
import type { BridgePanel, HostMessage, PanelScope } from "./protocol";
import "../index.css";

const nonce = new URLSearchParams(location.hash.slice(1)).get("n") ?? "";
const client = new BridgeClient(nonce, window.parent);
setBridge(client);
const loader = createLoader({ react: React, "react/jsx-runtime": jsxRuntime, "@sdk": sdk });
const mount = document.getElementById("root")!;
const root = createRoot(mount, { onCaughtError: (error, info) => console.warn("[panel]", error, info.componentStack) });
let scope: PanelScope | undefined;

function Problem({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-3 text-sm space-y-1" role="alert" data-testid="panel-problem">
      <p className="font-medium text-destructive">{title}</p>
      <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{message}</pre>
    </div>
  );
}

class Boundary extends React.Component<{ resetKey: string; children: React.ReactNode }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) { return { error }; }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  componentDidCatch(error: Error) { client.post({ type: "status", status: "crashed", message: error.message.slice(0, 2000) }); }
  render() {
    return this.state.error ? <Problem title="This panel stopped with an error" message={this.state.error.message} /> : this.props.children;
  }
}

function render(panel: BridgePanel) {
  if (!scope) return;
  const loaded = loader.load(panel);
  if (loaded.status === "failed") {
    client.post({ type: "status", status: "failed", message: loaded.message.slice(0, 2000) });
    root.render(<Problem title="This panel could not load" message={loaded.message} />);
    return;
  }
  client.post({ type: "status", status: "ready" });
  const { Component: Panel } = loaded.definition;
  root.render(
    <GameScopeProvider scope={scope}>
      <Boundary resetKey={`${panel.slug}@${panel.version}`}>
        <React.Suspense fallback={<p className="p-3 text-xs text-muted-foreground">Loading…</p>}>
          <div className="p-3 text-sm" data-testid="panel-root"><Panel /></div>
        </React.Suspense>
      </Boundary>
    </GameScopeProvider>,
  );
}

// The handshake: one `boot` from the parent window, carrying the port for everything else.
window.addEventListener("message", event => {
  const message = event.data as HostMessage;
  if (event.source !== window.parent || scope || !message || message.type !== "boot" || !event.ports[0]) return;
  scope = message.scope;
  document.documentElement.classList.toggle("dark", !!message.dark);
  client.attach(event.ports[0], m => { if (m.type === "load") render(m.panel); });
  render(message.panel);
});

// The host sizes the iframe to the content.
let lastHeight = -1;
new ResizeObserver(() => {
  const height = Math.ceil(mount.getBoundingClientRect().height);
  if (height !== lastHeight) { lastHeight = height; client.post({ type: "resize", height }); }
}).observe(mount);

client.ready();
