import type { MoneyProvider, ProviderName } from "./types";
import { manualProvider } from "./manual";

const registry: Record<ProviderName, MoneyProvider> = {
  manual: manualProvider,
  plaid: manualProvider, // placeholder until implemented
  basiq: manualProvider, // placeholder until implemented
};

export function getProvider(provider: string): MoneyProvider {
  const key = provider as ProviderName;

  if (!registry[key]) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return registry[key];
}