import { VERSION, commandSchema, observationSchema, resultSchema, type Command, type CommandResult, type Envelope, type Observation } from "@workspace/player-client";
export type { Command, CommandResult, Observation };
const base = `${import.meta.env.BASE_URL}daemon`;
let csrf = "";
let room = "";
let daemon = false;
let signedIn = false;
let gameId:string|undefined;
const commandEnvelopes=new Map<string,Envelope>();
export const isDaemonMode = () => daemon;
export const loginUrl = () => `/api/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
export function parseRoom(value: string): string {
  let id = value.trim();
  if (/^https?:\/\//i.test(id)) {
    const url = new URL(id);
    if (url.origin !== location.origin && !daemon) throw new Error("Open this room link on its server, then choose Player console there. Browser login is same-origin.");
    id = url.searchParams.get("room") ?? url.pathname.match(/\/rooms\/([^/]+)/)?.[1] ?? "";
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Enter a complete room UUID or room link.");
  return id;
}
async function request<T>(path:string, body?:unknown, local = daemon):Promise<T> {
  const response = await fetch(`${local ? base : ""}${path}`, {
    credentials:"same-origin", cache:"no-store", redirect:"error", signal:AbortSignal.timeout(15000),
    method: body ? "POST":"GET", headers:{"Content-Type":"application/json", ...(local ? {"X-CSRF-Token":csrf} : {})},
    ...(body ? {body:JSON.stringify(body)}:{})
  });
  if (!(response.headers.get("content-type")??"").includes("application/json")) throw new Error("Player service is not connected. No game action was sent.");
  const data = await response.json();
  if (!response.ok) {
    const detail = typeof data?.error === "string" ? data.error : typeof data?.message === "string" ? data.message : "";
    throw new Error(response.status===401 ? (local ? "Open the private launch link from your player daemon to authenticate." : "Sign in with Replit on this server before joining.") : detail || `Player request failed (${response.status}).`);
  }
  return data;
}
export async function connectSession() {
  const ticket = new URLSearchParams(location.hash.slice(1)).get("launch");
  daemon = !!ticket || location.hostname === "127.0.0.1" || location.hostname === "localhost" || sessionStorage.getItem("player-daemon") === "1";
  if (daemon) {
    sessionStorage.setItem("player-daemon","1");
    if(ticket) { history.replaceState(null,"",location.pathname + location.search); await request("/session",{ticket}); }
    const session = await request<{csrf:string;connected:boolean}>("/session"); csrf=session.csrf;
    return {...session, requiresLogin:false};
  }
  const auth = await request<{user:{id:string;name:string}|null}>("/api/auth/user",undefined,false);
  signedIn = !!auth.user;
  const target = new URLSearchParams(location.search).get("room");
  if (signedIn && target) {
    await joinRoom(target);
    return {connected:true, requiresLogin:false};
  }
  return {connected:false, requiresLogin:!signedIn};
}
async function joinRoom(value:string) {
  const id = parseRoom(value);
  if (!signedIn) throw new Error("Sign in with Replit before joining this room.");
  await request(`/api/rooms/${encodeURIComponent(id)}/actions`,{action:"join",requestId:crypto.randomUUID()},false);
  room = id;
  const url = new URL(location.href); url.searchParams.set("room",id);
  history.replaceState(null,"",url.pathname + url.search);
}
export async function beginApproval(value:string) {
  const roomId = parseRoom(value);
  if(daemon) return request<{verificationUri:string;userCode:string}>("/approval",{roomId});
  await joinRoom(roomId);
  return null;
}
export const pollApproval = () => request<{status:"pending"|"approved"}>("/approval/poll",{});
const playerPath = (path:string) => daemon ? `/${path}` : `/api/player/v1/rooms/${encodeURIComponent(room)}/${path}`;
export const getObservation = async () => {
  const observation = observationSchema.parse(await request<Observation>(playerPath("observation")));
  if(!daemon && observation.roomId !== room) throw new Error("Observation room mismatch.");
  gameId=observation.gameId;
  return observation;
};
export const sendCommand = async (command:Command, commandId=crypto.randomUUID()) => {
  // Keep the entire prepared envelope stable when retrying an uncertain outcome.
  const prior=commandEnvelopes.get(commandId);
  if(!prior && commandEnvelopes.size>=2000) throw new Error("Session command limit reached. Disconnect and reconnect.");
  const envelope=prior ?? {version:VERSION,commandId,command:commandSchema.parse(command),...(["validate","summon","pause"].includes(command.type) && gameId ? {gameId} : {})};
  if(prior && JSON.stringify(prior.command)!==JSON.stringify(commandSchema.parse(command))) throw new Error("Command ID reused with different payload.");
  commandEnvelopes.set(commandId,envelope);
  const result=resultSchema.parse(await request<CommandResult>(playerPath("commands"),envelope));
  if(result.commandId!==commandId) throw new Error("Command receipt mismatch.");
  return result;
};
// The server emits a complete private observation on connect and every commit.
// HTTP snapshots cover reconnect gaps; legacy public snapshots are never projected.
export function subscribeObservation(onObservation:(observation:Observation)=>void, onError:(error:string)=>void) {
  if (daemon) return () => {};
  let stopped = false;
  let socket:WebSocket|undefined;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let attempt = 0;
  const connect = () => {
    if(stopped) return;
    const url = new URL(`/api/rooms/${encodeURIComponent(room)}/ws`,location.origin);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempt = 0;
      void getObservation().then(o => {if(!stopped) onObservation(o);}).catch(e => {if(!stopped) onError(String(e.message));});
    };
    socket.onmessage = event => {
      if(stopped) return;
      try {
        const message = JSON.parse(event.data);
        if(message.protocolVersion !== 1 || message.type !== "player.observation") return;
        const observation = observationSchema.parse(message.payload);
        if(observation.roomId !== room) throw new Error("Observation room mismatch.");
        gameId=observation.gameId;
        onObservation(observation);
      } catch(e) {onError(e instanceof Error ? e.message : "Invalid player observation.");}
    };
    socket.onerror = () => {if(!stopped) onError("Live connection interrupted; reconnecting with HTTP snapshots.");};
    socket.onclose = () => {
      if(stopped) return;
      onError("Live connection closed; reconnecting with HTTP snapshots.");
      timer = setTimeout(connect,Math.min(1000 * 2 ** attempt++,15000));
    };
  };
  connect();
  return () => {stopped=true;clearTimeout(timer);socket?.close();};
}
export const disconnect = async () => {
  try {if(daemon) await request("/disconnect",{});}
  finally {csrf="";room="";gameId=undefined;commandEnvelopes.clear();if(!daemon) {const url=new URL(location.href);url.searchParams.delete("room");history.replaceState(null,"",url.pathname+url.search);}}
};
