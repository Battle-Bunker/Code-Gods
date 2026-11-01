import OpenAI from "openai";
/** `responseSchema`: a JSON schema the reply must follow, where the provider can enforce it (Anthropic structured outputs). */
export interface ModelRequest { system:string; data:string; maxOutputTokens:number; signal:AbortSignal; responseSchema?:Record<string,unknown> }
export interface ModelResult { text:string; inputTokens:number; outputTokens:number }
/**
 * Why an AI turn failed, in a class safe to show every player: never the model's text, a key or a provider message.
 * invalid_reply: the reply was not a valid decision; incomplete_reply: cut off (max tokens) or refused;
 * provider_error: the provider call failed (rate limit, overload, network); budget_exhausted: no reservation;
 * turn_failed: anything else (a command or the game changed under the turn).
 */
export type AIFailureReason = "invalid_reply" | "incomplete_reply" | "provider_error" | "budget_exhausted" | "turn_failed";
export class AITurnError extends Error {
  readonly reason:AIFailureReason;
  constructor(reason:AIFailureReason, message:string, options?:{cause?:unknown}) { super(message, options); this.name="AITurnError"; this.reason=reason; }
}
export interface ModelProvider {
  estimateMaxUsd(inputTokens:number,outputTokens:number):number;
  complete(request:ModelRequest):Promise<ModelResult>;
}
/** Optional OpenAI-compatible adapter; Code Gods uses direct Anthropic by default.
 * SDK must be constructed with maxRetries:0; this adapter also disables retries
 * per request so every billed attempt is reserved by the controller.
 */
export function openAIProvider(client:OpenAI,model:string,prices:{inputUsdPerMillion:number;outputUsdPerMillion:number}):ModelProvider {
  if(!model || [prices.inputUsdPerMillion,prices.outputUsdPerMillion].some(v=>!Number.isFinite(v)||v<=0)) throw new Error("Model and current conservative price ceilings required");
  return {
    estimateMaxUsd:(input,output)=>(input*prices.inputUsdPerMillion+output*prices.outputUsdPerMillion)/1_000_000,
    async complete(request) {
      const result=await client.chat.completions.create({
        model,messages:[{role:"system",content:request.system},{role:"user",content:request.data}],
        max_completion_tokens:request.maxOutputTokens,response_format:{type:"json_object"},
      },{signal:request.signal,maxRetries:0});
      const choice=result.choices[0];
      if(choice?.finish_reason!=="stop" || !choice.message.content || !result.usage) throw new AITurnError("incomplete_reply","Incomplete model response or missing usage");
      return {text:choice.message.content,inputTokens:result.usage.prompt_tokens,outputTokens:result.usage.completion_tokens};
    },
  };
}
/** Server-only factory; never inherits a proxy base URL from the environment. */
export function createDirectOpenAIProvider(apiKey:string,model:string,prices:{inputUsdPerMillion:number;outputUsdPerMillion:number}):ModelProvider {
  if(!apiKey.trim()) throw new Error("OPENAI_API_KEY is required");
  return openAIProvider(new OpenAI({apiKey,baseURL:"https://api.openai.com/v1",maxRetries:0,timeout:60000}),model,prices);
}
