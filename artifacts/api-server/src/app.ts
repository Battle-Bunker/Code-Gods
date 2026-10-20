import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import cookieParser from "cookie-parser";
import { authenticate, sameOrigin, requireIdentity } from "./lib/identity";
import authRouter from "./routes/auth";
import roomsRouter from "./routes/rooms";
import gamesRouter from "./routes/games";
import deviceRouter from "./routes/device";
import playerRouter from "./routes/player";
import adminAgentsRouter from "./routes/admin-agents";
import { logger } from "./lib/logger";
import { isServerActive, recordHumanActivity } from "./game/activity";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
app.use(cors({ origin: false }));
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(authenticate);
app.use("/api", authRouter);
app.use((req, res, next) => {
  // Device initiation/polling are non-cookie, challenge-bound public endpoints.
  if (["/api/device/request", "/api/device/poll"].includes(req.path)) return next();
  sameOrigin(req, res, next);
});
app.post("/api/activity", async (req, res) => {
  const actor = requireIdentity(req);
  if (actor.kind !== "human") {
    res.status(403).json({ error: "Human identity required" });
    return;
  }
  res.set("Cache-Control", "no-store").json(await recordHumanActivity());
});
app.use(async (req, res, next) => {
  // Authentication and health stay reachable when asleep. Unknown paths never
  // refresh activity; device challenge polling is also explicitly passive.
  if (req.path === "/api/healthz" || req.path === "/api/health" ||
      req.path === "/api/device/poll" || req.path === "/api/device/revoke") return next();
  const protectedPath = /^\/api\/(?:manifest|games\/[^/]+|rooms(?:\/[^/]+(?:\/(?:actions|chat))?)?|player\/v1\/rooms\/[^/]+\/(?:observation|commands)|ai-agents|admin\/ai-agents(?:\/[^/]+)?|device\/(?:request|approve))\/?$/.test(req.path);
  if (!protectedPath) return next();
  if (req.path !== "/api/device/request" && req.path !== "/api/manifest") requireIdentity(req);
  if (!await isServerActive()) {
    res.set("Cache-Control", "no-store").set("Connection", "close")
      .status(503).json({ error: "Server is idle; wake it with an authenticated POST /api/activity", code: "SERVER_IDLE" });
    return;
  }
  const humanMutation = req.identity?.kind === "human" &&
    ["POST", "PATCH", "DELETE"].includes(req.method) &&
    /^(?:\/api\/rooms(?:\/[^/]+\/actions)?|\/api\/player\/v1\/rooms\/[^/]+\/commands|\/api\/admin\/ai-agents(?:\/[^/]+)?|\/api\/device\/approve)\/?$/.test(req.path);
  if (humanMutation) {
    let accepted = true;
    const json = res.json;
    res.json = function (body) {
      if (body?.accepted === false) accepted = false;
      return json.call(this, body);
    };
    res.once("finish", () => {
      if (accepted && res.statusCode >= 200 && res.statusCode < 300) {
        void recordHumanActivity();
      }
    });
  }
  next();
});
app.use("/api", deviceRouter, roomsRouter, gamesRouter, playerRouter);
app.use("/api", adminAgentsRouter);

app.use("/api", router);
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error.status ?? (error.name === "ZodError" ? 400 : 400);
  if (status >= 500) req.log.error({ errorName: error.name }, "Request failed");
  res.status(status).json({ error: error.message ?? "Request failed", code: error.code });
});

export default app;
