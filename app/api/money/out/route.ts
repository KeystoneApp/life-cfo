import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MoneyByCurrency = Record<string, number>;

function addMoney(
  map: MoneyByCurrency,
  currency: string | null | undefined,
  cents: number
) {
  const cur = (currency || "AUD").toUpperCase();
  map[cur] = (map[cur] ?? 0) + cents;
}

function mapToRows(map: MoneyByCurrency) {
  return Object.entries(map)
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function safeNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

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

function nowIso() {
  return new Date().toISOString();
}

function plusDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Not signed in." },
        { status: 401 }
      );
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);

    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const monthStart = startOfMonthISO();
    const monthEnd = endOfMonthISO();
    const now = nowIso();
    const next30 = plusDaysIso(30);

    const [monthTxRes, recentTxRes, recurringBillsRes] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          "id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,created_at,updated_at"
        )
        .eq("household_id", householdId)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: false })
        .limit(2000),

      supabase
        .from("transactions")
        .select(
          "id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,created_at,updated_at"
        )
        .eq("household_id", householdId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100),

      supabase
        .from("recurring_bills")
        .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,notes")
        .eq("household_id", householdId)
        .eq("active", true)
        .order("next_due_at", { ascending: true })
        .limit(100),
    ]);

    if (monthTxRes.error) throw monthTxRes.error;
    if (recentTxRes.error) throw recentTxRes.error;
    if (recurringBillsRes.error) throw recurringBillsRes.error;

    const monthTransactions = monthTxRes.data ?? [];
    const recentTransactions = recentTxRes.data ?? [];
    const recurringBills = recurringBillsRes.data ?? [];

    const outMonthByCurrency: MoneyByCurrency = {};
    const categorySpend = new Map<string, number>();
    const merchantSpend = new Map<string, number>();

    for (const t of monthTransactions) {
      const cents =
        typeof t.amount_cents === "number"
          ? t.amount_cents
          : typeof t.amount === "number"
            ? Math.round(t.amount * 100)
            : 0;

      if (cents < 0) {
        const abs = Math.abs(cents);
        addMoney(outMonthByCurrency, t.currency, abs);

        const category =
          String(t.category || "Uncategorised").trim() || "Uncategorised";
        categorySpend.set(category, (categorySpend.get(category) ?? 0) + abs);

        const merchant =
          String(t.merchant || t.description || "Unknown").trim() || "Unknown";
        merchantSpend.set(merchant, (merchantSpend.get(merchant) ?? 0) + abs);
      }
    }

    const topCategories = Array.from(categorySpend.entries())
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 8);

    const topMerchants = Array.from(merchantSpend.entries())
      .map(([merchant, cents]) => ({ merchant, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 8);

    const recentOutTransactions = recentTransactions
      .filter((t) => {
        const cents =
          typeof t.amount_cents === "number"
            ? t.amount_cents
            : typeof t.amount === "number"
              ? Math.round(t.amount * 100)
              : 0;
        return cents < 0;
      })
      .slice(0, 12);

    const upcomingBills = recurringBills.filter((b) => {
      if (!b.next_due_at) return false;
      return b.next_due_at >= now && b.next_due_at <= next30;
    });

    const recurringBillsByCurrency: MoneyByCurrency = {};
    for (const b of recurringBills) {
      addMoney(recurringBillsByCurrency, b.currency, safeNum(b.amount_cents));
    }

    const upcomingBillsByCurrency: MoneyByCurrency = {};
    for (const b of upcomingBills) {
      addMoney(upcomingBillsByCurrency, b.currency, safeNum(b.amount_cents));
    }

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      out_flow: {
        month_total_by_currency: mapToRows(outMonthByCurrency),
        top_categories: topCategories,
        top_merchants: topMerchants,
        recent_out_transactions: recentOutTransactions,
        recurring_bills_count: recurringBills.length,
        recurring_bills_total_by_currency: mapToRows(recurringBillsByCurrency),
        upcoming_bills_count_next_30_days: upcomingBills.length,
        upcoming_bills_total_by_currency: mapToRows(upcomingBillsByCurrency),
        upcoming_bills: upcomingBills.slice(0, 8),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Money out fetch failed" },
      { status: 500 }
    );
  }
}