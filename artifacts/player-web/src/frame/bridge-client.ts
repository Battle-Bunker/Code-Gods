/**
 * The frame end of the panel bridge (protocol: src/sdk/bridge-protocol.ts). `ready` goes to the parent window;
 * the host's `boot` brings a MessagePort, and everything after that uses the port. Subscriptions and requests are
 * keyed by id; every message carries the boot nonce.
 */
import type { FrameMessage, HostMessage } from "../sdk/bridge-protocol";

type Parent = { postMessage(message: unknown, targetOrigin: string): void };
type Sub = { onData: (value: unknown) => void; onError: (message: string) => void };

export class BridgeClient {
  private next = 0;
  private subs = new Map<string, Sub>();
  private requests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private queue: FrameMessage[] = [];
  private port: MessagePort | undefined;
  private readonly nonce: string;
  private readonly parent: Parent;
  constructor(nonce: string, parent: Parent) { this.nonce = nonce; this.parent = parent; }

  /** The handshake. The frame's origin is opaque, so its parent can only be addressed with "*"; the host checks source and nonce. */
  ready() { this.parent.postMessage({ type: "ready", nonce: this.nonce }, "*"); }

  /** The host's port (from `boot`): host messages arrive on it, and queued frame messages leave on it. */
  attach(port: MessagePort, onHost: (message: HostMessage) => void) {
    if (this.port) return;
    this.port = port;
    port.onmessage = event => { const message = event.data as HostMessage; if (!this.handle(message)) onHost(message); };
    for (const message of this.queue.splice(0)) this.post(message);
  }

  post(message: FrameMessage) {
    if (!this.port) { this.queue = [...this.queue, message].slice(-100); return; }
    this.port.postMessage({ ...message, nonce: this.nonce });
  }

  subscribe(name: string, args: Record<string, unknown>, hz: number | undefined, onData: Sub["onData"], onError: Sub["onError"]): () => void {
    const id = `s${++this.next}`;
    this.subs.set(id, { onData, onError });
    this.post({ type: "subscribe", id, name, args, hz });
    return () => { if (this.subs.delete(id)) this.post({ type: "unsubscribe", id }); };
  }

  request<T>(message: { type: "command"; envelope: unknown } | { type: "calibration" }): Promise<T> {
    const id = `r${++this.next}`;
    return new Promise<T>((resolve, reject) => {
      this.requests.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.post({ ...message, id });
    });
  }

  /** Route data, errors and results; returns false for messages the runtime handles (boot, load). */
  handle(message: HostMessage): boolean {
    switch (message.type) {
      case "data": this.subs.get(message.id)?.onData(message.value); return true;
      case "error": this.subs.get(message.id)?.onError(message.message); return true;
      case "result": {
        const pending = this.requests.get(message.id);
        if (!pending) return true;
        this.requests.delete(message.id);
        if (message.ok) pending.resolve(message.value);
        else pending.reject(new Error(message.message));
        return true;
      }
      default: return false;
    }
  }
}

let current: BridgeClient | undefined;
export const setBridge = (bridge: BridgeClient) => { current = bridge; };
export function bridge(): BridgeClient {
  if (!current) throw new Error("The panel bridge is not connected");
  return current;
}
