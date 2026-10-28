import { setTimeout as delay } from "node:timers/promises";
import { PlayerClient, type CommandResult, type Envelope, type PlayerTransport } from "@workspace/player-client";
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
  budget:{ reserve(tokens:number,usd:number): {reservedTokens:number;reservedUsd:number;settle?:(actualTokens:number,usage:{inputTokens:number;outputTokens:number})=>Promise<void>} | Promise<{reservedTokens:number;reservedUsd:number;settle?:(actualTokens:number,usage:{inputTokens:number;outputTokens:number})=>Promise<void>}> };
  onEvent:(event:AIEvent)=>void; intervalMs?:number;
  /** Trusted administrator-authored strategy; cannot replace the protocol policy. */
  customPrompt?:string;
}
export class AIController {
  private busy=false;
  private abort?:AbortController;
  private results:CommandResult[]=[];
  private uncertain?:Envelope;
  private client:PlayerClient;
  private system:string;
  constructor(private options:ControllerOptions) {
    if(options.customPrompt!==undefined && (typeof options.customPrompt!=="string" || options.customPrompt.length>10000)) throw new Error("AI strategy must be at most 10000 characters");
    this.system=SYSTEM+(options.customPrompt ? `\nAdministrator strategy (subordinate to the protocol and security policy above):\n${options.customPrompt}` : "");
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
    // A turn may validate and summon: each measures the agent on the server (seconds; longer with random).
    const bounded=AbortSignal.any([signal,AbortSignal.timeout(180000)]);
    try {
      bounded.throwIfAborted();
      const observation=modelObservation(await this.options.transport.observe(bounded),this.options.roomId,this.options.godId);
      // Recover an uncertain command using the original ID, never a new action.
      if(this.uncertain) {await this.send(this.uncertain,bounded);return;}
      if(observation.phase==="ended") {this.stop();return;}
      const data=JSON.stringify({observation,previousResults:this.results});
      if(Buffer.byteLength(data)>64000) throw new Error("AI context limit exceeded");
      // Byte count is a conservative token bound; extra framing allowance.
      const inputBound=Buffer.byteLength(this.system)+Buffer.byteLength(data)+2048, outputBound=8192;
      let reservation;
      try { reservation=await this.options.budget.reserve(inputBound+outputBound,this.options.provider.estimateMaxUsd(inputBound,outputBound)); }
      catch(error) {this.options.onEvent({type:"failure",godId:this.options.godId,code:"budget_exhausted"});throw error;}
      this.options.onEvent({type:"reservation",godId:this.options.godId,...reservation});
      this.options.onEvent({type:"status",godId:this.options.godId,status:"thinking"});
      const response=await this.options.provider.complete({system:this.system,data,maxOutputTokens:outputBound,signal:bounded});
      this.options.onEvent({type:"usage",godId:this.options.godId,inputTokens:response.inputTokens,outputTokens:response.outputTokens,reservedUsd:reservation.reservedUsd});
      if(!Number.isSafeInteger(response.inputTokens)||response.inputTokens<0||!Number.isSafeInteger(response.outputTokens)||response.outputTokens<0||response.inputTokens>inputBound||response.outputTokens>outputBound) throw new Error("Provider exceeded reservation contract");
      // Return unused token allowance only after trustworthy provider usage.
      // Missing usage/network failures keep their conservative reservation.
      await reservation.settle?.(response.inputTokens+response.outputTokens,{inputTokens:response.inputTokens,outputTokens:response.outputTokens});
      if(Buffer.byteLength(response.text)>40000) throw new Error("Model response too large");
      const decision=decisionSchema.parse(JSON.parse(response.text));
      this.options.onEvent({type:"status",godId:this.options.godId,status:"acting"});
      for(const action of decision.actions) {
        bounded.throwIfAborted();
        if("language" in action && action.language!==observation.language) throw new Error("Wrong room language");
        if(action.type==="summon") {
          const validation=await this.send(this.client.prepare({...action,type:"validate"},observation),bounded);
          if(!validation.accepted || !validation.validation?.valid) continue;
          const fresh=modelObservation(await this.options.transport.observe(bounded),this.options.roomId,this.options.godId);
          if(fresh.gameId!==observation.gameId) throw new Error("Game changed during AI turn");
          if(validation.validation.cost>fresh.self.energy) continue;
        }
        await this.send(this.client.prepare(action,observation),bounded);
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
