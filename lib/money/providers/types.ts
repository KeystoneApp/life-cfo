export type ProviderName = "manual" | "plaid" | "basiq";

export type ProviderSyncResult = {
  accountsUpserted: number;
  transactionsUpserted: number;
};

export interface MoneyProvider {
  name: ProviderName;

  /**
   * Called after connection is created & authorized
   */
  completeLink?(connectionId: string): Promise<void>;

  /**
   * Sync accounts + transactions
   */
  sync(connectionId: string): Promise<ProviderSyncResult>;
}