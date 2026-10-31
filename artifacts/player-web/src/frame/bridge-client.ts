/**
 * The frame end of the panel bridge (protocol: src/sdk/bridge-protocol.ts). Subscriptions and requests are
 * keyed by id; every message carries the boot nonce, and only messages from the parent window are handled.
 */
import type { FrameMessage, HostMessage } from "../sdk/bridge-protocol";

type Target = { postMessage(message: unknown, targetOrigin: string): void };
type Sub = { onData: (value: unknown) => void; onError: (message: string) => void };

export class BridgeClient {
  private next = 0;
  private subs = new Map<string, Sub>();
  private requests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly nonce: string;
  private readonly target: Target;
  constructor(nonce: string, target: Target) { this.nonce = nonce; this.target = target; }

  /** The frame's origin is opaque, so its parent can only be addressed with "*"; the host checks source and nonce. */
  post(message: FrameMessage) { this.target.postMessage({ ...message, nonce: this.nonce }, "*"); }

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
