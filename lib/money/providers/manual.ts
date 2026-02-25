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