/**
 * The frame end of the panel bridge (protocol: ./protocol.ts). `ready` goes to the parent window; the host's `boot`
 * brings a MessagePort, and everything after that uses the port. Each (hook, arguments) is one watch, shared by every
 * component of the panel that calls it, and dropped when the last one unmounts.
 */
import { PANEL_SDK } from "../sdk/panel.ts";
import { MORE_MAX, type ActOutcome, type FrameMessage, type HookName, type HostMessage } from "./protocol.ts";

type Parent = { postMessage(message: unknown, targetOrigin: string): void };
export interface Snapshot { value?: unknown; error?: string }
export interface Watch {
  subscribe(listener: () => void): () => void;
  get(): Snapshot;
  /** A paged hook's next page. */
  more(n: number): void;
}

export class BridgeClient {
  private next = 0;
  private watches = new Map<string, Watch & { set(s: Snapshot): void }>();
  private byId = new Map<string, Watch & { set(s: Snapshot): void }>();
  private queue: FrameMessage[] = [];
  private port: MessagePort | undefined;
  private acts = new Map<string, (outcome: ActOutcome) => void>();
  private readonly nonce: string;
  private readonly parent: Parent;
  constructor(nonce: string, parent: Parent) { this.nonce = nonce; this.parent = parent; }

  /** The handshake. The frame's origin is opaque, so its parent can only be addressed with "*"; the host checks source and nonce. */
  ready() { this.parent.postMessage({ type: "ready", sdk: PANEL_SDK, nonce: this.nonce }, "*"); }

  /** The host's port (from `boot`): host messages arrive on it, and queued frame messages leave on it. */
  attach(port: MessagePort, onHost: (message: HostMessage) => void) {
    if (this.port) return;
    this.port = port;
    port.onmessage = event => {
      const message = event.data as HostMessage;
      if (message.type === "value") this.byId.get(message.id)?.set({ value: message.value });
      else if (message.type === "error") this.byId.get(message.id)?.set({ error: message.message });
      else if (message.type === "acted") { const done = this.acts.get(message.id); this.acts.delete(message.id); done?.(message.outcome); }
      else onHost(message);
    };
    for (const message of this.queue.splice(0)) this.post(message);
  }

  post(message: FrameMessage) {
    // Before the port: kept in order (a panel's first render, so bounded by what the panel itself asks for).
    if (!this.port) { this.queue.push(message); return; }
    this.port.postMessage({ ...message, nonce: this.nonce });
  }

  /** Asks the host to do something as the player (it may ask the player first); resolves with the outcome. */
  act(op: string, args: Record<string, unknown>): Promise<ActOutcome> {
    const id = `a${++this.next}`;
    return new Promise(resolve => { this.acts.set(id, resolve); this.post({ type: "act", id, op, args }); });
  }

  /** The watch of one hook call; the host starts it with the first listener and stops it after the last. */
  watch(hook: HookName, args: unknown[]): Watch {
    const key = `${hook}:${JSON.stringify(args)}`;
    const existing = this.watches.get(key);
    if (existing) return existing;
    let snapshot: Snapshot = {};
    const listeners = new Set<() => void>();
    let id: string | null = null;
    const w = {
      get: () => snapshot,
      set: (s: Snapshot) => { snapshot = s; for (const l of listeners) l(); },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        if (id === null) {
          this.watches.set(key, w);
          id = `w${++this.next}`;
          this.byId.set(id, w);
          this.post({ type: "watch", id, hook, args });
        }
        return () => {
          listeners.delete(listener);
          if (listeners.size || id === null) return;
          this.post({ type: "unwatch", id });
          this.byId.delete(id);
          this.watches.delete(key);
          id = null;
        };
      },
      more: (n: number) => { if (id !== null) this.post({ type: "more", id, n: Math.min(MORE_MAX, Math.max(1, Math.trunc(n) || 1)) }); },
    };
    this.watches.set(key, w);
    return w;
  }
}

let current: BridgeClient | undefined;
export const setBridge = (bridge: BridgeClient) => { current = bridge; };
export function bridge(): BridgeClient {
  if (!current) throw new Error("The panel bridge is not connected.");
  return current;
}
