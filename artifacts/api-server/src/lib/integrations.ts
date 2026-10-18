import { resolveMyListsTransport, type MyListsConnection } from "./my-lists-config";

export const INTEGRATION_PROVIDERS = ["creator-key", "simkl"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type PublicIntegration = {
  provider: IntegrationProvider;
  label: string;
  configured: boolean;
  verified: false;
  storage: "environment";
  envVar: string;
  masked: string | null;
};

const DEFINITIONS: Record<IntegrationProvider, { label: string; envVar: string }> = {
  "creator-key": { label: "My Lists creator key", envVar: "MY_LISTS_CREATOR_KEY" },
  simkl: { label: "SIMKL token", envVar: "SIMKL_TOKEN" },
};

export function isIntegrationProvider(value: string): value is IntegrationProvider {
  return (INTEGRATION_PROVIDERS as readonly string[]).includes(value);
}

function mask(secret: string): string {
  return `••••${secret.slice(-4)}`;
}

export function integrationSecret(provider: IntegrationProvider): string | null {
  const value = process.env[DEFINITIONS[provider].envVar]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function myListsConnectionStatus(): {
  connection: Exclude<MyListsConnection, "verified">;
  originHost: string | null;
  creatorName: string | null;
  detail: string;
} {
  const transport = resolveMyListsTransport();
  if (transport.kind === "simulator") {
    return {
      connection: "simulated",
      originHost: null,
      creatorName: transport.profile,
      detail: "The local simulator is selected. It is not a My Lists server and it is not verified.",
    };
  }
  if (transport.kind === "http") {
    return {
      connection: "configured",
      originHost: transport.originHost,
      creatorName: transport.creatorName,
      detail: "The origin, creator name, and server secret are set. That is configured, not verified. A list becomes verified only after a read-back.",
    };
  }
  return {
    connection: "unconfigured",
    originHost: null,
    creatorName: null,
    detail: "Set the HTTPS origin, creator name, and server secret together. A missing value does not fall back to a successful simulator sync.",
  };
}

export function listIntegrations(): PublicIntegration[] {
  return INTEGRATION_PROVIDERS.map((provider) => {
    const definition = DEFINITIONS[provider];
    const secret = integrationSecret(provider);
    return {
      provider,
      label: definition.label,
      configured: Boolean(secret),
      verified: false,
      storage: "environment",
      envVar: definition.envVar,
      masked: secret ? mask(secret) : null,
    };
  });
}
