import { useSyncExternalStore } from "react";

let idle=false;
let lastActivity=0;
let visited=false;
let visitReady=false;
const listeners=new Set<()=>void>();
export const serverIdle=()=>idle;
export function markServerIdle(error?:unknown) {
  if(error && (error as {data?:{code?:string}}).data?.code!=="SERVER_IDLE")return;
  idle=true;listeners.forEach(fn=>fn());
}
export const useServerIdle=()=>useSyncExternalStore(
  fn=>{listeners.add(fn);return ()=>{listeners.delete(fn);};},serverIdle,
);
// Authenticated game queries wait for the initial human wake to finish.
export const useActivityReady=()=>useSyncExternalStore(
  fn=>{listeners.add(fn);return ()=>{listeners.delete(fn);};},()=>visitReady,
);
export async function resumeServer() {
  const response=await fetch("/api/activity",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Resume failed (${response.status}). Sign in again if your session expired.`);
  idle=false;visitReady=true;lastActivity=Date.now();listeners.forEach(fn=>fn());
}
export function humanVisit() {
  if(visited)return;
  visited=true;
  void resumeServer().catch(()=>markServerIdle());
}
export function humanActivity(event:Event) {
  if(!event.isTrusted || idle || Date.now()-lastActivity<60000)return;
  lastActivity=Date.now();
  void resumeServer().catch(()=>{});
}
