import { VERSION, commandSchema, envelopeSchema, observationSchema, resultSchema, type Command, type Envelope, type Observation, type PlayerTransport } from "./protocol.ts";

export class TransportError extends Error {
  constructor(public status: number) { super(`Player service request failed (${status})`); }
}
export interface RoomCredential { token: string; roomId: string; godId: string; expiresAt: number }
export class HttpPlayerTransport implements PlayerTransport {
  #credential: RoomCredential | undefined;
  constructor(private base: string, private fetcher: typeof fetch = fetch) {
    const url = new URL(base);
    if (url.protocol !== "https:" && !(url.protocol==="http:" && ["localhost","127.0.0.1"].includes(url.hostname))) throw new Error("HTTPS required");
    if(url.username || url.password || url.search || url.hash) throw new Error("Plain player API URL required");
    this.base=base.replace(/\/$/,"");
  }
  approve(credential: RoomCredential) {
    if (!credential.token || credential.expiresAt <= Date.now() || credential.expiresAt > Date.now()+4*60*60_000) throw new Error("Invalid room credential");
    this.#credential = { ...credential };
  }
  disconnect() { this.#credential = undefined; }
  private async request(path: string, body?: unknown, signal?: AbortSignal) {
    const credential = this.#credential;
    if (!credential || credential.expiresAt <= Date.now()) { this.disconnect(); throw new TransportError(401); }
    const response = await this.fetcher(`${this.base}/rooms/${encodeURIComponent(credential.roomId)}/${path}`, {
      method: body ? "POST" : "GET", redirect: "error", signal,
      headers: { Authorization: `Bearer ${credential.token}`, "Content-Type":"application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) { if(response.status === 401) this.disconnect(); throw new TransportError(response.status); }
    return response.json();
  }
  async observe(signal?: AbortSignal) {
    const result = observationSchema.parse(await this.request("observation", undefined, signal));
    if (result.roomId !== this.#credential?.roomId || result.self.godId !== this.#credential?.godId) throw new Error("Observation identity mismatch");
    return result;
  }
  async send(envelope: Envelope, signal?: AbortSignal) {
    envelope=envelopeSchema.parse(envelope);
    const result = resultSchema.parse(await this.request("commands", envelope, signal));
    if(result.commandId !== envelope.commandId) throw new Error("Command receipt mismatch");
    return result;
  }
}
export class PlayerClient {
  private observation:Observation|undefined;
  constructor(readonly transport: PlayerTransport) {}
  async observe(signal?:AbortSignal) {const observation=await this.transport.observe(signal);this.observation=observation;return observation;}
  prepare(command: Command, observation:Observation|undefined=this.observation): Envelope {
    return { version: VERSION, commandId: crypto.randomUUID(), command: commandSchema.parse(command),
      ...(["validate","summon","pause"].includes(command.type) && observation?.gameId ? {gameId:observation.gameId} : {}) };
  }
  // Retry the SAME envelope after an uncertain network failure; server deduplication is mandatory.
  execute(envelope: Envelope, signal?: AbortSignal) { return this.transport.send(envelope, signal); }
}
