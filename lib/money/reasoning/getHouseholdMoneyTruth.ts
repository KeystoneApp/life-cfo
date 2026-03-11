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
      .eq("household_id", householdId),
  ]);

  if (accountsRes.error) throw accountsRes.error;
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
