import OpenAI from "openai";
/**
 * `responseSchema`: a JSON schema the reply must follow (policy.ts decisionJsonSchema), enforced as structured outputs:
 * Anthropic output_config.format, OpenAI strict json_schema (JSON mode on a model without structured outputs).
 */
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
/**
 * OpenAI models that take strict JSON-schema structured outputs: the gpt-4o snapshots from 2024-08-06 on, gpt-4o-mini,
 * gpt-4.1, gpt-5 and the o3/o4 reasoning models. Any other model is asked for JSON mode instead, and the controller's
 * decisionSchema still checks its reply. Every OpenAI model in the engine's catalog must be one of these
 * (artifacts/engine/test/unit/ai-models.test.ts).
 */
export function openAISupportsStructuredOutputs(model:string):boolean {
  return /^(gpt-4o(-mini)?|gpt-4\.1(-mini|-nano)?|gpt-5(\.\d+)?(-mini|-nano)?|o3(-mini|-pro)?|o4-mini)(-\d{4}-\d{2}-\d{2})?$/.test(model)
    && model!=="gpt-4o-2024-05-13";
}
/** Optional OpenAI-compatible adapter; Code Gods uses direct Anthropic by default.
 * SDK must be constructed with maxRetries:0; this adapter also disables retries
 * per request so every billed attempt is reserved by the controller.
 */
export function openAIProvider(client:OpenAI,model:string,prices:{inputUsdPerMillion:number;outputUsdPerMillion:number}):ModelProvider {
  if(!model || [prices.inputUsdPerMillion,prices.outputUsdPerMillion].some(v=>!Number.isFinite(v)||v<=0)) throw new Error("Model and current conservative price ceilings required");
  const strict=openAISupportsStructuredOutputs(model);
  return {
    estimateMaxUsd:(input,output)=>(input*prices.inputUsdPerMillion+output*prices.outputUsdPerMillion)/1_000_000,
    async complete(request) {
      const result=await client.chat.completions.create({
        model,messages:[{role:"system",content:request.system},{role:"user",content:request.data}],
        max_completion_tokens:request.maxOutputTokens,
        // Strict structured outputs: the reply is always the decision, in one of the game's languages.
        response_format:request.responseSchema&&strict
          ?{type:"json_schema",json_schema:{name:"decision",strict:true,schema:request.responseSchema}}
          :{type:"json_object"},
      },{signal:request.signal,maxRetries:0});
      const choice=result.choices[0];
      // A refusal (structured outputs report it apart from the content), a cut-off (length) or a filtered reply is no
      // decision. The refusal's text stays out of the message, which players may see as a class.
      if(choice?.message.refusal) throw new AITurnError("incomplete_reply","The model declined to answer");
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
