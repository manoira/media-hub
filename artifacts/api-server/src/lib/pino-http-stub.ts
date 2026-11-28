import type { RequestHandler } from "express";

const silentLog = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

export default function pinoHttp(): RequestHandler {
  return (req, res, next) => {
    const started = Date.now();
    (req as unknown as { log: typeof silentLog }).log = silentLog;
    res.on("finish", () => {
      const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
      console.log(`${req.method} ${pathOnly} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  };
}
