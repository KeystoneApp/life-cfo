// app/api/money/sync/manual/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

async function resolveHouseholdId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value ?? null;

  if (cookieValue) {
    const { data, error } = await supabase
      .from("household_members")
      .select("id")
      .eq("user_id", userId)
      .eq("household_id", cookieValue)
      .limit(1);

    if (!error && data?.length) return cookieValue;
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}

function hashExternalId(parts: Array<string | null | undefined>) {
  const raw = parts.map((p) => (p ?? "").trim()).join("|");
  return crypto.createHash("md5").update(raw).digest("hex");
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const uid = user.id;

    const householdId = await resolveHouseholdId(supabase, uid);
    if (!householdId) return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === "string" ? body.provider : "manual";
    const currency = typeof body?.currency === "string" ? body.currency : "AUD";

    // Optional: tie to an existing connection row (must be in this household)
    const connectionId = typeof body?.connection_id === "string" ? body.connection_id : null;

    if (connectionId) {
      const { data: c, error: cErr } = await supabase
        .from("external_connections")
        .select("id")
        .eq("id", connectionId)
        .eq("household_id", householdId)
        .limit(1);

      if (cErr) throw cErr;
      if (!c?.length) return NextResponse.json({ ok: false, error: "Connection not found for this household." }, { status: 404 });
    }

    // 1) Ensure some starter accounts exist
    const { count: existingCount, error: countErr } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("archived", false);

    if (countErr) throw countErr;

    let accountIds: string[] = [];

    if ((existingCount ?? 0) === 0) {
      const seedAccounts = [
        { name: "Everyday Spending", type: "cash" },
        { name: "Bills Buffer", type: "cash" },
        { name: "Savings", type: "cash" },
      ];

      const { data: created, error: seedErr } = await supabase
        .from("accounts")
        .insert(
          seedAccounts.map((a) => ({
            household_id: householdId,
            provider,
            name: a.name,
            type: a.type,
            status: "active",
            currency,
            current_balance_cents: 0,
            archived: false,
          }))
        )
        .select("id");

      if (seedErr) throw seedErr;
      accountIds = (created ?? []).map((r: any) => String(r.id));
    } else {
      const { data: acctRows, error: acctErr } = await supabase
        .from("accounts")
        .select("id")
        .eq("household_id", householdId)
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .limit(5);

      if (acctErr) throw acctErr;
      accountIds = (acctRows ?? []).map((r: any) => String(r.id));
    }

    // 2) Seed a few transactions (or accept tx from body)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const today = `${yyyy}-${mm}-${dd}`;

    const incoming = Array.isArray(body?.transactions) ? body.transactions : null;

    const txSeed =
      incoming ??
      [
        { date: today, description: "Groceries", merchant: "Woolworths", category: "Groceries", amount_cents: -12840 },
        { date: today, description: "Pay", merchant: "Employer", category: "Income", amount_cents: 250000 },
        { date: today, description: "Coffee", merchant: "Cafe", category: "Eating out", amount_cents: -620 },
      ];

    const defaultAccountId = accountIds[0] ?? null;

    const rows = txSeed.map((t: any, idx: number) => {
      const date = typeof t?.date === "string" ? t.date : today;
      const description = typeof t?.description === "string" ? t.description : "Transaction";
      const merchant = typeof t?.merchant === "string" ? t.merchant : null;
      const category = typeof t?.category === "string" ? t.category : null;
      const pending = typeof t?.pending === "boolean" ? t.pending : false;

      const amount_cents =
        typeof t?.amount_cents === "number"
          ? t.amount_cents
          : typeof t?.amount === "number"
          ? Math.round(t.amount * 100)
          : 0;

      const acctId = typeof t?.account_id === "string" ? t.account_id : defaultAccountId;

      const external_id =
        typeof t?.external_id === "string" && t.external_id.trim()
          ? t.external_id.trim()
          : hashExternalId([
              householdId,
              provider,
              acctId ?? "",
              date,
              description,
              merchant ?? "",
              category ?? "",
              String(amount_cents),
              currency,
              connectionId ?? "",
              String(idx),
            ]);

      return {
        household_id: householdId,
        provider,
        external_id,
        connection_id: connectionId,
        account_id: acctId,
        date,
        description,
        merchant,
        category,
        pending,
        amount_cents,
        amount: amount_cents / 100,
        currency,
        updated_at: new Date().toISOString(),
      };
    });

    // 3) Upsert with household dedupe key (NO DUPES)
    const { data: upserted, error: upErr } = await supabase
      .from("transactions")
      .upsert(rows as any, { onConflict: "household_id,provider,external_id" })
      .select("id,external_id");

    if (upErr) throw upErr;

    // 4) Touch the connection last_sync_at if provided (optional)
    if (connectionId) {
      await supabase
        .from("external_connections")
        .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", connectionId)
        .eq("household_id", householdId);
    }

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      inserted_or_updated: upserted?.length ?? 0,
      dedupe_key: "household_id,provider,external_id",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Manual sync failed" }, { status: 500 });
  }
}