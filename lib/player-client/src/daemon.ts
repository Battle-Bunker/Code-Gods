import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { envelopeSchema, type Envelope } from "./protocol.ts";
import { HttpPlayerTransport, TransportError } from "./transport.ts";
import { WebSocketPlayerTransport, type PlayerSocketFactory } from "./socket-transport.ts";

const secret = () => randomBytes(32).toString("base64url");
const equal = (a:string,b:string) => Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
const credentialSchema = z.object({token:z.string().min(1).max(8192),roomId:z.string(),godId:z.string(),expiresIn:z.number().positive().max(14400)});
const pendingSchema = z.object({deviceId:z.string().min(1),deviceSecret:z.string().min(1),roomId:z.string().uuid(),userCode:z.string().max(64),verificationPath:z.string(),expiresIn:z.number().positive().max(900),interval:z.number().min(1).max(30)});
export interface DaemonOptions { origin:string; basePath:string; serverUrl:string; fetcher?:typeof fetch; socketFactory?:PlayerSocketFactory }

/** One instance per player. Credentials, pending approval and session all stay in memory. */
export function createPlayerDaemon(options:DaemonOptions) {
  const origin = new URL(options.origin).origin;
  const serverUrl = options.serverUrl.replace(/\/$/,"");
  const serverOrigin = new URL(serverUrl).origin;
  const deviceBase = new URL("/api/device/", serverOrigin).href;
  const fetcher = options.fetcher ?? fetch;
  const transport = options.socketFactory ? new WebSocketPlayerTransport(serverUrl,options.socketFactory,fetcher) : new HttpPlayerTransport(serverUrl,fetcher);
  const cookieName = "code_gods_player";
  const base = options.basePath.replace(/\/$/,"");
  let ticket = secret(), ticketExpiry = Date.now()+60_000;
  let session = "", csrf = "", sessionExpiry = 0;
  let approvedUntil = 0;
  let pending: (z.infer<typeof pendingSchema> & {verifier:string; expiresAt:number; intervalMs:number; nextPoll:number}) | undefined;
  let approvalBusy = false;
  let gameId:string|undefined;
  const receipts = new Map<string,{body:string;envelope:Envelope;result:Promise<unknown>|undefined}>();
  const json = (body:unknown,status=200,headers:Record<string,string>={}) => new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});
  const cookie = (value:string,maxAge:number) => `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=${base || "/"}; Max-Age=${maxAge}${origin.startsWith("https:")?"; Secure":""}`;
  async function upstream(path:string,body:unknown) {
    const response = await fetcher(`${deviceBase}${path}`,{method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(!response.ok) throw new TransportError(response.status);
    return response.json();
  }
  const launchUrl = () => {
    ticket=secret(); ticketExpiry=Date.now()+60_000;
    return `${origin}${base}/#launch=${ticket}`;
  };
  async function handle(request:Request):Promise<Response> {
    try {
      const url = new URL(request.url);
      if(url.origin!==origin) return json({error:"Invalid host"},403);
      const path = url.pathname.slice(`${base}/daemon`.length);
      if(!url.pathname.startsWith(`${base}/daemon/`)) return json({error:"Not found"},404);
      // No CORS. Exact Origin required on every mutation, including session exchange.
      if(request.method!=="GET" && (request.method!=="POST" || request.headers.get("origin")!==origin)) return json({error:"Invalid origin"},403);
      if(request.headers.get("sec-fetch-site")==="cross-site") return json({error:"Cross-site request"},403);
      let body:unknown;
      if(request.method==="POST") {
        if(!request.headers.get("content-type")?.startsWith("application/json")) return json({error:"JSON required"},415);
        const text=await request.text();
        if(Buffer.byteLength(text)>24000) return json({error:"Request too large"},413);
        body=JSON.parse(text);
      }
      if(path==="/session" && request.method==="POST") {
        const input=z.object({ticket:z.string().max(128)}).strict().parse(body);
        if(!ticket || Date.now()>ticketExpiry || !equal(input.ticket,ticket)) return json({error:"Invalid launch ticket"},401);
        ticket=""; session=secret(); csrf=secret(); sessionExpiry=Date.now()+60*60_000;
        return json({authenticated:true},200,{"Set-Cookie":cookie(session,3600)});
      }
      const supplied = request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)??"";
      if(!session || Date.now()>sessionExpiry || !equal(supplied,session)) return json({error:"Authentication required"},401);
      if(request.method==="POST" && !equal(request.headers.get("x-csrf-token")??"",csrf)) return json({error:"CSRF rejected"},403);
      if(path==="/session" && request.method==="GET") return json({csrf,connected:approvedUntil>Date.now(),idle:transport.idle});
      if(path==="/wake" && request.method==="POST") {
        await transport.wake(AbortSignal.timeout(15000));
        return json({resumed:true});
      }
      if(path==="/disconnect" && request.method==="POST") {
        transport.disconnect(); approvedUntil=0; pending=undefined; gameId=undefined;receipts.clear(); session=""; csrf="";
        return json({disconnected:true},200,{"Set-Cookie":cookie("",0)});
      }
      if(path==="/approval" && request.method==="POST") {
        if(approvalBusy || pending) return json({error:"Approval already pending"},409);
        const input=z.object({roomId:z.string().min(1).max(128)}).strict().parse(body);
        approvalBusy=true;
        const approvalSession=session;
        try {
          const verifier=secret();
          const challenge=createHash("sha256").update(verifier).digest("base64url");
          const result=pendingSchema.parse(await upstream("request",{roomId:input.roomId,challenge}));
          if(session!==approvalSession) return json({error:"Approval cancelled"},409);
          // Aliases resolve on the authority, before polling. Never infer room scope
          // from the eventual credential or weaken the poll-time equality check.
          if(z.string().uuid().safeParse(input.roomId).success && input.roomId.toLowerCase()!==result.roomId.toLowerCase()) throw new Error("Room mismatch");
          const verificationUri=new URL(result.verificationPath,serverOrigin);
          if(verificationUri.origin!==serverOrigin || verificationUri.username || verificationUri.password || verificationUri.protocol!=="https:" && !["localhost","127.0.0.1"].includes(verificationUri.hostname)) throw new Error("Invalid approval response");
          transport.disconnect(); approvedUntil=0;gameId=undefined; receipts.clear();
          pending={...result,verifier,expiresAt:Date.now()+result.expiresIn*1000,intervalMs:result.interval*1000,nextPoll:Date.now()+result.interval*1000};
          return json({verificationUri:verificationUri.href,userCode:result.userCode});
        } finally { approvalBusy=false; }
      }
      if(path==="/approval/poll" && request.method==="POST") {
        if(!pending || pending.expiresAt<=Date.now()) {pending=undefined;return json({error:"Approval expired"},410);}
        if(approvalBusy || pending.nextPoll>Date.now()) return json({status:"pending"});
        approvalBusy=true;
        const active=pending; active.nextPoll=Date.now()+active.intervalMs;
        try {
          const result=z.union([z.object({status:z.literal("pending")}),credentialSchema]).parse(await upstream("poll",{deviceId:active.deviceId,deviceSecret:active.deviceSecret,verifier:active.verifier}));
          if(pending!==active || !session) return json({error:"Approval cancelled"},409);
          if("token" in result) {
            if(result.roomId!==active.roomId) throw new Error("Room mismatch");
            const expiresAt=Date.now()+result.expiresIn*1000;
            transport.approve({...result,expiresAt}); approvedUntil=expiresAt; pending=undefined;
            return json({status:"approved"});
          }
          return json({status:"pending"});
        } finally {approvalBusy=false;}
      }
      if(path==="/observation" && request.method==="GET") {
        const observation=await transport.observe(AbortSignal.timeout(15000));
        gameId=observation.gameId;return json(observation);
      }
      if(path==="/commands" && request.method==="POST") {
        const envelope=envelopeSchema.parse(body);
        const serialized=JSON.stringify(envelope);
        const prior=receipts.get(envelope.commandId);
        if(prior && prior.body!==serialized) return json({error:"Command ID reused with different payload"},409);
        if(prior?.result) return json(await prior.result);
        // Bound memory without evicting uncertain outcomes. New session/approval clears cache.
        if(!prior && receipts.size>=2000) return json({error:"Session command limit; reconnect"},429);
        const prepared=prior?.envelope ?? {...envelope,...(!envelope.gameId && gameId && ["validate","summon","pause","destroy"].includes(envelope.command.type) ? {gameId} : {})};
        const result=transport.send(prepared,AbortSignal.timeout(15000));
        const entry={body:serialized,envelope:prepared,result:result as Promise<unknown>|undefined};
        receipts.set(envelope.commandId,entry);
        try {return json(await result);}
        catch(error) { entry.result=undefined; throw error; }
      }
      return json({error:"Not found"},404);
    } catch(error) {
      // Never echo upstream errors, tokens, model payloads or private device codes.
      return json({error:error instanceof z.ZodError ? "Invalid payload" : error instanceof TransportError && error.status===401 ? "Device approval expired. Reapprove this player." : "Player service unavailable",...(error instanceof TransportError && error.code ? {code:error.code}:{})},error instanceof z.ZodError?400:error instanceof TransportError?error.status:502);
    }
  }
  return {handle,launchUrl,close:()=>{transport.disconnect();session="";ticket="";csrf="";pending=undefined;receipts.clear();}};
}
