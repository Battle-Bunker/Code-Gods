import type { IncomingMessage, ServerResponse } from "node:http";
/** Adapter imposes byte limits before buffering; does not trust forwarded Host headers. */
export function nodeHandler(handle:(request:Request)=>Promise<Response>, origin:string) {
  return async (req:IncomingMessage,res:ServerResponse) => {
    if(req.headers.host !== new URL(origin).host) {res.writeHead(403);res.end();return;}
    const chunks:Buffer[]=[]; let size=0;
    for await (const chunk of req) {
      size+=chunk.length;
      if(size>24000) {res.writeHead(413);res.end();return;}
      chunks.push(Buffer.from(chunk));
    }
    const headers=new Headers();
    for(const [key,value] of Object.entries(req.headers)) if(value) headers.set(key,Array.isArray(value)?value.join(","):value);
    const response=await handle(new Request(new URL(req.url??"/",origin),{
      method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{}),
    }));
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
