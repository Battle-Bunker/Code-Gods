import type OpenAI from "openai";
export interface ModelRequest { system:string; data:string; maxOutputTokens:number; signal:AbortSignal }
export interface ModelResult { text:string; inputTokens:number; outputTokens:number }
export interface ModelProvider {
  estimateMaxUsd(inputTokens:number,outputTokens:number):number;
  complete(request:ModelRequest):Promise<ModelResult>;
}
/** Coordinator injects the Replit AI Integrations SDK client. No user API keys.
 * SDK must be constructed with maxRetries:0; this adapter also disables retries
 * per request so every billed attempt is reserved by the controller.
 */
export function openAIProvider(client:OpenAI,model:string,prices:{inputUsdPerMillion:number;outputUsdPerMillion:number}):ModelProvider {
  if(!model || Object.values(prices).some(v=>!Number.isFinite(v)||v<=0)) throw new Error("Model and current conservative price ceilings required");
  return {
    estimateMaxUsd:(input,output)=>(input*prices.inputUsdPerMillion+output*prices.outputUsdPerMillion)/1_000_000,
    async complete(request) {
      const result=await client.chat.completions.create({
        model,messages:[{role:"system",content:request.system},{role:"user",content:request.data}],
        max_completion_tokens:request.maxOutputTokens,response_format:{type:"json_object"},
      },{signal:request.signal,maxRetries:0});
      const choice=result.choices[0];
      if(choice?.finish_reason!=="stop" || !choice.message.content || !result.usage) throw new Error("Incomplete model response or missing usage");
      return {text:choice.message.content,inputTokens:result.usage.prompt_tokens,outputTokens:result.usage.completion_tokens};
    },
  };
}
