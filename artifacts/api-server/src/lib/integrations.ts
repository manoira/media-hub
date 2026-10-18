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
