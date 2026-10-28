import { createServer, createConnection, type Server } from "node:net";
import { lstat, mkdir, chmod, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MAX_REQUEST=24000, MAX_RESPONSE=256*1024;
/** Explicit allowlist: never propagate workspace DB/provider secrets or NODE_OPTIONS. */
export function bridgeEnvironment(environment:NodeJS.ProcessEnv):NodeJS.ProcessEnv {
  return {PATH:environment.PATH??"/usr/bin:/bin",LANG:"C.UTF-8",NODE_NO_WARNINGS:"1",TMPDIR:tmpdir()};
}
export async function ensurePrivateDirectory(directory:string) {
  try {await mkdir(directory,{mode:0o700});}
  catch(error) {if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;}
  const stat=await lstat(directory);
  if(!stat.isDirectory() || stat.isSymbolicLink() || stat.uid!==process.getuid?.() || (stat.mode&0o777)!==0o700)
    throw new Error("Bridge directory must be owner-only (0700), owned by the current Unix user.");
}
async function checkSocket(path:string) {
  const stat=await lstat(path);
  if(!stat.isSocket() || stat.uid!==process.getuid?.() || (stat.mode&0o777)!==0o600)
    throw new Error("Unsafe bridge socket.");
}

/** Newline-delimited JSON over a filesystem-protected Unix socket, never HTTP. */
export async function bridgeRequest(directory:string,request:unknown):Promise<unknown> {
  await ensurePrivateDirectory(directory);
  const path=join(directory,"assistant.sock");
  await checkSocket(path);
  return new Promise((resolve,reject)=>{
    const socket=createConnection(path);
    let data="",done=false;
    const fail=()=>{if(done)return;done=true;socket.destroy();reject(new Error("Local bridge unavailable."));};
    socket.setTimeout(20000,fail);
    socket.on("error",fail);
    socket.on("end",()=>{if(!done)fail();});
    socket.on("connect",()=>{
      const text=JSON.stringify(request)+"\n";
      if(Buffer.byteLength(text)>MAX_REQUEST){fail();return;}
      socket.write(text);
    });
    socket.on("data",chunk=>{
      data+=chunk.toString();
      if(Buffer.byteLength(data)>MAX_RESPONSE){fail();return;}
      const end=data.indexOf("\n");
      if(end<0)return;
      try {const value=JSON.parse(data.slice(0,end));done=true;socket.destroy();resolve(value);}
      catch {fail();}
    });
  });
}

export async function startLocalBridge(directory:string,handle:(input:unknown)=>Promise<unknown>) {
  await ensurePrivateDirectory(directory);
  const path=join(directory,"assistant.sock");
  try {
    await checkSocket(path);
    // Do not unlink a live bridge. Stale sockets contain no persisted authorization.
    try {await bridgeRequest(directory,{op:"status"});throw new Error("Bridge already running.");}
    catch(error) {
      if(error instanceof Error && error.message==="Bridge already running.")throw error;
      await unlink(path);
    }
  } catch(error) {if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  let busy=false,connections=0;
  const server:Server=createServer(socket=>{
    connections++;
    if(connections>8){connections--;socket.destroy();return;}
    socket.on("close",()=>{connections--;});
    socket.on("error",()=>{});
    socket.setTimeout(20000,()=>socket.destroy());
    let data="",started=false;
    socket.on("data",chunk=>{
      if(started)return;
      data+=chunk.toString();
      if(Buffer.byteLength(data)>MAX_REQUEST){socket.destroy();return;}
      const end=data.indexOf("\n");if(end<0)return;
      started=true;
      if(busy){socket.end(JSON.stringify({error:"Bridge busy; retry explicitly."})+"\n");return;}
      busy=true;
      void (async()=>{
        try {
          const result=await handle(JSON.parse(data.slice(0,end)));
          const output=JSON.stringify(result);
          socket.end((Buffer.byteLength(output)<=MAX_RESPONSE?output:JSON.stringify({error:"Response exceeded local output limit."}))+"\n");
        } catch {socket.end(JSON.stringify({error:"Invalid bridge request."})+"\n");}
        finally {busy=false;}
      })();
    });
  });
  const previousMask=process.umask(0o177);
  try {
    await new Promise<void>((resolve,reject)=>{
      server.once("error",reject);server.listen(path,()=>resolve());
    });
  } finally {process.umask(previousMask);}
  await chmod(path,0o600);
  return {close:async()=>{
    server.close();await unlink(path).catch(()=>{});
  }};
}
