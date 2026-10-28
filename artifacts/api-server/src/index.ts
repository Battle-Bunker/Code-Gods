import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "node:http";
import { initializeStore, closeStore } from "./game/store";
import { assertSeasonSalt } from "./game/season";
import { pool } from "@workspace/db";
import { attachConnectionLifecycle, initializeActivity } from "./game/activity";
import { startTicker } from "./game/engine";
import { attachSockets } from "./game/socket";
import { initializeRuntimeAdapters, shutdownRuntimeAdapters } from "./game/runtime-setup";
import { startAIService } from "./game/ai-service";
import { initializeAgentLibrary } from "./game/agent-library";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

assertSeasonSalt();
await initializeStore();
await initializeActivity();
await initializeAgentLibrary();
await initializeRuntimeAdapters();
const server = createServer(app);
const disposeConnections = attachConnectionLifecycle(server);
const stopSockets = attachSockets(server);
const stopTicker = startTicker();
const stopAI = startAIService();
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // Stop accepting new traffic, but let admitted handlers commit before closing
  // the pool. Every mutation persists before acknowledging its result.
  const httpDrained = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  disposeConnections();
  try {
    await Promise.all([stopTicker(), stopAI(), stopSockets(), httpDrained]);
    await closeStore();
    await shutdownRuntimeAdapters();
    await pool.end();
    logger.info("Graceful shutdown complete");
    process.exitCode = 0;
  } catch (error) {
    logger.error({ error }, "Graceful shutdown failed");
    // Other drain promises may still be persisting accepted work. Do not force
    // the process down (and sever their database connections) on an early error.
    process.exitCode = 1;
  }
}
process.on("SIGTERM", () => { void shutdown(); });
process.on("SIGINT", () => { void shutdown(); });
server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
