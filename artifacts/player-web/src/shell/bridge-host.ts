/**
 * The host end of one stored panel's bridge (protocol: src/sdk/bridge-protocol.ts). Pure apart from what `deps`
 * injects, so the policy is unit-tested: only allowlisted queries, always for the current room, pushed to the
 * frame at most `hz` times a second (trailing: the latest value is never lost); commands and calibration answer
 * by request id. `dispose()` stops every watch (the panel was removed or its frame unmounted).
 */
import { BRIDGE_QUERIES, clampHz, isFrameMessage, isQueryName, type CalibrationReply, type FrameMessage, type HostMessage, type QueryName } from "../sdk/bridge-protocol.ts";

type Timers = { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
export type HostDeps = {
  roomId: string;
  post(message: HostMessage): void;
  /** Subscribe to a Convex query; returns the unsubscribe. */
  watch(name: QueryName, args: Record<string, unknown>, onValue: (value: unknown) => void, onError: (message: string) => void): () => void;
  /** Run a command envelope (the host validates it and may ask the player first). */
  command(envelope: unknown): Promise<unknown>;
  calibration(): Promise<CalibrationReply>;
  timers?: Timers;
};

const realTimers: Timers = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: h => clearTimeout(h as ReturnType<typeof setTimeout>) };
type Sub = { stop: () => void; period: number; lastSent: number; timer?: unknown; pending?: { value: unknown } };

/**
 * Accept a message event only from `frame` (the panel's own iframe window) with the boot nonce; anything else
 * (another frame, another tab, an extension) is dropped.
 */
export function acceptMessage(event: { source: unknown; data: unknown }, frame: unknown, nonce: string): (FrameMessage & { nonce: string }) | null {
  if (!frame || event.source !== frame || !isFrameMessage(event.data)) return null;
  return (event.data as { nonce?: unknown }).nonce === nonce ? event.data : null;
}

export class BridgeHost {
  private subs = new Map<string, Sub>();
  private disposed = false;
  private readonly timers: Timers;
  private readonly deps: HostDeps;
  constructor(deps: HostDeps) { this.deps = deps; this.timers = deps.timers ?? realTimers; }

  receive(message: FrameMessage): void {
    if (this.disposed) return;
    switch (message.type) {
      case "subscribe": return this.subscribe(message);
      case "unsubscribe": return this.unsubscribe(message.id);
      case "command": return this.answer(message.id, () => this.deps.command(message.envelope));
      case "calibration": return this.answer(message.id, () => this.deps.calibration());
      default: return;
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const id of [...this.subs.keys()]) this.unsubscribe(id);
  }

  private post(message: HostMessage) { if (!this.disposed) this.deps.post(message); }

  private subscribe({ id, name, args, hz }: Extract<FrameMessage, { type: "subscribe" }>) {
    this.unsubscribe(id);
    const shape = isQueryName(name) ? BRIDGE_QUERIES[name] : undefined;
    const sent = shape?.(args && typeof args === "object" ? args : {}, this.deps.roomId);
    if (!shape || !sent) {
      this.post({ type: "error", id, message: `${String(name).slice(0, 80)} is not available to panels` });
      return;
    }
    const sub: Sub = { stop: () => {}, period: 1000 / clampHz(hz), lastSent: -Infinity };
    this.subs.set(id, sub);
    const live = () => this.subs.get(id) === sub;
    const flush = () => {
      sub.timer = undefined;
      if (!sub.pending || !live()) return;
      const { value } = sub.pending;
      sub.pending = undefined;
      sub.lastSent = this.timers.now();
      this.post({ type: "data", id, value });
    };
    sub.stop = this.deps.watch(name as QueryName, sent, value => {
      if (!live()) return;
      sub.pending = { value };
      const wait = sub.lastSent + sub.period - this.timers.now();
      if (wait <= 0) { if (sub.timer !== undefined) this.timers.clearTimeout(sub.timer); flush(); }
      else if (sub.timer === undefined) sub.timer = this.timers.setTimeout(flush, wait);
    }, message => { if (live()) this.post({ type: "error", id, message }); });
  }

  private unsubscribe(id: string) {
    const sub = this.subs.get(id);
    if (!sub) return;
    this.subs.delete(id);
    if (sub.timer !== undefined) this.timers.clearTimeout(sub.timer);
    sub.stop();
  }

  private answer(id: string, run: () => Promise<unknown>) {
    run().then(value => this.post({ type: "result", id, ok: true, value }),
      (error: unknown) => this.post({ type: "result", id, ok: false, message: messageOf(error) }));
  }
}

/** A ConvexError's own message, else the error's message (never a stack). */
export function messageOf(error: unknown): string {
  const data = (error as { data?: unknown })?.data;
  if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") return (data as { message: string }).message;
  if (typeof data === "string") return data;
  return error instanceof Error ? error.message : String(error);
}
