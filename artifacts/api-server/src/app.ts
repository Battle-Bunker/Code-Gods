import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import cookieParser from "cookie-parser";
import { authenticate, sameOrigin } from "./lib/identity";
import authRouter from "./routes/auth";
import roomsRouter from "./routes/rooms";
import deviceRouter from "./routes/device";
import playerRouter from "./routes/player";
import adminAgentsRouter from "./routes/admin-agents";
import { logger } from "./lib/logger";

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
app.use("/api", deviceRouter, roomsRouter, playerRouter);
app.use("/api", adminAgentsRouter);

app.use("/api", router);
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error.status ?? (error.name === "ZodError" ? 400 : 400);
  if (status >= 500) req.log.error({ errorName: error.name }, "Request failed");
  res.status(status).json({ error: error.message ?? "Request failed", code: error.code });
});

export default app;
