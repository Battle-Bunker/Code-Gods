import { setTimeout as delay } from "node:timers/promises";
import { PlayerClient, type CommandResult, type Envelope, type PlayerTransport } from "@workspace/player-client";
import { RoomBudget } from "./budget.ts";
import { SYSTEM, decisionSchema, modelObservation } from "./policy.ts";
import type { ModelProvider } from "./provider.ts";
export type AIEvent =
  | {type:"reservation";godId:string;reservedTokens:number;reservedUsd:number}
  | {type:"usage";godId:string;inputTokens:number;outputTokens:number;reservedUsd:number}
  | {type:"status";godId:string;status:"thinking"|"acting"|"stopped"|"backoff"}
  | {type:"failure";godId:string;code:"turn_failed"|"provider_missing"|"budget_exhausted"}
  | {type:"command";godId:string;commandId:string;accepted:boolean};
export interface ControllerOptions {
  roomId:string; godId:string; transport:PlayerTransport; provider:ModelProvider;
  budget:RoomBudget; onEvent:(event:AIEvent)=>void; intervalMs?:number;
}
export class AIController {
  private busy=false;
  private abort?:AbortController;
  private results:CommandResult[]=[];
  private uncertain?:Envelope;
  private client:PlayerClient;
  constructor(private options:ControllerOptions) {
    if(!options.provider) { options.onEvent({type:"failure",godId:options.godId,code:"provider_missing"}); throw new Error("AI provider is not configured; no fallback"); }
    if(options.intervalMs!==undefined && (!Number.isFinite(options.intervalMs)||options.intervalMs<1000)) throw new Error("Minimum AI interval is 1000ms");
    this.client=new PlayerClient(options.transport);
  }
  private async send(envelope:Envelope,signal:AbortSignal) {
    this.uncertain=envelope;
    const receipt=await this.client.execute(envelope,signal);
    this.uncertain=undefined;
    this.results.push(receipt);this.results=this.results.slice(-8);
    this.options.onEvent({type:"command",godId:this.options.godId,commandId:receipt.commandId,accepted:receipt.accepted});
    return receipt;
  }
  async step(signal= new AbortController().signal) {
    if(this.busy) throw new Error("AI turn already in progress");
    this.busy=true;
    const bounded=AbortSignal.any([signal,AbortSignal.timeout(60000)]);
    try {
      bounded.throwIfAborted();
      const observation=modelObservation(await this.options.transport.observe(bounded),this.options.roomId,this.options.godId);
      // Recover an uncertain command using the original ID, never a new action.
      if(this.uncertain) {await this.send(this.uncertain,bounded);return;}
      if(observation.phase==="ended") {this.stop();return;}
      const data=JSON.stringify({observation,previousResults:this.results});
      if(Buffer.byteLength(data)>64000) throw new Error("AI context limit exceeded");
      // Byte count is a conservative token bound; extra framing allowance.
      const inputBound=Buffer.byteLength(SYSTEM)+Buffer.byteLength(data)+2048, outputBound=8192;
      let reservation;
      try { reservation=this.options.budget.reserve(inputBound+outputBound,this.options.provider.estimateMaxUsd(inputBound,outputBound)); }
      catch(error) {this.options.onEvent({type:"failure",godId:this.options.godId,code:"budget_exhausted"});throw error;}
      this.options.onEvent({type:"reservation",godId:this.options.godId,...reservation});
      this.options.onEvent({type:"status",godId:this.options.godId,status:"thinking"});
      const response=await this.options.provider.complete({system:SYSTEM,data,maxOutputTokens:outputBound,signal:bounded});
      this.options.onEvent({type:"usage",godId:this.options.godId,inputTokens:response.inputTokens,outputTokens:response.outputTokens,reservedUsd:reservation.reservedUsd});
      if(!Number.isSafeInteger(response.inputTokens)||response.inputTokens<0||!Number.isSafeInteger(response.outputTokens)||response.outputTokens<0||response.inputTokens>inputBound||response.outputTokens>outputBound) throw new Error("Provider exceeded reservation contract");
      if(Buffer.byteLength(response.text)>40000) throw new Error("Model response too large");
      const decision=decisionSchema.parse(JSON.parse(response.text));
      this.options.onEvent({type:"status",godId:this.options.godId,status:"acting"});
      for(const action of decision.actions) {
        bounded.throwIfAborted();
        if("language" in action && action.language!==observation.language) throw new Error("Wrong room language");
        if(action.type==="summon") {
          const validation=await this.send(this.client.prepare({...action,type:"validate"}),bounded);
          if(!validation.accepted || !validation.validation?.valid) continue;
          const fresh=modelObservation(await this.options.transport.observe(bounded),this.options.roomId,this.options.godId);
          if(validation.validation.cost>fresh.self.energy) continue;
        }
        await this.send(this.client.prepare(action),bounded);
      }
    } catch(error) {
      if(!signal.aborted) this.options.onEvent({type:"failure",godId:this.options.godId,code:"turn_failed"});
      throw error;
    } finally {this.busy=false;}
  }
  async run(signal?:AbortSignal) {
    if(this.abort) throw new Error("Controller already running");
    this.abort=new AbortController();
    const combined=signal?AbortSignal.any([signal,this.abort.signal]):this.abort.signal;
    let failures=0;
    try {
      while(!combined.aborted) {
        try {await this.step(combined);failures=0;}
        catch {if(combined.aborted)break;failures++;this.options.onEvent({type:"status",godId:this.options.godId,status:"backoff"});if(failures>=5)break;}
        await delay(Math.min(60000,(this.options.intervalMs??10000)*2**failures),undefined,{signal:combined});
      }
    } catch(error) {if(!combined.aborted)throw error;}
    finally {this.abort=undefined;this.options.onEvent({type:"status",godId:this.options.godId,status:"stopped"});}
  }
  stop() {this.abort?.abort();}
}
