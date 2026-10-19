const PRODUCTION_HOST_MARK = "ep-wandering-morning";

export function fileRestoreDecision(env: {
  nodeEnv?: string;
  databaseUrl?: string;
}): { allowed: boolean; reason: string } {
  if ((env.nodeEnv ?? "").toLowerCase() === "production") {
    return { allowed: false, reason: "File restore is refused when NODE_ENV is production." };
  }
  const host = databaseHost(env.databaseUrl);
  if (!host) {
    return { allowed: false, reason: "File restore is refused until DATABASE_URL has a readable host." };
  }
  if (host.includes(PRODUCTION_HOST_MARK)) {
    return { allowed: false, reason: "File restore is refused for the production database host." };
  }
  return { allowed: true, reason: "File restore is a manual script against a non-production host." };
}

function databaseHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
