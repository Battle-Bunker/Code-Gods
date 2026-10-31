/**
 * A panel in a sandboxed frame: stored panels always, file panels when the player turns on "run sandboxed".
 *
 * The iframe (`sandbox="allow-scripts"`: an opaque origin, no same-origin access, no popups, forms or top
 * navigation) loads /player/panel-frame.html, which has its own CSP (connect-src 'none'); the page's CSP (frame-src
 * 'self', in a build and in a dev server: vite/csp.ts) stops the frame navigating itself off-origin. The host serves it over
 * a BridgeHost: the SDK's read queries for this room, throttled per hz; commands, with a host-rendered
 * confirmation for chat, summon, destroy and pause; and the evaluator's calibration tables once.
 *
 * Handshake: the frame's document posts `ready` (with the nonce from its URL) to the parent window, once. The host
 * answers `boot` with a MessagePort, and everything after that travels over the port. A document the frame
 * navigates to later does not own the port, so it can neither read the player's data nor send commands; a second
 * `ready` or a second load event means the frame navigated, and the bridge stops for good.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { envelopeSchema, type Envelope } from "@workspace/player-client";
import { useRoom } from "@/sdk/context";
import { QUERY_REFS, loadTables } from "@/sdk/transport";
import { isFrameMessage, type BridgePanel, type HostMessage } from "@/sdk/bridge-protocol";
import { acceptMessage, BridgeHost } from "./bridge-host";
import { policyStore } from "./policy-store";
import type { PanelInfo } from "./action-policy";
import { PanelError } from "./panel-frame";
import { policyKey } from "./registry-merge";
import type { PanelEntry } from "./panel-store";

export const frameUrl = (nonce: string) => `${import.meta.env.BASE_URL}panel-frame.html#n=${nonce}`;
type FrameState = "booting" | "ready" | "failed" | "crashed" | "navigated";

/** A stored panel: its current version's code from panels.code (immutable per version, so cached by Convex). */
export function StoredPanelBody({ entry }: { entry: PanelEntry }) {
  const meta = entry.stored!;
  const code = useQuery(api.panels.code, { slug: meta.slug, version: meta.currentVersion });
  const panel = useMemo<BridgePanel | undefined>(() => code && { slug: meta.slug, version: code.version, compiled: code.compiled, title: meta.title },
    [code, meta.slug, meta.title]);
  const key = policyKey(entry);
  const info = useMemo<PanelInfo>(() => ({ key, currentVersion: meta.currentVersion, lastForeignVersion: meta.lastForeignVersion }),
    [key, meta.currentVersion, meta.lastForeignVersion]);
  return <SandboxedPanel file={entry.file} title={meta.title} panel={panel} info={info} />;
}

/**
 * A file panel run sandboxed (dev server only): the dev server compiles src/panels/<file> with the same compiler
 * the engine uses on save, so this proves the file works as a stored panel. Re-fetched on every registry update.
 */
export function SandboxedFilePanelBody({ entry, generation }: { entry: PanelEntry; generation: number }) {
  const [code, setCode] = useState<{ panel: BridgePanel } | { error: string }>();
  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}__codegods/panel-compiled?file=${encodeURIComponent(entry.file)}`, { cache: "no-store" })
      .then(r => r.json() as Promise<{ ok: boolean; compiled?: string; sourceHash?: string; diagnostics?: { line: number; column: number; message: string }[]; error?: string }>)
      .then(body => {
        if (!live) return;
        if (body.ok && body.compiled) setCode({ panel: { slug: entry.id, version: body.sourceHash!.slice(0, 12), compiled: body.compiled, title: entry.id } });
        else setCode({ error: body.error ?? (body.diagnostics ?? []).map(d => `${entry.file}:${d.line}:${d.column} ${d.message}`).join("\n") });
      }, error => { if (live) setCode({ error: String(error) }); });
    return () => { live = false; };
  }, [entry.file, entry.id, generation]);
  const key = policyKey(entry);
  const info = useMemo<PanelInfo>(() => ({ key, currentVersion: 0, lastForeignVersion: 0 }), [key]);
  // A compile error replaces the frame; the fixed version then starts a fresh one.
  if (code && "error" in code) return <PanelError file={entry.file} title="This panel does not compile" message={code.error} />;
  return <SandboxedPanel file={entry.file} title={entry.id} panel={code?.panel} info={info} />;
}

const dark = () => document.documentElement.classList.contains("dark");

function SandboxedPanel({ file, title, panel, info }: { file: string; title: string; panel: BridgePanel | undefined; info: PanelInfo }) {
  const room = useRoom();
  const convex = useConvex();
  const iframe = useRef<HTMLIFrameElement>(null);
  // One nonce per bridge. The iframe is keyed on it: when the bridge restarts (another room or client, or a Fast
  // Refresh), a fresh frame document loads and says `ready` again; the old one would never repeat it.
  const nonce = useMemo(() => crypto.randomUUID(), [convex, room]);
  const loads = useRef(0);
  const [height, setHeight] = useState(80);
  const [state, setState] = useState<{ kind: FrameState; message?: string }>({ kind: "booting" });
  const latest = useRef({ panel, info });
  latest.current = { panel, info };
  // The bridge of this frame element: its port (after boot), the version sent, and a stop switch.
  const link = useRef<{ port?: MessagePort; sent?: string; ready: boolean; stop: () => void; boot: () => void }>({ ready: false, stop: () => {}, boot: () => {} });

  useEffect(() => {
    const frame = () => iframe.current?.contentWindow;
    let port: MessagePort | undefined;
    let stopped = false;
    const bridge = new BridgeHost({
      roomId: room.roomId,
      post: message => port?.postMessage(message),
      watch(name, args, onValue, onError) {
        const watch = convex.watchQuery(QUERY_REFS[name], args as never);
        const read = () => {
          try { const value = watch.localQueryResult(); if (value !== undefined) onValue(value); }
          catch (error) { onError(error instanceof Error ? error.message.split("\n")[0] : String(error)); }
        };
        const stop = watch.onUpdate(read);
        read();
        return stop;
      },
      async command(raw) {
        const parsed = envelopeSchema.safeParse(raw);
        if (!parsed.success) throw new Error("Invalid command envelope");
        const envelope: Envelope = parsed.data;
        if (room.permission === "read") throw new Error("Read-only authorization cannot submit commands");
        const approved = await policyStore.ask(latest.current.info, envelope.command as { type: string } & Record<string, unknown>);
        if (!approved) throw new Error("The player declined this action");
        return convex.action(api.commands.submit, { roomId: room.roomId, envelope });
      },
      async calibration() {
        const mine = await convex.query(api.player.myUtility, { roomId: room.roomId });
        if (!mine) throw new Error("You are not seated in the current game");
        const tables = await loadTables(mine.settings, mine.utility);
        return { key: `${mine.gameId}:${mine.godId}`, settings: mine.settings, utility: mine.utility, ...tables };
      },
    });
    const stop = (navigated: boolean) => {
      if (stopped) return;
      stopped = true;
      bridge.dispose();
      port?.close();
      port = undefined;
      link.current.port = undefined;
      policyStore.dropPanel(latest.current.info.key);
      if (navigated) setState({ kind: "navigated" });
    };
    link.current = { ready: false, stop: () => stop(true), boot: () => {} };
    const boot = () => {
      const current = latest.current.panel;
      const target = frame();
      if (!current || !target || stopped || link.current.port) return;
      const channel = new MessageChannel();
      port = channel.port1;
      link.current.port = port;
      link.current.sent = `${current.slug}@${current.version}`;
      port.onmessage = event => {
        const message = event.data;
        if (stopped || !isFrameMessage(message) || (message as { nonce?: unknown }).nonce !== nonce) return;
        if (message.type === "resize") {
          if (typeof message.height === "number") setHeight(Math.min(4000, Math.max(24, Math.ceil(message.height))));
        } else if (message.type === "status") {
          setState({ kind: message.status, message: typeof message.message === "string" ? message.message : undefined });
        } else if (message.type === "ready") {
          stop(true);
        } else {
          bridge.receive(message);
        }
      };
      target.postMessage({ type: "boot", room, panel: current, theme: { dark: dark() } } satisfies HostMessage, "*", [channel.port2]);
    };
    const onWindowMessage = (event: MessageEvent) => {
      const message = acceptMessage(event, frame(), nonce);
      if (!message || message.type !== "ready") return;
      // One document, one ready. Another one comes from a page the frame navigated to.
      if (link.current.ready) { stop(true); return; }
      link.current.ready = true;
      boot();
    };
    window.addEventListener("message", onWindowMessage);
    link.current.boot = boot;
    loads.current = 0;
    setState(s => s.kind === "navigated" ? s : { kind: "booting" });
    return () => { window.removeEventListener("message", onWindowMessage); stop(false); };
  }, [convex, room, nonce]);

  // Code arrives (or a new version): boot the waiting frame, or swap the module in the running one.
  useEffect(() => {
    if (!panel || !link.current.ready) return;
    if (!link.current.port) { link.current.boot(); return; }
    const key = `${panel.slug}@${panel.version}`;
    if (link.current.sent === key) return;
    link.current.sent = key;
    link.current.port.postMessage({ type: "load", panel } satisfies HostMessage);
  }, [panel]);

  // The frame element's first load is ours; any later one is a navigation (the sandbox allows a frame to
  // navigate itself), so the bridge stops and nothing more reaches whatever document it loaded.
  const onLoad = () => { if (++loads.current > 1) link.current.stop(); };

  if (state.kind === "navigated") {
    return <PanelError file={file} title="This panel tried to navigate away and was stopped" message="Its frame loaded another page, so it was closed. Reload the client to run it again." />;
  }
  return (
    <div data-testid={`panel-frame-${file}`} data-frame-state={state.kind}>
      <iframe key={nonce} ref={iframe} title={title} src={frameUrl(nonce)} sandbox="allow-scripts" onLoad={onLoad}
        referrerPolicy="no-referrer" style={{ width: "100%", height, border: 0, display: "block", background: "transparent" }} />
      {state.kind === "failed" && <p className="sr-only" data-testid={`panel-failed-${file}`}>{state.message}</p>}
    </div>
  );
}
