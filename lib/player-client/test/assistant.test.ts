import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, chmod, lstat, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createAssistant, parsePlayerUrl } from "../src/assistant.ts";
import { bridgeRequest, bridgeEnvironment, ensurePrivateDirectory, startLocalBridge } from "../src/local-bridge.ts";
import { VERSION } from "../src/protocol.ts";
import type { PlayerSocket } from "../src/socket-transport.ts";

const roomId="12345678-1234-4234-8234-123456789abc";
const commandId="12345678-1234-4234-8234-123456789def";
const raw={version:VERSION,roomId,revision:1,phase:"running",language:"python",
  self:{godId:"god",label:"Human",isAI:false,energy:100,ready:true},
  objects:[],agents:[],transformations:[],leaderboard:[],chat:[],
  adminToken:"NEVER",opponentUtilities:["NEVER"]};
const envelope={version:VERSION,commandId,command:{type:"ready",ready:true}};
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function fixture(config:{permission?:"read"|"act";offlineRevoke?:boolean;verificationPath?:string;roomId?:string;clock?:()=>number}={}) {
  const sockets:PlayerSocket[]=[], requests:{path:string;body:Record<string,unknown>;headers:Headers}[]=[];
  let challenge="",mutations=0;
  const fetcher:typeof fetch=async(url,init)=>{
    const path=new URL(String(url)).pathname,body=JSON.parse(String(init?.body??"{}")),headers=new Headers(init?.headers);
    requests.push({path,body,headers});
    assert.equal(init?.redirect,"error");
    if(path.endsWith("/device/request")) {
      challenge=body.challenge;
      assert.deepEqual(Object.keys(body).sort(),["challenge","clientLabel","permission","roomId"]);
      assert.equal(body.roomId,"4B9A");assert.equal(body.clientLabel,"Self reported label");
      return Response.json({deviceId:"DEVICE",deviceSecret:"PRIVATE_DEVICE",roomId:config.roomId??roomId,
        userCode:"HUMAN",verificationPath:config.verificationPath??"/device?code=HUMAN",expiresIn:300,interval:1,
        permission:body.permission});
    }
    if(path.endsWith("/device/poll")) {
      assert.equal(body.deviceSecret,"PRIVATE_DEVICE");
      assert.equal(createHash("sha256").update(body.verifier).digest("base64url"),challenge);
      return Response.json({token:"PRIVATE_BEARER",roomId,godId:"god",expiresIn:900,permission:config.permission??"act"});
    }
    if(path.endsWith("/device/revoke") || path.endsWith("/device/cancel")) {
      if(config.offlineRevoke)throw new Error("PRIVATE_SECRET transport exception");
      if(path.endsWith("/revoke"))assert.equal(headers.get("authorization"),"Bearer PRIVATE_BEARER");
      return Response.json({status:"revoked"});
    }
    if(path==="/api/activity")return Response.json({});
    assert.equal(path,`/api/player/v1/rooms/${roomId}/observation`);
    assert.equal(headers.get("authorization"),"Bearer PRIVATE_BEARER");
    return Response.json(raw);
  };
  const assistant=createAssistant({fetcher,now:config.clock,socketFactory:(url,options)=>{
    assert.equal(url,`wss://game.test/api/rooms/${roomId}/ws`);
    assert.deepEqual(options.headers,{Authorization:"Bearer PRIVATE_BEARER"});
    const socket:PlayerSocket={readyState:1,onopen:null,onclose:null,onerror:null,onmessage:null,
      send(){mutations++;},close(){}};
    sockets.push(socket);return socket;
  }});
  const connect=()=>assistant.handle({op:"connect",args:{url:"https://game.test/player/?room=4B9A",
    permission:config.permission??"act",clientLabel:"Self reported label"}});
  const approve=async()=>{
    const output=await connect();
    await delay(1050);
    assert.equal(sockets.length,1,JSON.stringify(output));
    sockets[0].onopen?.();
    await delay(0);
    return output;
  };
  return {assistant,sockets,requests,connect,approve,get mutations(){return mutations;}};
}

test("assistant URLs require HTTPS, one room and no credentials, hidden query or fragment",()=>{
  assert.deepEqual(parsePlayerUrl("https://example.test/player/?room=4B9A"),{origin:"https://example.test",room:"4B9A"});
  assert.equal(parsePlayerUrl("https://example.test/room/4B9A").room,"4B9A");
  assert.equal(parsePlayerUrl(`https://example.test/rooms/${roomId}`).room,roomId);
  for(const url of [
    "http://example.test/player/?room=4B9A","https://user:secret@example.test/player/?room=4B9A",
    "https://example.test/player/?room=4B9A#secret","https://example.test/player/?room=4B9A&token=SECRET",
    "https://example.test/player/?room=4B9A&room=ABCD","https://example.test/elsewhere?room=4B9A",
    "https://example.test/player/","https://example.test/room/..%2F4B9A",
  ])assert.throws(()=>parsePlayerUrl(url),url);
});

test("approval output allowlists only URL, comparison code, resolved room and permission",async()=>{
  const f=fixture();
  try {
    const result=await f.connect();
    assert.deepEqual(result,{approvalUrl:"https://game.test/device?code=HUMAN",comparisonCode:"HUMAN",room:roomId,permission:"act"});
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE|DEVICE|verifier|token|challenge/);
    assert.equal((await f.assistant.handle({op:"status"}) as any).state,"approval_pending");
  } finally {f.assistant.close();}
});

test("approval URLs cannot exfiltrate device secrets or change authority",async()=>{
  for(const path of ["https://evil.test/device?code=HUMAN","/device?code=HUMAN&secret=PRIVATE_DEVICE",
    "/device?code=PRIVATE_DEVICE","/device?code=HUMAN#PRIVATE_DEVICE","/other?code=HUMAN"]) {
    const f=fixture({verificationPath:path});
    try {
      const result=await f.connect();
      assert.ok((result as any).error);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|evil/);
      assert.equal((await f.assistant.handle({op:"status"}) as any).state,"reapproval_required");
    } finally {f.assistant.close();}
  }
});

test("authenticated socket state, bounded private events, scope-filtered observation and terminal revocation",async()=>{
  const f=fixture();
  try {
    await f.approve();
    assert.equal((await f.assistant.handle({op:"status"}) as any).upstreamConnected,true);
    const observation=await f.assistant.handle({op:"observation"});
    assert.doesNotMatch(JSON.stringify(observation),/NEVER|PRIVATE/);
    f.sockets[0].onmessage?.({data:JSON.stringify({type:"player.observation",protocolVersion:1,payload:{...raw,revision:2,
      chat:[{id:"c",godId:"god",label:"Human",isAI:false,text:"UNTRUSTED_PRIVATE_CHAT"}],
      transformations:[{id:"t",agentId:"a",before:1,after:2}],opponentUtilities:["NEVER"]}})});
    const events=await f.assistant.handle({op:"events",args:{limit:100}});
    assert.match(JSON.stringify(events),/UNTRUSTED_PRIVATE_CHAT/);
    assert.match(JSON.stringify(events),/transformation/);
    assert.doesNotMatch(JSON.stringify(events),/NEVER|PRIVATE_BEARER/);
    assert.ok((await f.assistant.handle({op:"events",args:{limit:101}}) as any).error);
    f.sockets[0].onclose?.({code:1008});
    assert.equal((await f.assistant.handle({op:"status"}) as any).state,"reapproval_required");
    assert.doesNotMatch(JSON.stringify(await f.assistant.handle({op:"events"})),/UNTRUSTED_PRIVATE_CHAT/);
    await delay(1100);
    assert.equal(f.sockets.length,1,"revoked grants must not reconnect");
  } finally {f.assistant.close();}
});

test("read approval cannot submit commands through bridge",async()=>{
  const f=fixture({permission:"read"});
  try {
    await f.approve();
    assert.ok((await f.assistant.handle({op:"command",args:{envelope}}) as any).error);
    assert.equal(f.mutations,0);
    assert.equal(f.requests.filter(r=>r.path.endsWith("/commands")).length,0);
  } finally {f.assistant.close();}
});

test("HTTP observations do not claim an upstream socket is connected; idle requires explicit wake",async()=>{
  const f=fixture();
  try {
    await f.connect();await delay(1050);
    await f.assistant.handle({op:"observation"});
    const status=await f.assistant.handle({op:"status"}) as any;
    assert.equal(status.state,"connecting");assert.equal(status.upstreamConnected,false);
    f.sockets[0].onopen?.();await delay(0);
    f.sockets[0].onclose?.({code:4008});
    assert.equal((await f.assistant.handle({op:"status"}) as any).state,"idle");
    assert.ok((await f.assistant.handle({op:"observation"}) as any).error);
    await delay(1100);assert.equal(f.sockets.length,1);
    assert.deepEqual(await f.assistant.handle({op:"wake"}),{wakeRequested:true});
    assert.equal(f.sockets.length,2);
    assert.equal((await f.assistant.handle({op:"status"}) as any).upstreamConnected,false);
    assert.equal(f.requests.filter(r=>r.path==="/api/activity").length,1);
  } finally {f.assistant.close();}
});

test("assistant rejects poll credentials that differ from authority-resolved room",async()=>{
  const f=fixture({roomId:"12345678-1234-4234-8234-123456789000"});
  try {
    await f.connect();await delay(1050);
    assert.equal(f.sockets.length,0);
    assert.equal((await f.assistant.handle({op:"status"}) as any).state,"reapproval_required");
  } finally {f.assistant.close();}
});

test("reconnect never replays mutation; unknown receipts require explicit retry and original command ID",async()=>{
  const f=fixture();
  try {
    await f.approve();
    const receipt=f.assistant.handle({op:"command",args:{envelope}});
    await delay(0);assert.equal(f.mutations,1);
    f.sockets[0].onclose?.({code:1006});
    assert.equal((await receipt as any).status,"uncertain");
    assert.equal((await f.assistant.handle({op:"command",args:{envelope}}) as any).status,"uncertain");
    await delay(1100);
    assert.equal(f.sockets.length,2);assert.equal(f.mutations,1);
    f.sockets[1].onopen?.();await delay(0);
    const retried=f.assistant.handle({op:"command",args:{envelope,retryUnknown:true}});
    await delay(0);assert.equal(f.mutations,2);
    f.sockets[1].onmessage?.({data:JSON.stringify({type:"command.receipt",payload:{commandId,accepted:true,message:"ack"}})});
    assert.equal((await retried as any).status,"received");
    assert.equal((await f.assistant.handle({op:"receipt",args:{commandId}}) as any).result.accepted,true);
    assert.equal((await f.assistant.handle({op:"command",args:{envelope}}) as any).status,"received");
    assert.equal(f.mutations,2);
    assert.ok((await f.assistant.handle({op:"command",args:{envelope:{...envelope,command:{type:"pause"}}}}) as any).error);
  } finally {f.assistant.close();}
});

test("expiry and fresh bridge require reapproval; disconnected private history is not retained",async()=>{
  let now=Date.now();
  const f=fixture({clock:()=>now});
  try {
    // Poll uses supplied clock, so move it forward before the scheduled poll.
    const connected=await f.connect();assert.ok(!(connected as any).error);
    now+=1100;await delay(1050);
    f.sockets[0].onopen?.();await delay(0);
    now+=901000;
    const status=await f.assistant.handle({op:"status"}) as any;
    assert.equal(status.state,"reapproval_required");assert.equal(status.upstreamConnected,false);
    assert.ok((await f.assistant.handle({op:"observation"}) as any).error);
    assert.equal((await f.assistant.handle({op:"receipt",args:{commandId}}) as any).status,"not_found");
    const fresh=fixture();
    try {assert.equal((await fresh.assistant.handle({op:"status"}) as any).state,"reapproval_required");}
    finally {fresh.assistant.close();}
  } finally {f.assistant.close();}
});

test("read-only wake is rejected locally without losing authorization",async()=>{
  const f=fixture({permission:"read"});
  try {
    await f.approve();
    const before=f.requests.length;
    assert.match(JSON.stringify(await f.assistant.handle({op:"wake"})),/Read-only/);
    assert.equal(f.requests.length,before);
    assert.notEqual((await f.assistant.handle({op:"status"}) as any).state,"reapproval_required");
  } finally {f.assistant.close();}
});

test("disconnect revokes bearer or cancels pending approval; offline failure reports actual expiry",async()=>{
  const f=fixture({offlineRevoke:true});
  try {
    await f.approve();
    const result=await f.assistant.handle({op:"disconnect"}) as any;
    assert.equal(result.remoteRevocation,"unconfirmed");assert.ok(result.remoteAccessExpiresAt>Date.now());
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
    assert.equal((await f.assistant.handle({op:"status"}) as any).state,"reapproval_required");
  } finally {f.assistant.close();}
  const pending=fixture();
  try {
    await pending.connect();
    assert.equal((await pending.assistant.handle({op:"disconnect"}) as any).approvalCancellation,"confirmed");
    assert.equal(pending.requests.at(-1)?.path,"/api/device/cancel");
    assert.equal(pending.requests.at(-1)?.body.deviceSecret,"PRIVATE_DEVICE");
  } finally {pending.assistant.close();}
  const approved=fixture();
  try {
    await approved.approve();
    assert.equal((await approved.assistant.handle({op:"disconnect"}) as any).remoteRevocation,"confirmed");
  } finally {approved.assistant.close();}
});

test("Unix bridge is private, bounded and not an HTTP endpoint; unsafe directories/sockets rejected",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"cg-assistant-test-"));
  await chmod(directory,0o700);
  const server=await startLocalBridge(directory,async input=>({echo:input}));
  try {
    assert.equal((await lstat(join(directory,"assistant.sock"))).mode&0o777,0o600);
    assert.deepEqual(await bridgeRequest(directory,{op:"status"}),{echo:{op:"status"}});
    await assert.rejects(()=>startLocalBridge(directory,async()=>({})),/already running/);
    await assert.rejects(()=>bridgeRequest(directory,{op:"A".repeat(25000)}));
    await chmod(directory,0o755);
    await assert.rejects(()=>ensurePrivateDirectory(directory),/owner-only/);
    await chmod(directory,0o700);
    await chmod(join(directory,"assistant.sock"),0o666);
    await assert.rejects(()=>bridgeRequest(directory,{op:"status"}),/Unsafe/);
    await chmod(join(directory,"assistant.sock"),0o600);
    const linked=directory+"-link";
    await symlink(directory,linked);
    try {await assert.rejects(()=>ensurePrivateDirectory(linked),/owner-only/);}
    finally {await rm(linked);}
  } finally {await server.close();await rm(directory,{recursive:true,force:true});}
});

test("detached bridge environment excludes workspace, provider, cookie and Node injection credentials",()=>{
  assert.deepEqual(bridgeEnvironment({
    PATH:"/bin",DATABASE_URL:"PRIVATE_DATABASE",OPENAI_API_KEY:"PRIVATE_PROVIDER",
    COOKIE:"PRIVATE_COOKIE",NODE_OPTIONS:"--require PRIVATE_CODE",HTTP_PROXY:"PRIVATE_PROXY",
  }),{PATH:"/bin",LANG:"C.UTF-8",NODE_NO_WARNINGS:"1",TMPDIR:tmpdir()});
});

test("CLI flag contract and approval JSON are usable without printing secrets or cookie material",async()=>{
  const cwd=await mkdtemp(join(tmpdir(),"cg-cli-test-"));
  const directory=join(tmpdir(),`cg-assistant-${process.getuid?.()}-${createHash("sha256").update(cwd).digest("hex").slice(0,16)}`);
  const received:any[]=[];
  const server=await startLocalBridge(directory,async input=>{
    received.push(input);
    return (input as any).op==="connect"?{approvalUrl:"https://game.test/device?code=HUMAN",comparisonCode:"HUMAN",room:roomId,permission:"read"}:
      {state:"reapproval_required"};
  });
  async function run(args:string[]) {
    const child=spawn(process.execPath,["--disable-warning=ExperimentalWarning","--experimental-transform-types",
      fileURLToPath(new URL("../src/cli.ts",import.meta.url)),...args],{
      cwd,env:{...process.env,DATABASE_URL:"DO_NOT_PRINT",OPENAI_API_KEY:"DO_NOT_PRINT"},
    });
    let stdout="",stderr="";
    child.stdout.on("data",d=>{stdout+=d;});child.stderr.on("data",d=>{stderr+=d;});
    const code=await new Promise<number|null>(resolve=>child.on("close",resolve));
    return {code,stdout,stderr};
  }
  try {
    const result=await run(["connect","https://game.test/player/?room=4B9A","--permission","read","--label","Self reported label"]);
    assert.equal(result.code,0);assert.equal(result.stderr,"");
    assert.deepEqual(Object.keys(JSON.parse(result.stdout)).sort(),["approvalUrl","comparisonCode","permission","room"]);
    assert.deepEqual(received.at(-1),{op:"connect",args:{url:"https://game.test/player/?room=4B9A",permission:"read",clientLabel:"Self reported label"}});
    const events=await run(["events","--limit","20","--after","5"]);
    assert.equal(events.code,0);
    assert.deepEqual(received.at(-1),{op:"events",args:{after:5,limit:20}});
    const invalid=await run(["connect","https://user:PRIVATE_SECRET@game.test/player/?room=4B9A"]);
    assert.equal(invalid.code,1);assert.doesNotMatch(invalid.stdout+invalid.stderr,/PRIVATE_SECRET|DO_NOT_PRINT/);
  } finally {await server.close();await rm(directory,{recursive:true,force:true});await rm(cwd,{recursive:true,force:true});}
});

test("foreground bridge survives separate CLI calls; missing service never silently replaces it",async()=>{
  const cwd=await mkdtemp(join(tmpdir(),"cg-cli-service-test-"));
  const directory=join(tmpdir(),`cg-assistant-${process.getuid?.()}-${createHash("sha256").update(cwd).digest("hex").slice(0,16)}`);
  const cli=fileURLToPath(new URL("../src/cli.ts",import.meta.url));
  const nodeArgs=["--disable-warning=ExperimentalWarning","--experimental-transform-types",cli];
  async function status() {
    const child=spawn(process.execPath,[...nodeArgs,"status"],{cwd,stdio:["ignore","pipe","ignore"]});
    let text="";child.stdout.on("data",chunk=>{text+=chunk;});
    const code=await new Promise(resolve=>child.on("close",resolve));
    return {code,data:JSON.parse(text)};
  }
  const absent=await status();
  assert.equal(absent.code,1);
  assert.equal(absent.data.localBridge,"unavailable");
  const service=spawn(process.execPath,[...nodeArgs,"serve"],{cwd,stdio:["ignore","pipe","pipe"]});
  const stopped=new Promise(resolve=>service.on("close",resolve));
  try {
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Bridge readiness timed out")),5000);
      service.stdout.on("data",chunk=>{
        if(String(chunk).includes('"localBridge":"available"')){clearTimeout(timer);resolve();}
      });
      service.on("error",error=>{clearTimeout(timer);reject(error);});
    });
    for(let i=0;i<2;i++){
      const result=await status();
      assert.equal(result.code,0);
      assert.equal(result.data.localBridge,"available");
      assert.equal(service.exitCode,null);
    }
    service.kill("SIGTERM");await stopped;
    const result=await status();
    assert.equal(result.code,1);
    assert.equal(result.data.localBridge,"unavailable");
  } finally {
    if(service.exitCode===null)service.kill("SIGTERM");
    await stopped;
    await rm(directory,{recursive:true,force:true});
    await rm(cwd,{recursive:true,force:true});
  }
});
