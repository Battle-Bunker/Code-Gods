import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createPlayerDaemon } from "./daemon.ts";
import { nodeHandler } from "./node-handler.ts";
import { nodeSocketFactory } from "./node-socket.ts";

// Local or explicitly configured HTTPS proxy launcher. No static secret is accepted. The private file contains a
// single-use 60s browser-launch capability, not the upstream room credential.
const [serverUrl, directory, launchFile] = process.argv.slice(2);
if(!serverUrl || !directory || !launchFile) throw new Error("Usage: serve.ts HTTPS_PLAYER_API BUILT_PLAYER_WEB_DIRECTORY PRIVATE_LAUNCH_FILE");
const port=Number(process.env.PORT??4317);
if(!Number.isInteger(port) || port<1 || port>65535) throw new Error("PORT must be an integer from 1 to 65535");
const hostedOrigin=process.env.PLAYER_ORIGIN;
if(hostedOrigin) {
  const configured=new URL(hostedOrigin);
  if(configured.protocol!=="https:" || configured.username || configured.password || configured.pathname!=="/" || configured.search || configured.hash)
    throw new Error("PLAYER_ORIGIN must be a trusted HTTPS origin without credentials, path, query or fragment");
}
const origin=hostedOrigin ? new URL(hostedOrigin).origin : `http://127.0.0.1:${port}`, basePath="/player";
const daemon=createPlayerDaemon({origin,basePath,serverUrl,socketFactory:nodeSocketFactory});
const api=nodeHandler(daemon.handle,origin);
const root=resolve(directory);
const types:Record<string,string>={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png",".woff2":"font/woff2"};
const server=createServer(async(req,res)=>{
  try {
    if(req.url?.startsWith(`${basePath}/daemon/`)) return await api(req,res);
    if(req.headers.host!==new URL(origin).host || req.method!=="GET") {res.writeHead(403);res.end();return;}
    const pathname=decodeURIComponent(new URL(req.url??"/",origin).pathname);
    const file=resolve(root,"."+pathname.replace(/^\/player/,""));
    if(!file.startsWith(root+"/") && file!==root) {res.writeHead(403);res.end();return;}
    const target=file===root||pathname.endsWith("/")?resolve(root,"index.html"):file;
    const content=await readFile(target);
    res.writeHead(200,{"Content-Type":types[extname(target)]??"application/octet-stream","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"});
    res.end(content);
  } catch {if(!res.headersSent)res.writeHead(404);res.end();}
}).listen(port,hostedOrigin?"0.0.0.0":"127.0.0.1",async()=>{
  try {
    await writeFile(launchFile,daemon.launchUrl(),{mode:0o600,flag:"wx"});
  } catch {
    // Never print the capability or a potentially sensitive filesystem path.
    console.error("Cannot create private launch file; choose a new writable private path.");
    daemon.close();server.close();process.exitCode=1;
  }
});
