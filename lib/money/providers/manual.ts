// lib/money/providers/manual.ts
import type { MoneyProvider } from "./types";

export const manualProvider: MoneyProvider = {
  name: "manual",

  async sync() {
    // Manual provider does not auto-sync.
    return {
      accountsUpserted: 0,
      transactionsUpserted: 0,
    };
  },
};

// These exist only so providerRouter/index can call something.
// Manual accounts/transactions come from your DB, not the provider.
export async function getManualAccounts(_userId: string) {
  return [];
}

export async function getManualTransactions(_userId: string) {
  return [];
}