/**
 * A panel in a sandboxed frame: stored panels always, file panels when the player turns on "run sandboxed".
 *
 * The iframe (`sandbox="allow-scripts"`: an opaque origin, no same-origin access, no popups, forms or top
 * navigation) loads /player/panel-frame.html, which has its own CSP (connect-src 'none'). The host serves it over
 * a BridgeHost: the SDK's read queries for this room, throttled per hz; commands, with a host-rendered
 * confirmation for chat, summon, destroy and pause; and the evaluator's calibration tables once.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { envelopeSchema, type Envelope } from "@workspace/player-client";
import { useRoom } from "@/sdk/context";
import { QUERY_REFS, loadTables } from "@/sdk/transport";
import type { BridgePanel, HostMessage } from "@/sdk/bridge-protocol";
import { acceptMessage, BridgeHost } from "./bridge-host";
import { policyStore } from "./policy-store";
import type { PanelInfo } from "./action-policy";
import { PanelError } from "./panel-frame";
import type { PanelEntry } from "./panel-store";

export const frameUrl = (nonce: string) => `${import.meta.env.BASE_URL}panel-frame.html#n=${nonce}`;
type Code = { panel: BridgePanel } | { error: string } | undefined;
type FrameState = "booting" | "ready" | "failed" | "crashed" | "navigated";

/** A stored panel: its current version's code from panels.code (immutable per version, so cached by Convex). */
export function StoredPanelBody({ entry }: { entry: PanelEntry }) {
  const meta = entry.stored!;
  const code = useQuery(api.panels.code, { slug: meta.slug, version: meta.currentVersion });
  const panel = useMemo<Code>(() => code && { panel: { slug: meta.slug, version: code.version, compiled: code.compiled, title: meta.title } },
    [code, meta.slug, meta.title]);
  const info = useMemo<PanelInfo>(() => ({ key: entry.file, currentVersion: meta.currentVersion, lastForeignVersion: meta.lastForeignVersion }),
    [entry.file, meta.currentVersion, meta.lastForeignVersion]);
  return <SandboxedPanel file={entry.file} title={meta.title} code={panel} info={info} />;
}

/**
 * A file panel run sandboxed (dev server only): the dev server compiles src/panels/<file> with the same compiler
 * the engine uses on save, so this proves the file works as a stored panel. Re-fetched on every registry update.
 */
export function SandboxedFilePanelBody({ entry, generation }: { entry: PanelEntry; generation: number }) {
  const [code, setCode] = useState<Code>();
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
  const info = useMemo<PanelInfo>(() => ({ key: `file:${entry.id}`, currentVersion: 0, lastForeignVersion: 0 }), [entry.id]);
  return <SandboxedPanel file={entry.file} title={entry.id} code={code} info={info} />;
}

function SandboxedPanel({ file, title, code, info }: { file: string; title: string; code: Code; info: PanelInfo }) {
  const room = useRoom();
  const convex = useConvex();
  const iframe = useRef<HTMLIFrameElement>(null);
  const nonce = useMemo(() => crypto.randomUUID(), []);
  const [height, setHeight] = useState(80);
  const [state, setState] = useState<{ kind: FrameState; message?: string }>({ kind: "booting" });
  const host = useRef<BridgeHost>(undefined);
  const latest = useRef({ code, info, title });
  latest.current = { code, info, title };
  const booted = useRef(false);
  const sentVersion = useRef<string>(undefined);

  useEffect(() => {
    const frame = () => iframe.current?.contentWindow;
    const post = (message: HostMessage) => frame()?.postMessage(message, "*");
    const bridge = new BridgeHost({
      roomId: room.roomId,
      post,
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
    host.current = bridge;
    const onMessage = (event: MessageEvent) => {
      const message = acceptMessage(event, frame(), nonce);
      if (!message) return;
      if (message.type === "ready") {
        booted.current = true;
        const current = latest.current.code;
        if (current && "panel" in current) {
          sentVersion.current = `${current.panel.slug}@${current.panel.version}`;
          post({ type: "boot", room, panel: current.panel, theme: { dark: document.documentElement.classList.contains("dark") } });
        }
      } else if (message.type === "resize") {
        if (typeof message.height === "number") setHeight(Math.min(4000, Math.max(24, Math.ceil(message.height))));
      } else if (message.type === "status") {
        setState({ kind: message.status, message: typeof message.message === "string" ? message.message : undefined });
      } else {
        bridge.receive(message);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      bridge.dispose();
      policyStore.dropPanel(latest.current.info.key);
    };
  }, [convex, room, nonce]);

  // A new version: send it to the running frame (it swaps the module; the frame and its subscriptions stay).
  useEffect(() => {
    if (!code || !("panel" in code) || !booted.current) return;
    const key = `${code.panel.slug}@${code.panel.version}`;
    if (sentVersion.current === key) return;
    const first = sentVersion.current === undefined;
    sentVersion.current = key;
    iframe.current?.contentWindow?.postMessage(first
      ? { type: "boot", room, panel: code.panel, theme: { dark: document.documentElement.classList.contains("dark") } } satisfies HostMessage
      : { type: "load", panel: code.panel } satisfies HostMessage, "*");
  }, [code, room]);

  // The frame may navigate itself away (the sandbox allows that much). Its first load is ours; on any later one the
  // bridge stops and the frame is removed, so nothing more reaches whatever document it loaded.
  const loads = useRef(0);
  const onLoad = () => {
    loads.current++;
    if (loads.current > 1) { host.current?.dispose(); setState({ kind: "navigated" }); }
  };

  if (code && "error" in code) return <PanelError file={file} title="This panel does not compile" message={code.error} />;
  if (state.kind === "navigated") {
    return <PanelError file={file} title="This panel tried to navigate away and was stopped" message="Its frame loaded another page, so it was closed. Reload the client to run it again." />;
  }
  return (
    <div data-testid={`panel-frame-${file}`} data-frame-state={state.kind}>
      <iframe ref={iframe} title={title} src={frameUrl(nonce)} sandbox="allow-scripts" onLoad={onLoad}
        referrerPolicy="no-referrer" style={{ width: "100%", height, border: 0, display: "block", background: "transparent" }} />
      {state.kind === "failed" && <p className="sr-only" data-testid={`panel-failed-${file}`}>{state.message}</p>}
    </div>
  );
}
