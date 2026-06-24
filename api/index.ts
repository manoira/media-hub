// Vercel serverless entry — bundle is produced by `pnpm --filter @workspace/api-server run build`.
import app from "../artifacts/api-server/dist/vercel-entry.mjs";

export default app;
