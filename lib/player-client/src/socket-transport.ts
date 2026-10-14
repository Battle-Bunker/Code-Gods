import { envelopeSchema, observationSchema, resultSchema, type Envelope, type Observation, type PlayerTransport } from "./protocol.ts";
import { HttpPlayerTransport, TransportError, type RoomCredential } from "./transport.ts";

export interface PlayerSocket {
  readyState: number;
  send(data:string): void;
  close(): void;
  onopen: (()=>void)|null;
  onclose: ((event?:{code:number})=>void)|null;
  onerror: (()=>void)|null;
  onmessage: ((event:{data:unknown})=>void)|null;
}
/** The daemon factory must set these HTTP upgrade headers, never URL query tokens.
 * A ws-compatible constructor can be injected without bundling it in browsers. */
export type PlayerSocketFactory = (url:string, options:{headers:{Authorization:string}})=>PlayerSocket;

export class WebSocketPlayerTransport implements PlayerTransport {
  private readonly http:HttpPlayerTransport;
  private credential:RoomCredential|undefined;
  private socket:PlayerSocket|undefined;
  private reconnect:ReturnType<typeof setTimeout>|undefined;
  private attempt=0;
  private epoch=0;
  private revision=-1;
  get idle() { return this.http.idle; }
  async wake(signal?:AbortSignal) {
    await this.http.wake(signal);
    if (!this.socket) this.connect();
  }
  private sleep() {
    this.http.idle=true; this.epoch++; clearTimeout(this.reconnect);
    const socket=this.socket;this.socket=undefined;socket?.close();
    for(const receipt of this.pending.values()){receipt.cleanup();receipt.reject(new TransportError(503,"SERVER_IDLE"));}
    this.pending.clear();this.report(new TransportError(503,"SERVER_IDLE"));
  }
  private readonly listeners=new Set<(observation:Observation)=>void>();
  private readonly errors=new Set<(error:Error)=>void>();
  private readonly pending=new Map<string,{resolve:(result:ReturnType<typeof resultSchema.parse>)=>void;reject:(error:Error)=>void;cleanup:()=>void}>();
  constructor(private base:string, private factory:PlayerSocketFactory, fetcher:typeof fetch=fetch) {
    this.http=new HttpPlayerTransport(base,fetcher);
  }
  subscribe(listener:(observation:Observation)=>void, onError?:(error:Error)=>void) {
    this.listeners.add(listener);if(onError)this.errors.add(onError);
    return ()=>{this.listeners.delete(listener);if(onError)this.errors.delete(onError);};
  }
  private report(error:Error) {for(const listener of this.errors) listener(error);}
  approve(credential:RoomCredential) {
    this.disconnect();this.http.approve(credential);this.credential={...credential};this.connect();
  }
  disconnect() {
    this.epoch++;this.credential=undefined;clearTimeout(this.reconnect);
    const socket=this.socket;this.socket=undefined;socket?.close();this.http.disconnect();
    for(const receipt of this.pending.values()) {receipt.cleanup();receipt.reject(new Error("Connection closed; retry the same command ID."));}
    this.pending.clear();this.attempt=0;
  }
  private emit(observation:Observation) {
    if(observation.roomId!==this.credential?.roomId || observation.self.godId!==this.credential?.godId) throw new Error("Observation identity mismatch");
    if(observation.revision<this.revision)return;
    this.revision=observation.revision;
    for(const listener of this.listeners) listener(observation);
  }
  private connect() {
    if(this.idle)return;
    const credential=this.credential,epoch=++this.epoch;
    this.revision=-1;
    let cursor=-1;
    if(!credential || credential.expiresAt<=Date.now()) {this.disconnect();return;}
    const url=new URL(`/api/rooms/${encodeURIComponent(credential.roomId)}/ws`,this.base);
    url.protocol=url.protocol==="https:"?"wss:":"ws:";
    const retry=(event?:{code:number})=>{
      if(epoch!==this.epoch)return;
      if(event?.code===4008){this.sleep();return;}
      this.epoch++;
      this.socket=undefined;
      for(const receipt of this.pending.values()) {receipt.cleanup();receipt.reject(new Error("Receipt unknown; retry the same command ID."));}
      this.pending.clear();
      this.report(new Error("Player WebSocket disconnected; reconnecting."));
      this.reconnect=setTimeout(()=>this.connect(),Math.min(1000*2**Math.min(this.attempt++,5),15000)*(0.5+Math.random()*0.5));
    };
    let socket:PlayerSocket;
    try {socket=this.factory(url.href,{headers:{Authorization:`Bearer ${credential.token}`}});}
    catch {retry();return;}
    this.socket=socket;
    socket.onopen=()=>{
      if(epoch!==this.epoch)return;
      void this.http.observe(AbortSignal.timeout(15000)).then(o=>{if(epoch===this.epoch){this.attempt=0;this.emit(o);}}).catch(e=>{if(epoch===this.epoch){if(this.http.idle)this.sleep();else this.report(e instanceof Error?e:new Error("Snapshot failed"));}});
    };
    socket.onmessage=event=>{
      if(epoch!==this.epoch)return;
      try {
        const message=JSON.parse(String(event.data));
        if(message.type==="player.observation" && message.protocolVersion===1) {
          if(typeof message.seq==="number" && message.seq<=cursor)return;
          const observation=observationSchema.parse(message.payload);
          if(typeof message.seq==="number")cursor=message.seq;
          this.emit(observation);
        }
        else if(message.type==="command.receipt") {
          const result=resultSchema.parse(message.payload),pending=this.pending.get(result.commandId);
          if(pending){this.pending.delete(result.commandId);pending.cleanup();pending.resolve(result);}
        }
      } catch {this.report(new Error("Invalid player WebSocket payload."));}
    };
    socket.onerror=()=>{if(epoch===this.epoch)this.report(new Error("Player WebSocket error."));};
    socket.onclose=retry;
  }
  async observe(signal?:AbortSignal) {
    try{return await this.http.observe(signal);}
    catch(error){if(this.http.idle)this.sleep();throw error;}
  }
  async send(envelope:Envelope,signal?:AbortSignal) {
    if(this.idle)throw new TransportError(503,"SERVER_IDLE");
    envelope=envelopeSchema.parse(envelope);
    const socket=this.socket;
    if(!socket || socket.readyState!==1) return this.http.send(envelope,signal);
    if(signal?.aborted) throw new Error("Command aborted.");
    if(this.pending.has(envelope.commandId)) throw new Error("Command is already awaiting a receipt.");
    return new Promise<ReturnType<typeof resultSchema.parse>>((resolve,reject)=>{
      const fail=()=>{
        this.pending.delete(envelope.commandId);cleanup();
        reject(new Error("Receipt unknown; retry the same command ID."));
      };
      const timer=setTimeout(fail,15000);
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener("abort",fail);};
      this.pending.set(envelope.commandId,{resolve,reject,cleanup});
      signal?.addEventListener("abort",fail,{once:true});
      try {socket.send(JSON.stringify(envelope));} catch {fail();}
    });
  }
}
