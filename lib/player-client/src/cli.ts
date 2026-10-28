import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAssistant, parsePlayerUrl } from "./assistant.ts";
import { bridgeRequest, bridgeEnvironment, ensurePrivateDirectory, startLocalBridge } from "./local-bridge.ts";
import { nodeSocketFactory } from "./node-socket.ts";

const directory=join(tmpdir(),`cg-assistant-${process.getuid?.()}-${createHash("sha256").update(process.cwd()).digest("hex").slice(0,16)}`);
const [operation,...args]=process.argv.slice(2);
const output=(value:unknown)=>process.stdout.write(JSON.stringify(value)+"\n");

async function ensureBridge() {
  await ensurePrivateDirectory(directory);
  await bridgeRequest(directory,{op:"status"});
}

async function main() {
  if(operation==="serve") {
    if(args.length)throw new Error("Invalid arguments");
    // Foreground service: a workflow/supervisor owns its lifetime. Detached
    // children of short-lived Agent shells can be reaped even with unref().
    const child=spawn(process.execPath,["--experimental-transform-types",fileURLToPath(import.meta.url),"--bridge"],{
      stdio:"inherit",cwd:process.cwd(),env:bridgeEnvironment(process.env),
    });
    process.on("SIGTERM",()=>child.kill("SIGTERM"));
    process.on("SIGINT",()=>child.kill("SIGINT"));
    process.exitCode=await new Promise<number>(resolve=>{
      child.on("error",()=>resolve(1));
      child.on("exit",code=>resolve(code??1));
    });
    return;
  }
  if(operation==="--bridge") {
    // Socket is 0600 even in the instant between bind and chmod.
    process.umask(0o177);
    const assistant=createAssistant({socketFactory:nodeSocketFactory});
    const server=await startLocalBridge(directory,assistant.handle);
    const stop=()=>{assistant.close();void server.close().finally(()=>process.exit(0));};
    process.on("SIGTERM",stop);process.on("SIGINT",stop);
    output({localBridge:"available",service:"room-assistant"});
    return;
  }
  let request:unknown;
  switch(operation) {
    case "connect": {
      if(args.length<1)throw new Error("Invalid arguments");
      parsePlayerUrl(args[0]);
      const flags=parseFlags(args.slice(1),["permission","label"]);
      const permission=flags.permission??"read",clientLabel=flags.label??"Replit room assistant";
      if(permission!=="read" && permission!=="act" && permission!=="owner")throw new Error("Invalid permission");
      request={op:"connect",args:{url:args[0],permission,clientLabel}};break;
    }
    case "status": case "observation": case "disconnect": case "wake": case "room-state": case "ai-catalog":
      if(args.length)throw new Error("Invalid arguments");
      request={op:operation};break;
    case "events": {
      const flags=parseFlags(args,["after","limit"]);
      request={op:"events",args:{after:Number(flags.after??0),limit:Number(flags.limit??20)}};break;
    }
    case "receipt":
      if(args.length!==1)throw new Error("Invalid arguments");
      request={op:"receipt",args:{commandId:args[0]}};break;
    case "room-command":
    case "command": {
      // Envelope via stdin: source code and private game data never enter shell argv.
      if(args.length>1 || (args[0] && args[0]!=="--retry-unknown"))throw new Error("Invalid arguments");
      if(operation==="room-command" && args.length)throw new Error("Invalid arguments");
      let text="";
      const inputTimeout=setTimeout(()=>process.stdin.destroy(new Error("Input timeout.")),15000);
      try {
        for await(const chunk of process.stdin) {
          text+=chunk.toString();
          if(Buffer.byteLength(text)>24000)throw new Error("Command too large");
        }
      } finally {clearTimeout(inputTimeout);}
      request=operation==="room-command"?{op:operation,args:JSON.parse(text)}:
        {op:"command",args:{envelope:JSON.parse(text),retryUnknown:args[0]==="--retry-unknown"}};
      break;
    }
    default:
      output({usage:"pnpm --filter @workspace/player-client assistant <serve | connect HTTPS_PLAYER_URL [--permission read|act|owner] [--label SELF_REPORTED_LABEL] | status | observation | room-state | room-command < action.json | events [--after N] [--limit N] | command [--retry-unknown] < envelope.json | receipt UUID | disconnect | wake>"});
      process.exitCode=operation?1:0;return;
  }
  try {await ensureBridge();}
  catch {
    output({error:"Local assistant bridge is not running. Start `pnpm --filter @workspace/player-client assistant serve` as a persistent workflow, then connect. No new approval was requested.",localBridge:"unavailable"});
    process.exitCode=1;
    return;
  }
  const result=await bridgeRequest(directory,request);
  output(result);
  if(result && typeof result==="object" && "error" in result)process.exitCode=1;
}
function parseFlags(args:string[],allowed:string[]) {
  const result:Record<string,string>={};
  for(let n=0;n<args.length;n+=2) {
    const key=args[n].slice(2);
    if(!args[n].startsWith("--") || !allowed.includes(key) || key in result || args[n+1]===undefined)
      throw new Error("Invalid flags");
    result[key]=args[n+1];
  }
  return result;
}
void main().catch(()=>{
  // Input and transport exceptions can contain credentials: never print them.
  output({error:"Assistant operation failed. Check arguments and private local bridge access; explicit approval is required after restart."});
  process.exitCode=1;
});
