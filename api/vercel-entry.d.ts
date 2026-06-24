declare module "../artifacts/api-server/dist/vercel-entry.mjs" {
  import type { Express } from "express";

  const app: Express;
  export default app;
}
