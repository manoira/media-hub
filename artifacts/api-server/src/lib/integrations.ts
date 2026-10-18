import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const INTEGRATION_PROVIDERS = ["creator-key", "simkl"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

type StoredIntegration = {
  provider: IntegrationProvider;
  secret: string | null;
  updatedAt: string;
};

export type PublicIntegration = {
  provider: IntegrationProvider;
  label: string;
  connected: boolean;
  masked: string | null;
  updatedAt: string | null;
};

const LABELS: Record<IntegrationProvider, string> = {
  "creator-key": "My Lists creator key",
  simkl: "SIMKL token",
};

function storeFile(): string {
  const root = process.cwd().endsWith("api-server")
    ? process.cwd()
    : path.resolve(process.cwd(), "artifacts", "api-server");
  return path.join(root, ".local", "integrations.json");
}

function readAll(): StoredIntegration[] {
  try {
    const parsed = JSON.parse(readFileSync(storeFile(), "utf8")) as StoredIntegration[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: StoredIntegration[]): void {
  const file = storeFile();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(records), { mode: 0o600 });
}

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

function mask(secret: string | null): string | null {
  if (!secret) return null;
  const tail = secret.slice(-4);
  return `••••${tail}`;
}

export function listIntegrations(): PublicIntegration[] {
  const records = readAll();
  return INTEGRATION_PROVIDERS.map((provider) => {
    const record = records.find((entry) => entry.provider === provider);
    return {
      provider,
      label: LABELS[provider],
      connected: Boolean(record?.secret),
      masked: mask(record?.secret ?? null),
      updatedAt: record?.updatedAt ?? null,
    };
  });
}

function save(provider: IntegrationProvider, secret: string | null): PublicIntegration {
  const records = readAll().filter((entry) => entry.provider !== provider);
  const updatedAt = new Date().toISOString();
  records.push({ provider, secret, updatedAt });
  writeAll(records);
  return {
    provider,
    label: LABELS[provider],
    connected: Boolean(secret),
    masked: mask(secret),
    updatedAt,
  };
}

export function setIntegration(provider: IntegrationProvider, secret: string): PublicIntegration {
  return save(provider, secret);
}

export function revokeIntegration(provider: IntegrationProvider): PublicIntegration {
  return save(provider, null);
}
