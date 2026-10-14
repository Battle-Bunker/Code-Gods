import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { lookupSession } from "../lib/identity";
import { listeners, resolveRoom, member, mutate } from "./store";
import { publicRoom, personalRoom } from "./projection";
import { playerCommand } from "./engine";
import { observation, executePlayerEnvelope } from "./player-api";
import { personalScore } from "@workspace/game-core";
import { isServerActive, isLocallyIdle, recordHumanActivity, registerActivitySocket, closeIdleSocket } from "./activity";

export function attachSockets(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
  let closing = false;
  const pending = new Set<Promise<unknown>>();
  const track = (work: Promise<unknown>) => {
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => {});
  };
  server.on("upgrade", (req, socket, head) => {
    if (closing) { socket.destroy(); return; }
    track((async () => {
      const url = new URL(req.url!, "https://localhost");
      const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
      if (!match) { socket.destroy(); return; }
      const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
      if (!bearer && req.headers.origin !== `https://${req.headers.host}`) throw new Error("Origin mismatch");
      const cookie = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith("cg_session="))?.slice(11);
      const token = bearer ?? cookie;
      if (!token) throw new Error("Unauthorized");
      const actor = await lookupSession(token);
      if (closing) { socket.destroy(); return; }
      if (!actor) throw new Error("Unauthorized");
      if (!await isServerActive()) {
        wss.handleUpgrade(req, socket, head, ws => {
          registerActivitySocket(ws);
          closeIdleSocket(ws);
        });
        return;
      }
      const room = resolveRoom(decodeURIComponent(match[1]));
      member(room, actor);
      wss.handleUpgrade(req, socket, head, ws => {
        const send = (type: string, payload: unknown, seq = resolveRoom(room.id).seq) => {
          if (isLocallyIdle()) return;
          if (ws.bufferedAmount > 1048576) { ws.close(1013, "Reconnect to resync"); return; }
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ protocolVersion: 1, type, seq, serverTime: Date.now(), payload }));
        };
        const project = () => actor.scope === "player" ? personalRoom(resolveRoom(room.id), actor.id) : publicRoom(resolveRoom(room.id));
        send("room.snapshot", project());
        send("player.observation", observation(room, actor));
        let gameId = room.game?.id;
        let lastEvent = room.game?.events.at(-1)?.id;
        const listener: Parameters<typeof listeners.add>[0] = changed => {
          if (changed.id !== room.id) return;
          send("room.snapshot", project());
          send("player.observation", observation(changed, actor));
          if (gameId !== changed.game?.id) {
            gameId = changed.game?.id;
            lastEvent = undefined;
            if (changed.game?.deities.some(d => d.id === actor.id)) send("game.preparing", personalRoom(changed, actor.id));
          }
          const events = changed.game?.events ?? [];
          const start = lastEvent ? events.findIndex(e => e.id === lastEvent) + 1 : 0;
          if (changed.game?.deities.some(d => d.id === actor.id)) {
            for (const event of events.slice(start)) send(event.type, {
              id: event.id, gameId: event.gameId, agentId: event.agentId, before: event.before,
              object: { id: event.object.id, value: event.object.value, version: event.object.version,
                ...personalScore(new Map(Object.entries(event.object.values)), actor.id) },
            });
          }
          lastEvent = events.at(-1)?.id;
          send("leaderboard.updated", publicRoom(changed).game?.leaderboard ?? []);
        };
        listeners.add(listener);
        let busy = false;
        registerActivitySocket(ws, () => busy);
        ws.on("message", data => {
          if (closing) return;
          if (busy) { send("command.error", { error: "Previous command still pending" }); return; }
          busy = true;
          track((async () => {
            if (!await lookupSession(token)) { ws.close(1008, "Session expired"); return; }
            if (!await isServerActive()) { closeIdleSocket(ws); return; }
            const input = JSON.parse(data.toString());
            if (input.version === "code-gods.player.v1") {
              const receipt = await executePlayerEnvelope(room.id, actor, input);
              if (receipt.accepted && actor.kind === "human") await recordHumanActivity();
              send("command.receipt", receipt);
              return;
            }
            if (input.protocolVersion !== 1) throw new Error("Unsupported protocol");
            if (input.command === "subscribe" || input.command === "resume") { send("room.snapshot", project()); return; }
            const result = await mutate(room.id, draft => playerCommand(draft, actor, input));
            if (actor.kind === "human") await recordHumanActivity();
            send("command.receipt", { requestId: input.requestId, result });
          })().catch(error => send("command.error", { error: String(error.message) })).finally(() => { busy = false; }));
        });
        const heartbeat = setInterval(() => {
          if (isLocallyIdle()) return;
          void lookupSession(token).then(identity => {
            if (!identity) ws.close(1008, "Session expired");
            else ws.ping();
          }).catch(() => ws.close(1011, "Authentication unavailable"));
        }, 15000);
        ws.on("close", () => { clearInterval(heartbeat); listeners.delete(listener); });
      });
    })().catch(() => { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); }));
  });
  return async () => {
    closing = true;
    await Promise.allSettled([...pending]);
    for (const ws of wss.clients) ws.terminate();
    await new Promise<void>(resolve => wss.close(() => resolve()));
  };
}
