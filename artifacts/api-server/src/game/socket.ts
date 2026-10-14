import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { lookupSession } from "../lib/identity";
import { listeners, resolveRoom, member, mutate } from "./store";
import { publicRoom, personalRoom } from "./projection";
import { playerCommand } from "./engine";

export function attachSockets(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
  server.on("upgrade", (req, socket, head) => {
    void (async () => {
      const url = new URL(req.url!, "https://localhost");
      const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
      if (!match) { socket.destroy(); return; }
      const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
      if (!bearer && req.headers.origin !== `https://${req.headers.host}`) throw new Error("Origin mismatch");
      const cookie = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith("cg_session="))?.slice(11);
      const token = bearer ?? cookie;
      if (!token) throw new Error("Unauthorized");
      const actor = await lookupSession(token);
      if (!actor) throw new Error("Unauthorized");
      const room = resolveRoom(decodeURIComponent(match[1]));
      member(room, actor);
      wss.handleUpgrade(req, socket, head, ws => {
        const send = (type: string, payload: unknown, seq = resolveRoom(room.id).seq) => {
          if (ws.bufferedAmount > 1048576) { ws.close(1013, "Reconnect to resync"); return; }
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ protocolVersion: 1, type, seq, serverTime: Date.now(), payload }));
        };
        const project = () => actor.scope === "player" ? personalRoom(resolveRoom(room.id), actor.id) : publicRoom(resolveRoom(room.id));
        send("room.snapshot", project());
        const listener: Parameters<typeof listeners.add>[0] = changed => {
          if (changed.id !== room.id) return;
          send("room.snapshot", project());
          send("leaderboard.updated", publicRoom(changed).game?.leaderboard ?? []);
        };
        listeners.add(listener);
        let busy = false;
        ws.on("message", data => {
          if (busy) { send("command.error", { error: "Previous command still pending" }); return; }
          busy = true;
          void (async () => {
            if (!await lookupSession(token)) { ws.close(1008, "Session expired"); return; }
            const input = JSON.parse(data.toString());
            if (input.protocolVersion !== 1) throw new Error("Unsupported protocol");
            if (input.command === "subscribe" || input.command === "resume") { send("room.snapshot", project()); return; }
            const result = await mutate(room.id, draft => playerCommand(draft, actor, input));
            send("command.receipt", { requestId: input.requestId, result });
          })().catch(error => send("command.error", { error: String(error.message) })).finally(() => { busy = false; });
        });
        const heartbeat = setInterval(() => {
          void lookupSession(token).then(identity => {
            if (!identity) ws.close(1008, "Session expired");
            else ws.ping();
          }).catch(() => ws.close(1011, "Authentication unavailable"));
        }, 15000);
        ws.on("close", () => { clearInterval(heartbeat); listeners.delete(listener); });
      });
    })().catch(() => { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); });
  });
}
