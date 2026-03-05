// lib/money/providers/index.ts
import type { MoneyProvider, ProviderName } from "./types";
import {
  manualProvider,
  getManualAccounts,
  getManualTransactions,
} from "./manual";
import { basiqProvider, getBasiqAccounts, getBasiqTransactions } from "./basiq";
import { plaidProvider } from "./plaid";

const registry: Record<ProviderName, MoneyProvider> = {
  manual: manualProvider,
  plaid: plaidProvider,
  basiq: basiqProvider,
};

export function getProvider(provider: string): MoneyProvider {
  const key = provider as ProviderName;

  if (!registry[key]) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return registry[key];
}

// Re-export low-level helper functions
export { getManualAccounts, getManualTransactions, getBasiqAccounts, getBasiqTransactions };
export type { MoneyProvider, ProviderName };