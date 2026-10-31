/**
 * panel-runtime.js: the stored-panel frame (/player/panel-frame.html, a sandboxed iframe with an opaque origin and
 * its own CSP, connect-src 'none'). It owns one React and one SDK (built with the bridge transport), evaluates the
 * panel's compiled CommonJS with src/frame/loader.ts and renders it inside an error boundary. Everything the panel
 * reads or does goes through the host over postMessage (src/sdk/bridge-protocol.ts).
 */
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import * as sdk from "../sdk/index";
import { RoomProvider } from "../sdk/context";
import { PanelBoundary, PanelError } from "../shell/panel-frame";
import type { BridgePanel, BridgeRoom, HostMessage } from "../sdk/bridge-protocol";
import { BridgeClient, setBridge } from "./bridge-client";
import { createLoader } from "./loader";
import "../index.css";

const nonce = new URLSearchParams(location.hash.slice(1)).get("n") ?? "";
const client = new BridgeClient(nonce, window.parent);
setBridge(client);
const loader = createLoader({ react: React, "react/jsx-runtime": jsxRuntime, "@sdk": sdk });
const mount = document.getElementById("root")!;
const root = createRoot(mount, { onCaughtError: (error, info) => console.warn("[panel]", error, info.componentStack) });
let room: BridgeRoom | undefined;

function render(panel: BridgePanel) {
  if (!room) return;
  const loaded = loader.load(panel.slug, panel.version, panel.compiled);
  const file = `stored:${panel.slug}`;
  if (loaded.status === "failed") {
    client.post({ type: "status", status: "failed", message: loaded.message.slice(0, 2000) });
    root.render(<PanelError file={file} title="This panel failed to load" message={loaded.message} />);
    return;
  }
  client.post({ type: "status", status: "ready" });
  const { Component: Panel } = loaded.definition;
  root.render(
    <RoomProvider room={room}>
      <PanelBoundary resetKey={loaded.module} file={file}
        onError={error => client.post({ type: "status", status: "crashed", message: error.message.slice(0, 2000) })}>
        <React.Suspense fallback={<p className="text-[12px] opacity-60">Loading…</p>}>
          <Panel />
        </React.Suspense>
      </PanelBoundary>
    </RoomProvider>,
  );
}

window.addEventListener("message", event => {
  if (event.source !== window.parent) return;
  const message = event.data as HostMessage;
  if (!message || typeof message !== "object" || typeof message.type !== "string") return;
  if (client.handle(message)) return;
  if (message.type === "boot") {
    room = message.room;
    document.documentElement.classList.toggle("dark", !!message.theme?.dark);
    render(message.panel);
  } else if (message.type === "load") {
    render(message.panel);
  }
});

// The host sizes the iframe to the content; drag and resize stay in the host's header.
let lastHeight = -1;
new ResizeObserver(() => {
  const height = Math.ceil(mount.getBoundingClientRect().height);
  if (height !== lastHeight) { lastHeight = height; client.post({ type: "resize", height }); }
}).observe(mount);

client.post({ type: "ready" });
