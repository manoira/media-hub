import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['x-media-hub-request']",
    "res.headers['set-cookie']",
    "req.body.password",
    "req.body.secret",
    "password",
    "secret",
    "token",
    "creatorKey",
    "*.password",
    "*.secret",
    "*.token",
    "*.creatorKey",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
