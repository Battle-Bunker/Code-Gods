/**
 * The host side of the channel (spec §6.5): one JSON request in, one JSON reply out, synchronously. The channel
 * parses and shape-checks requests, enforces the per-act host-call cap and the message size, turns a host's
 * exception into a host error, sums the read bits the replies charge and keeps the act's transcript. It never
 * throws: whatever the guest sends, it gets a reply.
 */
import { HOST_OPS, type HostReply, type HostRequest } from "./agent-api.ts";
import { LIMITS } from "./limits.ts";

export interface HostContext {
  /** Host calls the act may still make after this one. */
  hostCallsLeft: number;
}

/** What the engine implements (an in-memory one for tests: fake-host.ts). Called synchronously, once per request. */
export interface AgentHost {
  handle(request: HostRequest, context: HostContext): HostReply;
}

export interface TranscriptEntry {
  request: HostRequest;
  reply: HostReply;
}

const bytes = (text: string) => Buffer.byteLength(text, "utf8");
const failure = (error: string): HostReply => ({ ok: false, error });

export class Channel {
  readonly transcript: TranscriptEntry[] = [];
  /** Read bits charged by the replies so far (the receipts' sum). */
  readBits = 0;
  private used = 0;
  private readonly host: AgentHost;
  private readonly cap: number;
  constructor(host: AgentHost, cap: number) { this.host = host; this.cap = cap; }

  /** One request's JSON text → the reply's JSON text. */
  call(text: string): string {
    let request: unknown;
    try { request = JSON.parse(text); }
    catch { return JSON.stringify(failure("the request is not JSON")); }
    let reply = this.answer(request), out: string;
    try { out = JSON.stringify(reply); }
    catch { reply = failure("the host failed: its reply is not JSON data"); out = JSON.stringify(reply); }
    if (bytes(out) > LIMITS.messageBytes) { reply = failure(`the reply is over ${LIMITS.messageBytes} bytes`); out = JSON.stringify(reply); }
    // Only a reply the agent receives charges its receipt.
    if (reply.ok) this.readBits += reply.bits;
    this.transcript.push({ request: request as HostRequest, reply: JSON.parse(out) as HostReply });
    return out;
  }

  private answer(request: unknown): HostReply {
    const op = (request as { op?: unknown } | null)?.op;
    if (typeof request !== "object" || request === null || Array.isArray(request) || !HOST_OPS.includes(op as HostRequest["op"])) {
      return failure(`a request is an object whose op is one of ${HOST_OPS.join(", ")}`);
    }
    if (this.used >= this.cap) return failure(`the host-call cap (${this.cap} calls per act) is reached`);
    this.used++;
    let reply: HostReply;
    try { reply = this.host.handle(request as HostRequest, { hostCallsLeft: this.cap - this.used }); }
    catch (error) { return failure(`the host failed: ${String((error as Error)?.message ?? error).slice(0, 500)}`); }
    if (reply?.ok === true) {
      if (!(typeof reply.bits === "number" && Number.isFinite(reply.bits) && reply.bits >= 0)) return failure("the host failed: a reply without a read receipt");
      return reply;
    }
    if (reply?.ok === false && typeof reply.error === "string") return reply;
    return failure("the host failed: a malformed reply");
  }
}

/** Requests over the size limit are answered by the engine without reaching the channel. */
export const OVERSIZE_REPLY = JSON.stringify(failure(`the request is over ${LIMITS.messageBytes} bytes`));
export const messageBytes = bytes;
