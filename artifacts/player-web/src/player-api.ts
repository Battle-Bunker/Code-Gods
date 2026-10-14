import { observationSchema, resultSchema, type Command, type CommandResult, type Observation } from "@workspace/player-client";
export type { Command, CommandResult, Observation };
const base = `${import.meta.env.BASE_URL}daemon`;
let csrf = "";
async function request<T>(path:string, body?:unknown):Promise<T> {
  const response = await fetch(`${base}${path}`, { credentials:"same-origin", cache:"no-store", method: body ? "POST":"GET", headers:{"Content-Type":"application/json","X-CSRF-Token":csrf}, ...(body ? {body:JSON.stringify(body)}:{}) });
  if (!response.ok) throw new Error(response.status===401 ? "Open the private launch link from your player daemon to authenticate." : response.status===503 ? "Player daemon is not configured. The coordinator must connect the authoritative service." : `Player request failed (${response.status}).`);
  if (!(response.headers.get("content-type")??"").includes("application/json")) throw new Error("Player daemon is not connected. No game action was sent.");
  return response.json();
}
export async function connectSession() {
  const ticket = new URLSearchParams(location.hash.slice(1)).get("launch");
  if(ticket) { history.replaceState(null,"",location.pathname); await request("/session",{ticket}); }
  const session = await request<{csrf:string;connected:boolean}>("/session"); csrf=session.csrf; return session;
}
export const beginApproval = (roomId:string) => request<{verificationUri:string;userCode:string}>("/approval",{roomId});
export const pollApproval = () => request<{status:"pending"|"approved"}>("/approval/poll",{});
export const getObservation = async () => observationSchema.parse(await request<Observation>("/observation"));
export const sendCommand = async (command:Command, commandId=crypto.randomUUID()) => {
  const result=resultSchema.parse(await request<CommandResult>("/commands",{version:"code-gods.player.v1",commandId,command}));
  if(result.commandId!==commandId) throw new Error("Command receipt mismatch.");
  return result;
};
export const disconnect = async () => {try {return await request("/disconnect",{});} finally {csrf="";}};
