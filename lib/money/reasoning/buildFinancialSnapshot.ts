import {
  HouseholdMoneyTruth,
  MoneyCadence,
  AccountTruth,
  TransactionTruth,
  RecurringBillTruth,
  RecurringIncomeTruth,
  ConnectionTruth,
} from "./types";
import { evaluatePressureSignals, PressureSignals } from "./pressureSignals";

export type FinancialSnapshot = {
  asOf: string;
  liquidity: {
    availableCashCents: number;
    accountCount: number;
  };
  income: {
    recurringMonthlyCents: number;
    sourceCount: number;
  };
  commitments: {
    recurringMonthlyCents: number;
    billCount: number;
  };
  discretionary: {
    last30DayOutflowCents: number;
  };
  connections: {
    total: number;
    stale: number;
    maxAgeDays: number;
  };
  pressure: PressureSignals;
};

export function buildFinancialSnapshot(truth: HouseholdMoneyTruth): FinancialSnapshot {
  const asOfMs = safeDate(truth.asOf);

  const liquidity = computeLiquidity(truth.accounts);
  const income = computeRecurringIncome(truth.recurringIncome);
  const commitments = computeRecurringBills(truth.recurringBills);
  const discretionary = computeDiscretionary(truth.transactions, asOfMs);
  const connections = computeConnections(truth.connections ?? [], truth.asOf);
  const pressure = evaluatePressureSignals(truth);

  return {
    asOf: truth.asOf,
    liquidity,
    income,
    commitments,
    discretionary,
    connections,
    pressure,
  };
}

function computeLiquidity(accounts: AccountTruth[]) {
  const availableCashCents = accounts.reduce((sum, a) => {
    const available =
      typeof a.available_balance_cents === "number"
        ? a.available_balance_cents
        : null;
    const current = safeCents(a.current_balance_cents);
    return sum + safeCents(available ?? current);
  }, 0);

  return {
    availableCashCents,
    accountCount: accounts.length,
  };
}

function computeRecurringIncome(items: RecurringIncomeTruth[]) {
  const active = items.filter((i) => i.active !== false);
  const recurringMonthlyCents = sumMonthly(active);
  return {
    recurringMonthlyCents,
    sourceCount: active.length,
  };
}

function computeRecurringBills(items: RecurringBillTruth[]) {
  const active = items.filter((b) => b.active !== false);
  const recurringMonthlyCents = sumMonthly(active);
  return {
    recurringMonthlyCents,
    billCount: active.length,
  };
}

function computeDiscretionary(
  txs: TransactionTruth[],
  asOfMs: number | null
): { last30DayOutflowCents: number } {
  const windowStart = asOfMs !== null ? asOfMs - msFromDays(30) : null;
  const last30DayOutflowCents = sumOutflows(txs, windowStart, asOfMs);
  return { last30DayOutflowCents };
}

function computeConnections(connections: ConnectionTruth[], asOf: string) {
  const total = connections.length;
  const maxAgeDays = maxConnectionAgeDays(connections, asOf);
  const stale = connections.filter((c) => {
    const age = ageDays(c.last_sync_at || c.updated_at || null, asOf);
    return age !== null && age > 7; // treat >7 days as stale for now
  }).length;

  return {
    total,
    stale,
    maxAgeDays: Number.isFinite(maxAgeDays) ? Number(maxAgeDays.toFixed(1)) : Infinity,
  };
}

// Helpers (mirroring pressureSignals.ts logic)

function monthlyFactor(cadence: MoneyCadence): number {
  switch (cadence) {
    case "weekly":
      return 52 / 12;
    case "fortnightly":
      return 26 / 12;
    case "quarterly":
      return 1 / 3;
    case "annual":
    case "yearly":
      return 1 / 12;
    case "monthly":
    default:
      return 1;
  }
}

function sumMonthly(items: { amount_cents: number; cadence: MoneyCadence }[]): number {
  return items.reduce((sum, item) => {
    const cents = safeCents(item.amount_cents);
    return sum + cents * monthlyFactor(item.cadence);
  }, 0);
}

function safeCents(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function safeDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function msFromDays(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

function sumOutflows(
  txs: TransactionTruth[],
  startMs: number | null,
  endMs: number | null
): number {
  return txs
    .filter((t) => {
      const ms = safeDate(t.date);
      if (ms === null) return false;
      if (startMs !== null && ms < startMs) return false;
      if (endMs !== null && ms > endMs) return false;
      return true;
    })
    .reduce((sum, t) => {
      const cents = safeCents(t.amount_cents);
      return cents < 0 ? sum + Math.abs(cents) : sum;
    }, 0);
}

function ageDays(targetIso: string | null | undefined, asOfIso: string): number | null {
  const asOfMs = safeDate(asOfIso);
  const targetMs = safeDate(targetIso);
  if (asOfMs === null || targetMs === null) return null;
  const diff = asOfMs - targetMs;
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff / msFromDays(1);
}

function maxConnectionAgeDays(connections: ConnectionTruth[], asOf: string): number {
  if (!connections.length) return Infinity;
  const ages = connections
    .map((c) => ageDays(c.last_sync_at || c.updated_at || null, asOf))
    .filter((d): d is number => d !== null && Number.isFinite(d) && d >= 0);

  if (!ages.length) return Infinity;
  return Math.max(...ages);
}
