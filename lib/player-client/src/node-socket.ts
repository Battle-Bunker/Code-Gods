import WebSocket from "ws";
import type { PlayerSocket, PlayerSocketFactory } from "./socket-transport.ts";

/** Trusted daemon only. Never import into the browser entrypoint. */
export const nodeSocketFactory:PlayerSocketFactory = (url,options) => {
  const socket=new WebSocket(url,{
    headers:options.headers,
    followRedirects:false,
    handshakeTimeout:15000,
    maxPayload:4*1024*1024,
  });
  const adapter:PlayerSocket={
    get readyState(){return socket.readyState;},
    send(data){socket.send(data);},
    close(){socket.close();},
    onopen:null,onclose:null,onerror:null,onmessage:null,
  };
  socket.on("open",()=>adapter.onopen?.());
  socket.on("close",code=>adapter.onclose?.({code}));
  socket.on("error",()=>adapter.onerror?.());
  socket.on("unexpected-response",(_request,response)=>{
    const code=response.statusCode===401?4401:response.statusCode===403?4403:1006;
    response.resume();
    adapter.onclose?.({code});
    socket.terminate();
  });
  socket.on("message",data=>adapter.onmessage?.({data:data.toString()}));
  return adapter;
};
