import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { ownerGate } from "./lib/owner-session";
import { registerStaticFrontend } from "./lib/static-frontend";

function allowedOrigins(): Set<string> {
  const configured = process.env.ALLOWED_ORIGINS
    ?? "http://localhost:5174,http://127.0.0.1:5174";
  return new Set(configured.split(",").map((origin) => origin.trim()).filter(Boolean));
}

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
const origins = allowedOrigins();
app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", ownerGate);
app.use("/api", router);

if (!process.env.VERCEL && registerStaticFrontend(app)) {
  logger.info("Serving Media Tracker frontend from static build");
}

export default app;
