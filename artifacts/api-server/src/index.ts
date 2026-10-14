import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "node:http";
import { initializeStore } from "./game/store";
import { startTicker } from "./game/engine";
import { attachSockets } from "./game/socket";

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

await initializeStore();
const server = createServer(app);
attachSockets(server);
startTicker();
server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
