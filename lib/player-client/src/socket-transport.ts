import { envelopeSchema, observationSchema, resultSchema, type Envelope, type Observation, type PlayerTransport } from "./protocol.ts";
import { HttpPlayerTransport, type RoomCredential } from "./transport.ts";

export interface PlayerSocket {
  readyState: number;
  send(data:string): void;
  close(): void;
  onopen: (()=>void)|null;
  onclose: (()=>void)|null;
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
    for(const listener of this.listeners) listener(observation);
  }
  private connect() {
    const credential=this.credential,epoch=this.epoch;
    if(!credential || credential.expiresAt<=Date.now()) {this.disconnect();return;}
    const url=new URL(`/api/rooms/${encodeURIComponent(credential.roomId)}/ws`,this.base);
    url.protocol=url.protocol==="https:"?"wss:":"ws:";
    const retry=()=>{
      if(epoch!==this.epoch)return;
      this.socket=undefined;
      for(const receipt of this.pending.values()) {receipt.cleanup();receipt.reject(new Error("Receipt unknown; retry the same command ID."));}
      this.pending.clear();
      this.report(new Error("Player WebSocket disconnected; reconnecting."));
      this.reconnect=setTimeout(()=>this.connect(),Math.min(1000*2**this.attempt++,15000));
    };
    let socket:PlayerSocket;
    try {socket=this.factory(url.href,{headers:{Authorization:`Bearer ${credential.token}`}});}
    catch {retry();return;}
    this.socket=socket;
    socket.onopen=()=>{
      if(epoch!==this.epoch)return;
      this.attempt=0;
      void this.http.observe(AbortSignal.timeout(15000)).then(o=>{if(epoch===this.epoch)this.emit(o);}).catch(e=>{if(epoch===this.epoch)this.report(e instanceof Error?e:new Error("Snapshot failed"));});
    };
    socket.onmessage=event=>{
      if(epoch!==this.epoch)return;
      try {
        const message=JSON.parse(String(event.data));
        if(message.type==="player.observation" && message.protocolVersion===1) this.emit(observationSchema.parse(message.payload));
        else if(message.type==="command.receipt") {
          const result=resultSchema.parse(message.payload),pending=this.pending.get(result.commandId);
          if(pending){this.pending.delete(result.commandId);pending.cleanup();pending.resolve(result);}
        }
      } catch {this.report(new Error("Invalid player WebSocket payload."));}
    };
    socket.onerror=()=>{if(epoch===this.epoch)this.report(new Error("Player WebSocket error."));};
    socket.onclose=retry;
  }
  observe(signal?:AbortSignal) {return this.http.observe(signal);}
  async send(envelope:Envelope,signal?:AbortSignal) {
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
