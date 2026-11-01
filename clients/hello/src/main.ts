/**
 * Hello, Code Gods: a complete player client in one file (docs/external-clients.md §4).
 *
 *   1. Sign in: an OAuth connection for one room, approved by the human on the engine's /connect page
 *      (or, inside an iframe such as Replit's webview, the device flow with a code).
 *   2. Subscribe: a Convex WebSocket client authenticated with the room's player token sees the player's own
 *      projection, live.
 *   3. Act: a v3 command envelope through the public `commands.submit` action.
 *
 * Everything shown is game data written by players: it is rendered as text, never as HTML.
 */
import { ConvexClient } from "convex/browser";
import { api } from "@workspace/engine/convex/_generated/api";
import { VERSION } from "@workspace/player-client";
import { createPlayerAuth, type PlayerAuth, type PlayerSession } from "@workspace/player-client/browser";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on: boolean) => { $(id).hidden = !on; };
const fail = (e: unknown) => { $("error").textContent = e instanceof Error ? e.message : String(e); };

const params = new URLSearchParams(location.search);
const engineInput = $<HTMLInputElement>("engine"), roomInput = $<HTMLInputElement>("room");
engineInput.value = localStorage.getItem("hello.engine") ?? import.meta.env.VITE_CODE_GODS_ENGINE_URL ?? "";
roomInput.value = params.get("room") ?? "";

let auth: PlayerAuth | undefined;
const authFor = (engineUrl: string) => auth?.engineUrl === engineUrl ? auth : (auth = createPlayerAuth({
  engineUrl, clientName: "Hello client", redirectUri: `${location.origin}${location.pathname}`,
}));
const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();

$("setup").addEventListener("submit", e => {
  e.preventDefault();
  try {
    const a = authFor(engineInput.value.trim());
    localStorage.setItem("hello.engine", a.engineUrl);
    if (framed) return void connectWithCode();
    void a.signInWithRedirect({ room: roomInput.value.trim(), permission: "act", returnTo: `?room=${encodeURIComponent(roomInput.value.trim())}` }).catch(fail);
  } catch (error) { fail(error); }
});
$("connect-code").addEventListener("click", () => void connectWithCode());

async function connectWithCode() {
  try {
    const a = authFor(engineInput.value.trim());
    localStorage.setItem("hello.engine", a.engineUrl);
    const pending = await a.signInWithDevice({ room: roomInput.value.trim(), permission: "act" });
    $<HTMLAnchorElement>("device-link").href = pending.verificationUrl;
    $("device-link").textContent = pending.verificationUrl;
    $("device-code").textContent = pending.userCode;
    show("device", true);
    play(a, await pending.session);
  } catch (error) { fail(error); } finally { show("device", false); }
}

function play(a: PlayerAuth, session: PlayerSession) {
  show("setup", false); show("game", true);
  $("error").textContent = "";
  const url = new URL(location.href); url.searchParams.set("room", session.roomCode); history.replaceState(null, "", url);
  const convex = new ConvexClient(session.convexUrl);
  // The SDK refreshes the token; `ok` false means the connection was revoked or has expired.
  convex.setAuth(a.fetchToken(session), ok => { if (!ok) ended("This connection was revoked or has expired."); });
  const ended = (why: string) => { void convex.close(); show("game", false); show("setup", true); $("error").textContent = why; };

  $("who").textContent = `Room ${session.roomCode}, ${session.permission} access.`;
  convex.onUpdate(api.player.observation, { roomId: session.roomId }, obs => {
    $("status").textContent = `${obs.self.label}: ${obs.phase}, ${Math.floor(obs.self.energy)} bits of energy, ${obs.objects.length} objects.`;
    $("chat").replaceChildren(...obs.chat.slice(-10).map(m => Object.assign(document.createElement("li"), { textContent: `${m.label}: ${m.text}` })));
  }, error => ended(error.message));

  $("chat-form").onsubmit = e => {
    e.preventDefault();
    const text = $<HTMLInputElement>("say").value.trim();
    if (!text) return;
    void convex.action(api.commands.submit, { roomId: session.roomId, envelope: { version: VERSION, commandId: crypto.randomUUID(), command: { type: "chat", text } } })
      .then(r => { if (r.accepted) $<HTMLInputElement>("say").value = ""; else fail(r.message); }, fail);
  };
  $("disconnect").onclick = () => void a.signOut(session).then(() => ended("Disconnected."), fail);
}

// Back from the engine's /connect page, or a stored connection for this room.
(async () => {
  const engineUrl = engineInput.value.trim();
  if (!engineUrl) return;
  const a = authFor(engineUrl);
  const done = await a.completeSignIn();
  const session = done?.session ?? (roomInput.value ? a.session(roomInput.value) : null);
  if (session) play(a, session);
})().catch(fail);
