import { GAME_COMMANDS, VERSION, commandSchema, envelopeSchema, observationSchema, resultSchema, type Command, type Envelope, type Observation, type PlayerTransport } from "./protocol.ts";

export class TransportError extends Error {
  constructor(public status: number, public code?: string) { super(code === "SERVER_IDLE" ? "Server idle. Resume explicitly to reconnect." : `Player service request failed (${status})`); }
}
export interface RoomCredential { token: string; roomId: string; godId: string; expiresAt: number }
export class HttpPlayerTransport implements PlayerTransport {
  idle = false;
  #credential: RoomCredential | undefined;
  constructor(private base: string, private fetcher: typeof fetch = fetch) {
    const url = new URL(base);
    if (url.protocol !== "https:" && !(url.protocol==="http:" && ["localhost","127.0.0.1"].includes(url.hostname))) throw new Error("HTTPS required");
    if(url.username || url.password || url.search || url.hash) throw new Error("Plain player API URL required");
    this.base=base.replace(/\/$/,"");
  }
  approve(credential: RoomCredential) {
    this.idle = false;
    if (!credential.token || credential.expiresAt <= Date.now() || credential.expiresAt > Date.now()+4*60*60_000) throw new Error("Invalid room credential");
    this.#credential = { ...credential };
  }
  disconnect() { this.#credential = undefined; }
  async wake(signal?: AbortSignal) {
    const credential = this.#credential;
    if (!credential || credential.expiresAt <= Date.now()) throw new TransportError(401);
    const response = await this.fetcher(new URL("/api/activity", this.base), {
      method:"POST", redirect:"error", signal, headers:{Authorization:`Bearer ${credential.token}`, "Content-Type":"application/json"}, body:"{}",
    });
    if (!response.ok) throw new TransportError(response.status);
    this.idle = false;
  }
  private async request(path: string, body?: unknown, signal?: AbortSignal) {
    if (this.idle) throw new TransportError(503, "SERVER_IDLE");
    const credential = this.#credential;
    if (!credential || credential.expiresAt <= Date.now()) { this.disconnect(); throw new TransportError(401); }
    const response = await this.fetcher(`${this.base}/rooms/${encodeURIComponent(credential.roomId)}/${path}`, {
      method: body ? "POST" : "GET", redirect: "error", signal,
      headers: { Authorization: `Bearer ${credential.token}`, "Content-Type":"application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const data = await response.json().catch(()=>({}));
      if(data.code === "SERVER_IDLE") this.idle = true;
      if(response.status === 401) this.disconnect();
      throw new TransportError(response.status, data.code);
    }
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
      ...(GAME_COMMANDS.includes(command.type) && observation?.gameId ? {gameId:observation.gameId} : {}) };
  }
  // Retry the SAME envelope after an uncertain network failure; server deduplication is mandatory.
  execute(envelope: Envelope, signal?: AbortSignal) { return this.transport.send(envelope, signal); }
}
