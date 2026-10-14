import { test } from "node:test";
import assert from "node:assert/strict";
import { VERSION, commandSchema, observationSchema } from "../src/protocol.ts";
import { HttpPlayerTransport, PlayerClient } from "../src/transport.ts";
import { createPlayerDaemon } from "../src/daemon.ts";
const raw = {version:VERSION,roomId:"room",revision:1,phase:"running",language:"python",self:{godId:"god",label:"Human",isAI:false,energy:100,ready:true,valueSource:"own"},objects:[{id:"o",value:1,ownValue:1,othersSum:2,payoff:2,opponentValues:[1,1]}],agents:[],transformations:[],leaderboard:[],chat:[],adminToken:"NEVER"};
test("projection strips hidden fields and bounds commands",()=>{
  assert.equal(JSON.stringify(observationSchema.parse(raw)).includes("NEVER"),false);
  assert.equal(JSON.stringify(observationSchema.parse(raw)).includes("opponentValues"),false);
  for(const command of [{type:"dm",text:"hi"},{type:"start"},{type:"chat",text:"hi",recipient:"god"},{type:"summon",language:"python",source:"x".repeat(16385)}]) assert.throws(()=>commandSchema.parse(command));
});
test("transport credentials expire, bind identity and never follow redirects",async()=>{
  let options:RequestInit|undefined;
  const transport=new HttpPlayerTransport("https://game.test/player/v1",async(_url,init)=>{
    options=init;return Response.json(raw);
  });
  await assert.rejects(()=>transport.observe());
  assert.throws(()=>transport.approve({token:"test",roomId:"room",godId:"god",expiresAt:Date.now()+16*60_000}));
  transport.approve({token:"test",roomId:"room",godId:"other",expiresAt:Date.now()+60_000});
  await assert.rejects(()=>transport.observe(),/identity mismatch/);
  assert.equal(options?.redirect,"error");
  transport.disconnect();await assert.rejects(()=>transport.observe());
  assert.throws(()=>new HttpPlayerTransport("https://user:password@game.test"));
  await assert.rejects(()=>transport.send({version:VERSION,commandId:crypto.randomUUID(),command:{type:"start"}} as never));
});
test("daemon rejects unauthenticated, cross-origin, CSRF and replay; approval keeps tokens private",async()=>{
  const origin="https://local.test",basePath="/player";
  let commandCalls=0;
  const fetcher:typeof fetch=async(url,init)=>{
    const path=String(url),body=JSON.parse(String(init?.body??"{}"));
    if(path.endsWith("/device/start"))return Response.json({deviceCode:"PRIVATE_DEVICE",userCode:"HUMAN",verificationUri:"https://game.test/approve",expiresAt:Date.now()+60000,intervalMs:1000});
    if(path.endsWith("/device/poll"))return Response.json({status:"approved",credential:{token:"PRIVATE_ROOM",roomId:"room",godId:"god",expiresAt:Date.now()+60000}});
    assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer PRIVATE_ROOM");
    if(path.endsWith("/commands")) {commandCalls++;return Response.json({commandId:body.commandId,accepted:true,message:"ack"});}
    return Response.json(raw);
  };
  const daemon=createPlayerDaemon({origin,basePath,serverUrl:"https://game.test/player/v1",fetcher});
  let cookie="",csrf="";
  const request=(path:string,body?:unknown,extra:Record<string,string>={})=>daemon.handle(new Request(origin+basePath+"/daemon"+path,{
    method:body?"POST":"GET",headers:{origin,cookie,"content-type":"application/json","x-csrf-token":csrf,...extra},...(body?{body:JSON.stringify(body)}:{}),
  }));
  assert.equal((await request("/observation")).status,401);
  const ticket=new URL(daemon.launchUrl()).hash.slice("#launch=".length);
  assert.equal((await request("/session",{ticket},{origin:"https://evil.test"})).status,403);
  const session=await request("/session",{ticket});
  assert.equal(session.status,200);cookie=session.headers.get("set-cookie")!.split(";")[0]!;
  assert.match(session.headers.get("set-cookie")!,/HttpOnly; SameSite=Strict/);
  assert.equal((await request("/session",{ticket})).status,401);
  csrf=(await (await request("/session")).json()).csrf;
  assert.equal((await request("/approval",{roomId:"room"},{"x-csrf-token":""})).status,403);
  const approval=await request("/approval",{roomId:"room"});
  assert.equal(approval.status,200);assert.equal((await approval.text()).includes("PRIVATE"),false);
  assert.deepEqual(await(await request("/approval/poll",{})).json(),{status:"pending"});
  await new Promise(resolve=>setTimeout(resolve,1010));
  const approved=await request("/approval/poll",{});
  assert.deepEqual(await approved.json(),{status:"approved"});
  const observation=await request("/observation");assert.equal(observation.status,200);
  assert.equal((await observation.text()).includes("NEVER"),false);
  const envelope=new PlayerClient({} as never).prepare({type:"ready",ready:true});
  assert.equal((await request("/commands",envelope)).status,200);
  assert.equal((await request("/commands",envelope)).status,200);
  assert.equal(commandCalls,1);
  assert.equal((await request("/commands",{...envelope,command:{type:"pause"}})).status,409);
  await request("/disconnect",{});
  assert.equal((await request("/observation")).status,401);
});
