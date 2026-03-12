<<<<<<< ours
<<<<<<< ours
import { SupabaseClient } from "@supabase/supabase-js";
import {
  HouseholdMoneyTruth,
  AccountTruth,
  TransactionTruth,
  RecurringBillTruth,
  RecurringIncomeTruth,
  ConnectionTruth,
} from "./types";

type Supabase = SupabaseClient<any, "public", any>;

export async function getHouseholdMoneyTruth(
  supabase: Supabase,
  params: { householdId: string }
): Promise<HouseholdMoneyTruth> {
  const householdId = params.householdId;

  const [accountsRes, transactionsRes, billsRes, incomeRes, connectionsRes] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id,current_balance_cents,available_balance_cents,currency"
      )
      .eq("household_id", householdId)
      .eq("archived", false),
    supabase
      .from("transactions")
      .select("id,date,amount_cents,currency,category")
      .eq("household_id", householdId)
      .order("date", { ascending: false })
      .limit(1000),
    supabase
      .from("recurring_bills")
      .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active")
      .eq("household_id", householdId),
    supabase
      .from("recurring_income")
      .select("id,name,amount_cents,currency,cadence,next_pay_at,active")
      .eq("household_id", householdId),
    supabase
      .from("external_connections")
      .select("id,status,last_sync_at,updated_at")
=======
=======
>>>>>>> theirs
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountsTruthRow,
  ExternalConnectionsTruthRow,
  GetHouseholdMoneyTruthParams,
  HouseholdMoneyTruth,
  LiabilitiesTruthRow,
  MoneyGoalsTruthRow,
  RecurringBillsTruthRow,
  RecurringIncomeTruthRow,
  TransactionsTruthRow,
} from "./types";

function startOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function endOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
}

function plusDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Internal-only financial truth fetch for a household.
 * - Read-only
 * - No derivations
 * - Mirrors current /api/money/overview data inputs
 */
export async function getHouseholdMoneyTruth(
  supabase: SupabaseClient,
  params: GetHouseholdMoneyTruthParams
): Promise<HouseholdMoneyTruth> {
  const householdId = String(params.householdId || "").trim();
  if (!householdId) {
    throw new Error("Missing householdId");
  }

  const nowIso = params.nowIso || new Date().toISOString();
  const next30Iso = params.next30Iso || plusDaysIso(30);
  const monthStartIso = params.monthStartIso || startOfMonthISO();
  const monthEndIso = params.monthEndIso || endOfMonthISO();

  const [
    accountsRes,
    recentTxRes,
    monthTxRes,
    recurringBillsRes,
    recurringIncomeRes,
    goalsRes,
    liabilitiesRes,
    budgetItemsRes,
    connectionsRes,
    investmentAccountsRes,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id,household_id,name,provider,type,status,archived,current_balance_cents,available_balance_cents,currency,updated_at,created_at"
      )
      .eq("household_id", householdId)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("transactions")
      .select(
        "id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,created_at,updated_at"
      )
      .eq("household_id", householdId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),

    supabase
      .from("transactions")
      .select(
        "id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,created_at,updated_at"
      )
      .eq("household_id", householdId)
      .gte("date", monthStartIso)
      .lte("date", monthEndIso)
      .order("date", { ascending: false })
      .limit(1000),

    supabase
      .from("recurring_bills")
      .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,notes")
      .eq("household_id", householdId)
      .eq("active", true)
      .order("next_due_at", { ascending: true })
      .limit(100),

    supabase
      .from("recurring_income")
      .select("id,name,amount_cents,currency,cadence,next_pay_at,active,notes")
      .eq("household_id", householdId)
      .eq("active", true)
      .order("next_pay_at", { ascending: true })
      .limit(100),

    supabase
      .from("money_goals")
      .select(
        "id,title,currency,target_cents,current_cents,status,target_date,deadline_at,is_primary,updated_at"
      )
      .eq("household_id", householdId)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(20),

    supabase
      .from("liabilities")
      .select("id,name,current_balance_cents,currency,archived,updated_at")
      .eq("household_id", householdId)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(100),

    supabase
      .from("budget_items")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId),

    supabase
      .from("external_connections")
      .select("id,status,last_sync_at,updated_at,provider")
      .eq("household_id", householdId)
      .order("updated_at", { ascending: false }),

    supabase
      .from("investment_accounts")
      .select("id", { count: "exact", head: true })
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
      .eq("household_id", householdId),
  ]);

  if (accountsRes.error) throw accountsRes.error;
<<<<<<< ours
<<<<<<< ours
  if (transactionsRes.error) throw transactionsRes.error;
  if (billsRes.error) throw billsRes.error;
  if (incomeRes.error) throw incomeRes.error;
  if (connectionsRes.error) throw connectionsRes.error;

  const accounts: AccountTruth[] = (accountsRes.data ?? []).map((a) => ({
    id: a.id,
    current_balance_cents: num(a.current_balance_cents),
    available_balance_cents: numOrNull(a.available_balance_cents),
    currency: a.currency,
  }));

  const transactions: TransactionTruth[] = (transactionsRes.data ?? []).map((t) => ({
    id: t.id,
    date: safeStr(t.date),
    amount_cents: num(t.amount_cents),
    currency: t.currency,
    category: t.category,
  }));

  const recurringBills: RecurringBillTruth[] = (billsRes.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    amount_cents: num(b.amount_cents),
    currency: b.currency,
    cadence: safeCadence(b.cadence),
    next_due_at: b.next_due_at,
    active: b.active !== false,
  }));

  const recurringIncome: RecurringIncomeTruth[] = (incomeRes.data ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    amount_cents: num(i.amount_cents),
    currency: i.currency,
    cadence: safeCadence(i.cadence),
    next_pay_at: i.next_pay_at,
    active: i.active !== false,
  }));

  const connections: ConnectionTruth[] = (connectionsRes.data ?? []).map((c) => ({
    id: c.id,
    status: safeStr(c.status),
    last_sync_at: c.last_sync_at,
    updated_at: c.updated_at,
  }));

  return {
    asOf: new Date().toISOString().slice(0, 10),
    accounts,
    transactions,
    recurringBills,
    recurringIncome,
    connections,
  };
}

function num(v: any): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeStr(v: any): string {
  return typeof v === "string" ? v : "";
}

function safeCadence(v: any): any {
  const s = safeStr(v).toLowerCase();
  switch (s) {
    case "weekly":
    case "fortnightly":
    case "monthly":
    case "quarterly":
    case "annual":
    case "yearly":
      return s;
    default:
      return "monthly";
  }
}
=======
=======
>>>>>>> theirs
  if (recentTxRes.error) throw recentTxRes.error;
  if (monthTxRes.error) throw monthTxRes.error;
  if (recurringBillsRes.error) throw recurringBillsRes.error;
  if (recurringIncomeRes.error) throw recurringIncomeRes.error;
  if (goalsRes.error) throw goalsRes.error;
  if (liabilitiesRes.error) throw liabilitiesRes.error;
  if (budgetItemsRes.error) throw budgetItemsRes.error;
  if (connectionsRes.error) throw connectionsRes.error;
  if (investmentAccountsRes.error) throw investmentAccountsRes.error;

  return {
    household_id: householdId,
    as_of_iso: new Date().toISOString(),
    windows: {
      now_iso: nowIso,
      next30_iso: next30Iso,
      month_start_iso: monthStartIso,
      month_end_iso: monthEndIso,
    },
    accounts: (accountsRes.data ?? []) as AccountsTruthRow[],
    recent_transactions: (recentTxRes.data ?? []) as TransactionsTruthRow[],
    month_transactions: (monthTxRes.data ?? []) as TransactionsTruthRow[],
    recurring_bills: (recurringBillsRes.data ?? []) as RecurringBillsTruthRow[],
    recurring_income: (recurringIncomeRes.data ?? []) as RecurringIncomeTruthRow[],
    goals: (goalsRes.data ?? []) as MoneyGoalsTruthRow[],
    liabilities: (liabilitiesRes.data ?? []) as LiabilitiesTruthRow[],
    external_connections: (connectionsRes.data ?? []) as ExternalConnectionsTruthRow[],
    counts: {
      budget_items: budgetItemsRes.count ?? 0,
      investment_accounts: investmentAccountsRes.count ?? 0,
    },
  };
}
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
