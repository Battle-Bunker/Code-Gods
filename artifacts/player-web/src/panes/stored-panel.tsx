/**
 * A stored panel as a pane (`panel:<slug>`): its current version's code, run in a sandboxed frame.
 *
 * The iframe (`sandbox="allow-scripts"`: an opaque origin, no same-origin access, no popups, forms or top navigation)
 * loads {base}panel-frame.html, which has its own CSP (connect-src 'none'); the page's CSP (frame-src 'self') stops the
 * frame navigating itself off-origin. The host answers the frame's SDK hooks (./panel-host.tsx); panels have no
 * operations of their own.
 *
 * Handshake: the frame's document posts `ready` (with the nonce from its URL and its SDK version) to this window, once.
 * The host answers `boot` with a MessagePort, and everything after that travels over the port. A document the frame
 * navigates to later does not own the port, so it can read nothing; a second `ready` or a second load event means the
 * frame navigated, and the bridge stops for good.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameScope, useMyPanels, usePanelCode } from "@/sdk";
import { acceptMessage, checkCall, frameVersionProblem, isFrameMessage, MORE_MAX, WATCHES_MAX, type BridgePanel, type HostMessage } from "@/frame/protocol";
import { HostWatches, type HostLink, type HostWatch } from "./panel-host";

export const frameUrl = (nonce: string) => `${import.meta.env.BASE_URL}panel-frame.html#n=${nonce}`;
type FrameState = { kind: "booting" | "ready" | "failed" | "crashed" | "stopped"; message?: string };

const note = (text: string, testId: string) => <p className="p-4 text-sm text-muted-foreground" data-testid={testId}>{text}</p>;

/** The pane: the panel's metadata from the viewer's panel list, then its current version's code. */
export function StoredPanelPane({ slug }: { slug: string }) {
  const panels = useMyPanels();
  const meta = panels?.find(p => p.slug === slug);
  const code = usePanelCode(meta?.enabled ? slug : null, meta?.currentVersion);
  const panel = useMemo<BridgePanel | undefined>(() => (code && meta ? { slug, version: code.version, compiled: code.compiled, title: meta.title } : undefined),
    [code, meta?.title, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  if (panels === undefined) return null;
  if (!meta) return note(`There is no panel "${slug}" any more. Close this pane, or open "Your panels" to write it again.`, "stored-panel-missing");
  if (!meta.enabled) return note(`"${meta.title}" is turned off. Turn it on in "Your panels" to see it here.`, "stored-panel-off");
  if (code === null) return note(`"${meta.title}" has no code to show.`, "stored-panel-missing");
  return <PanelFrame slug={slug} title={meta.title} panel={panel} />;
}

const dark = () => document.documentElement.classList.contains("dark");

function PanelFrame({ slug, title, panel }: { slug: string; title: string; panel: BridgePanel | undefined }) {
  const scope = useGameScope();
  const iframe = useRef<HTMLIFrameElement>(null);
  // One nonce per bridge; the iframe is keyed on it, so another room or game loads a fresh frame document.
  const nonce = useMemo(() => crypto.randomUUID(), [scope.roomId, scope.gameId, scope.seated]); // eslint-disable-line react-hooks/exhaustive-deps
  const loads = useRef(0);
  const [height, setHeight] = useState(120);
  const [state, setState] = useState<FrameState>({ kind: "booting" });
  const [watches, setWatches] = useState<HostWatch[]>([]);
  const latest = useRef({ panel, scope });
  latest.current = { panel, scope };
  // `more` holds each paged watch's loadMore; `pending`, a `more` that came before its watch had mounted.
  const bridge = useRef<{ port?: MessagePort; sent?: string; ready: boolean; stop: (why?: string) => void; boot: () => void;
    more: Map<string, (n: number) => void>; pending: Map<string, number>; watching: Set<string> }>(
    { ready: false, stop: () => {}, boot: () => {}, more: new Map(), pending: new Map(), watching: new Set() });

  const link = useMemo<HostLink>(() => ({
    post: (message: HostMessage) => bridge.current.port?.postMessage(message),
    more: (id, loadMore) => {
      const b = bridge.current;
      if (!loadMore) { b.more.delete(id); return; }
      b.more.set(id, loadMore);
      const n = b.pending.get(id);
      if (n !== undefined) { b.pending.delete(id); loadMore(n); }
    },
  }), []);

  useEffect(() => {
    const frame = () => iframe.current?.contentWindow;
    let stopped = false;
    const b = bridge.current;
    const stop = (why?: string) => {
      if (stopped) return;
      stopped = true;
      b.port?.close();
      b.port = undefined;
      b.more.clear();
      b.pending.clear();
      b.watching.clear();
      setWatches([]);
      if (why) setState({ kind: "stopped", message: why });
    };
    const boot = () => {
      const current = latest.current.panel;
      const target = frame();
      if (!current || !target || stopped || b.port) return;
      const channel = new MessageChannel();
      b.port = channel.port1;
      b.sent = `${current.slug}@${current.version}`;
      channel.port1.onmessage = event => {
        const message = event.data;
        if (stopped || !isFrameMessage(message) || (message as { nonce?: unknown }).nonce !== nonce) return;
        switch (message.type) {
          case "resize": setHeight(Math.min(4000, Math.max(24, Math.ceil(message.height)))); return;
          case "status": setState({ kind: message.status, message: message.message?.slice(0, 2000) }); return;
          case "ready": stop("This panel's frame loaded another page, so it was stopped. Reload the page to run it again."); return;
          case "watch": {
            const call = checkCall(message.hook, message.args);
            const refuse = (text: string) => b.port?.postMessage({ type: "error", id: message.id, message: text } satisfies HostMessage);
            if ("error" in call) { refuse(call.error); return; }
            if (!b.watching.has(message.id) && b.watching.size >= WATCHES_MAX) { refuse(`A panel can read at most ${WATCHES_MAX} things at once.`); return; }
            b.watching.add(message.id);
            setWatches(ws => [...ws.filter(w => w.id !== message.id), { id: message.id, ...call }]);
            return;
          }
          case "unwatch":
            b.watching.delete(message.id); b.more.delete(message.id); b.pending.delete(message.id);
            setWatches(ws => ws.filter(w => w.id !== message.id));
            return;
          case "more": {
            if (!b.watching.has(message.id)) return;
            const n = Math.min(MORE_MAX, Math.max(1, Math.trunc(message.n)));
            const loadMore = b.more.get(message.id);
            if (loadMore) loadMore(n); else b.pending.set(message.id, (b.pending.get(message.id) ?? 0) + n);
            return;
          }
        }
      };
      target.postMessage({ type: "boot", scope: latest.current.scope, panel: current, dark: dark() } satisfies HostMessage, "*", [channel.port2]);
    };
    const onWindowMessage = (event: MessageEvent) => {
      const message = acceptMessage(event, frame(), nonce);
      if (!message || message.type !== "ready") return;
      // One document, one ready. Another one comes from a page the frame navigated to.
      if (b.ready) { stop("This panel's frame loaded another page, so it was stopped. Reload the page to run it again."); return; }
      const problem = frameVersionProblem(message);
      if (problem) { stop(problem); return; }
      b.ready = true;
      boot();
    };
    window.addEventListener("message", onWindowMessage);
    b.ready = false;
    b.boot = boot;
    b.stop = stop;
    loads.current = 0;
    setState({ kind: "booting" });
    return () => { window.removeEventListener("message", onWindowMessage); stop(); };
  }, [nonce]);

  // Code arrives (or a new version): boot the waiting frame, or swap the module in the running one.
  useEffect(() => {
    const b = bridge.current;
    if (!panel || !b.ready) return;
    if (!b.port) { b.boot(); return; }
    const key = `${panel.slug}@${panel.version}`;
    if (b.sent === key) return;
    b.sent = key;
    b.port.postMessage({ type: "load", panel } satisfies HostMessage);
  }, [panel]);

  // The frame element's first load is ours; a later one is a navigation (the sandbox lets a frame navigate itself).
  const onLoad = useCallback(() => { if (++loads.current > 1) bridge.current.stop("This panel's frame loaded another page, so it was stopped. Reload the page to run it again."); }, []);

  if (state.kind === "stopped") return note(state.message ?? "This panel was stopped.", "stored-panel-stopped");
  return (
    <div data-testid={`panel-frame-${slug}`} data-frame-state={state.kind}>
      <iframe key={nonce} ref={iframe} title={title} src={frameUrl(nonce)} sandbox="allow-scripts" onLoad={onLoad} referrerPolicy="no-referrer"
        style={{ width: "100%", height, border: 0, display: "block", background: "transparent" }} />
      {(state.kind === "failed" || state.kind === "crashed") && <p className="sr-only" data-testid={`panel-failed-${slug}`}>{state.message}</p>}
      <HostWatches watches={watches} link={link} />
    </div>
  );
}
