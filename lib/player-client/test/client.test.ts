import { test } from "node:test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { nodeSocketFactory } from "../src/node-socket.ts";
import assert from "node:assert/strict";
import { VERSION, commandSchema, observationSchema } from "../src/protocol.ts";
import { HttpPlayerTransport, PlayerClient } from "../src/transport.ts";
import { WebSocketPlayerTransport, type PlayerSocket } from "../src/socket-transport.ts";
import { createPlayerDaemon } from "../src/daemon.ts";
const raw = {version:VERSION,roomId:"room",revision:1,phase:"running",language:"python",self:{godId:"god",label:"Human",isAI:false,energy:100,ready:true,utility:{familyId:"zebra",emoji:"🦓",name:"Zebra",theme:"stripes",summary:"stripes",language:"python",source:"own"}},objects:[{id:"o",value:1,own:{ordinal:1,rewardBits:1,netBits:1},peerNetBits:2,peerCare:2,payoff:2,opponentUtilities:[1,1],peerScores:{a:1}}],agents:[{id:"a",source:"def agent(x):\n    return [add(1)]",language:"python",summonCost:11,decisionBits:0.5,expectedActCost:5,breakdown:{decision:0.5,erasure:0,motion:4.5,floor:0},randomized:false,energy:-1,eligible:false,acts:2,spent:9}],transformations:[],leaderboard:[],chat:[],adminToken:"NEVER"};
test("projection strips hidden fields and bounds commands",()=>{
  assert.equal(JSON.stringify(observationSchema.parse(raw)).includes("NEVER"),false);
  assert.equal(JSON.stringify(observationSchema.parse(raw)).includes("opponentUtilities"),false);
  assert.equal(JSON.stringify(observationSchema.parse(raw)).includes("peerScores"),false);
  assert.equal(VERSION,"code-gods.player.v3");
  assert.throws(()=>observationSchema.parse({...raw,version:"code-gods.player.v2"}),"v2 observations are a clear version error");
  assert.throws(()=>observationSchema.parse({...raw,objects:[{id:"o",value:1,ownUtility:1,othersUtilitySum:2,score:2}]}));
  assert.deepEqual(commandSchema.parse({type:"destroy",agentId:"a"}),{type:"destroy",agentId:"a"});
  for(const command of [{type:"dm",text:"hi"},{type:"start"},{type:"chat",text:"hi",recipient:"god"},{type:"summon",language:"python",source:"x".repeat(16385)}]) assert.throws(()=>commandSchema.parse(command));
  assert.throws(()=>commandSchema.parse({type:"validate",language:"python",source:"é".repeat(9000)}));
  const extended=observationSchema.parse({...raw,gameId:"game",planningEndsAt:123,pauseEndsAt:456,self:{...raw.self,pauseUsed:true}});
  assert.equal(extended.gameId,"game");assert.equal(extended.self.pauseUsed,true);
  const client=new PlayerClient({} as never);
  assert.equal(client.prepare({type:"pause"},extended).gameId,"game");
  assert.equal(client.prepare({type:"chat",text:"Public"},extended).gameId,undefined);
});
test("transport credentials expire, bind identity and never follow redirects",async()=>{
  let options:RequestInit|undefined;
  const transport=new HttpPlayerTransport("https://game.test/player/v1",async(_url,init)=>{
    options=init;return Response.json(raw);
  });
  await assert.rejects(()=>transport.observe());
  assert.throws(()=>transport.approve({token:"test",roomId:"room",godId:"god",expiresAt:Date.now()+5*60*60_000}));
  transport.approve({token:"test",roomId:"room",godId:"other",expiresAt:Date.now()+60_000});
  await assert.rejects(()=>transport.observe(),/identity mismatch/);
  assert.equal(options?.redirect,"error");
  transport.disconnect();await assert.rejects(()=>transport.observe());
  assert.throws(()=>new HttpPlayerTransport("https://user:password@game.test"));
  await assert.rejects(()=>transport.send({version:VERSION,commandId:crypto.randomUUID(),command:{type:"start"}} as never));
});
test("HTTP idle response latches until explicit wake and expired credentials never refresh",async()=>{
  let requests=0;
  const transport=new HttpPlayerTransport("https://game.test/api/player/v1",async()=>{
    requests++;return Response.json({code:"SERVER_IDLE"},{status:503});
  });
  transport.approve({token:"PRIVATE",roomId:"room",godId:"god",expiresAt:Date.now()+60000});
  await assert.rejects(()=>transport.observe(),/idle/);
  await assert.rejects(()=>transport.observe(),/idle/);
  assert.equal(requests,1);
  transport.disconnect();
  await assert.rejects(()=>transport.wake(),/401/);
  assert.equal(requests,1);
});
test("WebSocket uses Authorization, private observations and commandId receipts",async()=>{
  let sent="";
  const socket:PlayerSocket={readyState:1,onopen:null,onclose:null,onerror:null,onmessage:null,close(){},send(data){sent=data;}};
  const transport=new WebSocketPlayerTransport("https://game.test/api/player/v1",(url,options)=>{
    assert.equal(url,"wss://game.test/api/rooms/room/ws");
    assert.deepEqual(options.headers,{Authorization:"Bearer PRIVATE"});
    return socket;
  },async()=>Response.json(raw));
  let observations=0;
  transport.subscribe(()=>observations++);
  transport.approve({token:"PRIVATE",roomId:"room",godId:"god",expiresAt:Date.now()+60000});
  socket.onmessage?.({data:JSON.stringify({protocolVersion:1,type:"room.snapshot",payload:raw})});
  assert.equal(observations,0);
  socket.onmessage?.({data:JSON.stringify({protocolVersion:1,type:"player.observation",payload:raw})});
  assert.equal(observations,1);
  const envelope=new PlayerClient(transport).prepare({type:"ready",ready:true});
  const result=transport.send(envelope);
  assert.deepEqual(JSON.parse(sent),envelope);
  socket.onmessage?.({data:JSON.stringify({type:"command.receipt",payload:{commandId:envelope.commandId,accepted:true,message:"ack"}})});
  assert.equal((await result).accepted,true);
  const pending=transport.send(new PlayerClient(transport).prepare({type:"pause"}));
  transport.disconnect();
  await assert.rejects(()=>pending,/same command ID/);
});
test("idle close stops reconnect and HTTP until explicit authenticated wake",async()=>{
  let connects=0, requests=0;
  const socket:PlayerSocket={readyState:1,onopen:null,onclose:null,onerror:null,onmessage:null,close(){},send(){}};
  const transport=new WebSocketPlayerTransport("https://game.test/api/player/v1",()=>{connects++;return socket;},async(url,init)=>{
    requests++;
    if(String(url).endsWith("/api/activity")){assert.equal(init?.method,"POST");assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer PRIVATE");return Response.json({});}
    return Response.json(raw);
  });
  transport.approve({token:"PRIVATE",roomId:"room",godId:"god",expiresAt:Date.now()+60000});
  socket.onclose?.({code:4008});
  await assert.rejects(()=>transport.observe(),/idle/);
  await new Promise(resolve=>setTimeout(resolve,1100));
  assert.equal(connects,1);assert.equal(requests,0);
  await transport.wake();
  assert.equal(connects,2);assert.equal(requests,1);
  transport.disconnect();
});
test("transient drop retries within jitter bound, rehydrates and rejects old socket snapshots",async()=>{
  const sockets:PlayerSocket[]=[];
  let snapshots=0;
  const transport=new WebSocketPlayerTransport("https://game.test/api/player/v1",()=>{
    const socket:PlayerSocket={readyState:1,onopen:null,onclose:null,onerror:null,onmessage:null,close(){},send(){}};
    sockets.push(socket);return socket;
  },async()=>{snapshots++;return Response.json({...raw,revision:1});});
  const revisions:number[]=[];
  transport.subscribe(o=>revisions.push(o.revision));
  transport.approve({token:"PRIVATE",roomId:"room",godId:"god",expiresAt:Date.now()+60000});
  sockets[0].onmessage?.({data:JSON.stringify({protocolVersion:1,type:"player.observation",payload:{...raw,revision:100}})});
  sockets[0].onclose?.({code:1006});
  assert.equal(sockets.length,1);
  await new Promise(resolve=>setTimeout(resolve,1100));
  assert.equal(sockets.length,2);
  sockets[1].onopen?.();
  await new Promise(resolve=>setTimeout(resolve,0));
  sockets[0].onmessage?.({data:JSON.stringify({protocolVersion:1,type:"player.observation",payload:{...raw,revision:101}})});
  assert.equal(snapshots,1);assert.deepEqual(revisions,[100,1]);
  transport.disconnect();
});
test("stock daemon socket factory connects with bearer headers and receives real receipts",async()=>{
  const server=createServer((_request,response)=>{
    response.setHeader("Content-Type","application/json");
    response.end(JSON.stringify(raw));
  });
  const sockets=new WebSocketServer({server,path:"/api/rooms/room/ws"});
  let authorization="";
  sockets.on("connection",(socket,request)=>{
    authorization=request.headers.authorization??"";
    socket.send(JSON.stringify({protocolVersion:1,type:"player.observation",payload:raw}));
    socket.on("message",data=>{
      const envelope=JSON.parse(String(data));
      socket.send(JSON.stringify({protocolVersion:1,type:"command.receipt",payload:{commandId:envelope.commandId,accepted:true,message:"ack"}}));
    });
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();
  assert.ok(address && typeof address==="object");
  const transport=new WebSocketPlayerTransport(`http://127.0.0.1:${address.port}/api/player/v1`,nodeSocketFactory);
  try {
    const observation=new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error("Missing private WebSocket observation")),3000);
      transport.subscribe(()=>{clearTimeout(timeout);resolve();},error=>{clearTimeout(timeout);reject(error);});
    });
    transport.approve({token:"PRIVATE",roomId:"room",godId:"god",expiresAt:Date.now()+60000});
    await observation;
    assert.equal(authorization,"Bearer PRIVATE");
    const envelope=new PlayerClient(transport).prepare({type:"ready",ready:true});
    assert.equal((await transport.send(envelope)).commandId,envelope.commandId);
  } finally {
    transport.disconnect();
    for(const socket of sockets.clients)socket.terminate();
    await new Promise<void>(resolve=>sockets.close(()=>resolve()));
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
test("daemon rejects unauthenticated, cross-origin, CSRF and replay; approval keeps tokens private",async()=>{
  const origin="https://local.test",basePath="/player";
  const roomId="12345678-1234-4234-8234-123456789abc";
  let commandCalls=0;
  let challenge="";
  const fetcher:typeof fetch=async(url,init)=>{
    const path=String(url),body=JSON.parse(String(init?.body??"{}"));
    if(path.endsWith("/device/request")) {
      assert.equal(path,"https://game.test/api/device/request");
      challenge=body.challenge;
      assert.equal(typeof challenge,"string");assert.equal(challenge.length,43);
      assert.deepEqual(Object.keys(body).sort(),["challenge","roomId"]);
      return Response.json({deviceId:"DEVICE",deviceSecret:"PRIVATE_DEVICE",roomId,userCode:"HUMAN",verificationPath:"/approve",expiresIn:60,interval:1});
    }
    if(path.endsWith("/device/poll")) {
      assert.equal(body.deviceSecret,"PRIVATE_DEVICE");
      assert.equal(createHash("sha256").update(body.verifier).digest("base64url"),challenge);
      return Response.json({token:"PRIVATE_ROOM",roomId,godId:"god",expiresIn:14400});
    }
    assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer PRIVATE_ROOM");
    if(path.endsWith("/commands")) {commandCalls++;return Response.json({commandId:body.commandId,accepted:true,message:"ack"});}
    return Response.json({...raw,roomId});
  };
  const daemon=createPlayerDaemon({origin,basePath,serverUrl:"https://game.test/api/player/v1",fetcher});
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
  assert.equal((await request("/approval",{roomId},{"x-csrf-token":""})).status,403);
  const approval=await request("/approval",{roomId});
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
for(const scenario of [
  {name:"short code resolves to canonical room",input:"28t5cy",approved:true},
  {name:"short code rejects credentials for another room",input:"28T5CY",wrongPoll:true},
  {name:"GUID rejects credentials for another room",input:"12345678-1234-4234-8234-123456789abc",wrongPoll:true},
  {name:"request must return a canonical room",input:"28T5CY",requestRoom:"28T5CY",requestStatus:400},
  {name:"missing canonical room fails closed",input:"28T5CY",omitRoom:true,requestStatus:400},
  {name:"GUID request cannot change rooms",input:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",requestStatus:502},
]) {
  test(`daemon approval: ${scenario.name}`,async()=>{
    const origin="https://local.test",basePath="/player";
    const roomId="12345678-1234-4234-8234-123456789abc";
    const otherRoom="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    let challenge="",polls=0,observations=0;
    const fetcher:typeof fetch=async(url,init)=>{
      const body=JSON.parse(String(init?.body??"{}"));
      assert.equal(init?.redirect,"error");
      if(String(url).endsWith("/device/request")) {
        assert.equal(body.roomId,scenario.input);
        challenge=body.challenge;
        return Response.json({deviceId:"DEVICE",deviceSecret:"PRIVATE_DEVICE",...(!scenario.omitRoom?{roomId:scenario.requestRoom??roomId}:{}),userCode:"HUMAN",verificationPath:"/device?code=HUMAN",expiresIn:60,interval:1});
      }
      if(String(url).endsWith("/device/poll")) {
        polls++;
        assert.equal(body.deviceSecret,"PRIVATE_DEVICE");
        assert.equal(createHash("sha256").update(body.verifier).digest("base64url"),challenge);
        return Response.json({token:"PRIVATE_TOKEN",roomId:scenario.wrongPoll?otherRoom:roomId,godId:"god",expiresIn:900});
      }
      observations++;
      assert.match(String(url),new RegExp(`/rooms/${roomId}/observation$`));
      assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer PRIVATE_TOKEN");
      return Response.json({...raw,roomId});
    };
    const daemon=createPlayerDaemon({origin,basePath,serverUrl:"https://game.test/api/player/v1",fetcher});
    let cookie="",csrf="";
    const request=(path:string,body?:unknown)=>daemon.handle(new Request(`${origin}${basePath}/daemon${path}`,{
      method:body===undefined?"GET":"POST",
      headers:{origin,cookie,"content-type":"application/json","x-csrf-token":csrf},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    }));
    try {
      const ticket=new URL(daemon.launchUrl()).hash.slice("#launch=".length);
      cookie=(await request("/session",{ticket})).headers.get("set-cookie")!.split(";")[0];
      csrf=(await (await request("/session")).json()).csrf;
      const response=await request("/approval",{roomId:scenario.input});
      assert.equal(response.status,scenario.requestStatus??200);
      const approval=await response.json();
      assert.equal(JSON.stringify(approval).includes("PRIVATE"),false);
      if(scenario.requestStatus) {
        assert.equal((await request("/approval/poll",{})).status,410);
        assert.equal(polls,0);
      } else {
        assert.deepEqual(Object.keys(approval).sort(),["userCode","verificationUri"]);
        await new Promise(resolve=>setTimeout(resolve,1010));
        const poll=await request("/approval/poll",{});
        assert.equal(poll.status,scenario.approved?200:502);
        assert.deepEqual(await poll.json(),scenario.approved?{status:"approved"}:{error:"Player service unavailable"});
        assert.equal(polls,1);
      }
      assert.equal((await (await request("/session")).json()).connected,!!scenario.approved);
      assert.equal((await request("/observation")).status,scenario.approved?200:401);
      assert.equal(observations,scenario.approved?1:0);
    } finally {daemon.close();}
  });
}
