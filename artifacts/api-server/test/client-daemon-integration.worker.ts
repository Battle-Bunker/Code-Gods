import { createServer } from "node:http";
import { createPlayerDaemon } from "../../../lib/player-client/src/daemon";
import { nodeHandler } from "../../../lib/player-client/src/node-handler";
import { nodeSocketFactory } from "../../../lib/player-client/src/node-socket";

// This process is the independently-owned player service. No upstream credential
// is returned over IPC; only the local one-use capability and safe counters.
const server = createServer();
server.listen(0, "127.0.0.1", () => {
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const sockets: ReturnType<typeof nodeSocketFactory>[] = [];
  const stats = { opens: 0, observations: 0, receipts: 0, transformations: 0 };
  const daemon = createPlayerDaemon({
    origin, basePath: "/player", serverUrl: process.argv[2],
    socketFactory: (url, options) => {
      const socket = nodeSocketFactory(url, options);
      sockets.push(socket);
      // Instrument the real adapter, without exposing headers or payloads.
      let onopen: typeof socket.onopen = null, onmessage: typeof socket.onmessage = null;
      Object.defineProperty(socket, "onopen", { get: () => () => { stats.opens++; onopen?.(); }, set: v => { onopen = v; } });
      Object.defineProperty(socket, "onmessage", { get: () => (event: { data: unknown }) => {
        const message = JSON.parse(String(event.data));
        if (message.type === "player.observation") stats.observations++;
        if (message.type === "command.receipt") stats.receipts++;
        if (message.type === "object.transformed") stats.transformations++;
        onmessage?.(event);
      }, set: v => { onmessage = v; } });
      return socket;
    },
  });
  server.on("request", nodeHandler(daemon.handle, origin));
  process.send?.({ origin, launch: daemon.launchUrl(), pid: process.pid });
  process.on("message", (message: any) => {
    if (message.type === "stats") process.send?.({ ...stats });
    if (message.type === "drop") { sockets.at(-1)?.close(); process.send?.({ dropped: true }); }
    if (message.type === "stop") { daemon.close(); server.close(() => process.exit(0)); }
  });
});
