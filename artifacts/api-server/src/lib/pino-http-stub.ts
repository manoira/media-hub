import type { RequestHandler } from "express";

export default function pinoHttp(): RequestHandler {
  return (_req, _res, next) => {
    next();
  };
}
