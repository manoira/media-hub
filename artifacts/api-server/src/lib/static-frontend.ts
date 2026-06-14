import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";

function resolvePublicDir(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../media-tracker/dist/public",
  );
}

export function registerStaticFrontend(app: Express): boolean {
  const publicDir = resolvePublicDir();
  const indexPath = path.join(publicDir, "index.html");

  if (!fs.existsSync(indexPath)) {
    return false;
  }

  app.use(express.static(publicDir));

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(indexPath);
  });

  return true;
}
