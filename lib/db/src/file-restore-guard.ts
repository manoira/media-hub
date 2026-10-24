const PRODUCTION_HOST_MARK = "ep-wandering-morning";

const EMPTY_RESTORE_HOSTS = new Set([
  "ep-misty-boat-as4ssnx0-pooler.c-4.eu-central-1.aws.neon.tech",
  "ep-misty-boat-as4ssnx0.c-4.eu-central-1.aws.neon.tech",
]);
export const EMPTY_RESTORE_DATABASE = "mediahub_restore_empty";
export const EMPTY_RESTORE_BRANCH = "br-proud-smoke-asy4fsyv";
export const TEST_COPY_DATABASE = "neondb";

function databaseName(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

export function emptyRestoreTargetDecision(databaseUrl: string | undefined): { allowed: boolean; reason: string } {
  const host = databaseHost(databaseUrl);
  const database = databaseName(databaseUrl);
  if (!host || !database) {
    return { allowed: false, reason: "Empty restore is refused until the target URL has a host and database." };
  }
  if (host.includes("ep-nameless-bread") || host.includes(PRODUCTION_HOST_MARK)) {
    return { allowed: false, reason: "Empty restore is refused for the original branch and the old production host." };
  }
  if (database === TEST_COPY_DATABASE) {
    return { allowed: false, reason: "Empty restore is refused for the existing neondb database." };
  }
  if (!EMPTY_RESTORE_HOSTS.has(host) || database !== EMPTY_RESTORE_DATABASE) {
    return { allowed: false, reason: "Empty restore allows only mediahub_restore_empty on the isolated test endpoint." };
  }
  return { allowed: true, reason: "Target is the empty database on the isolated test endpoint." };
}

export function testCopyReadDecision(databaseUrl: string | undefined): { allowed: boolean; reason: string } {
  const host = databaseHost(databaseUrl);
  const database = databaseName(databaseUrl);
  if (!host || !database) {
    return { allowed: false, reason: "Test-copy reads are refused until the URL has a host and database." };
  }
  if (host.includes("ep-nameless-bread") || host.includes(PRODUCTION_HOST_MARK)) {
    return { allowed: false, reason: "This read target is the original branch or the old production host." };
  }
  if (!EMPTY_RESTORE_HOSTS.has(host) || database !== TEST_COPY_DATABASE) {
    return { allowed: false, reason: "Schema reads for this restore allow only neondb on the isolated test endpoint." };
  }
  return { allowed: true, reason: "Source is the named test copy." };
}

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
