// app/api/money/transactions/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intOr(v: string | null, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

async function isMember(supabase: any, userId: string, householdId: string) {
  const { data, error } = await supabase
    .from("household_members")
    .select("id")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .limit(1);

  if (error) throw error;
  return !!data?.[0]?.id;
}

async function resolveHouseholdId(supabase: any, userId: string, requested?: string | null) {
  if (requested && (await isMember(supabase, userId, requested))) {
    await supabase
      .from("household_preferences")
      .upsert({ user_id: userId, active_household_id: requested }, { onConflict: "user_id" });
    return requested;
  }

  const { data: pref, error: prefErr } = await supabase
    .from("household_preferences")
    .select("active_household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (prefErr) throw prefErr;

  const preferred = pref?.active_household_id as string | undefined;
  if (preferred && (await isMember(supabase, userId, preferred))) return preferred;

  const { data: hm, error: hmErr } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (hmErr) throw hmErr;
  return (hm?.[0]?.household_id as string | undefined) ?? null;
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const uid = auth?.user?.id;
    if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const url = new URL(req.url);
    const requestedHouseholdId = url.searchParams.get("household_id");

    const householdId = await resolveHouseholdId(supabase, uid, requestedHouseholdId);
    if (!householdId) return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });

    const accountId = url.searchParams.get("account_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const pending = url.searchParams.get("pending");
    const limit = Math.min(intOr(url.searchParams.get("limit"), 50), 250);

    let q = supabase
      .from("transactions")
      .select(
        "id,user_id,household_id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,connection_id,provider,external_id,created_at,updated_at"
      )
      .eq("household_id", householdId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (accountId) q = q.eq("account_id", accountId);
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (pending === "true") q = q.eq("pending", true);
    if (pending === "false") q = q.eq("pending", false);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ ok: true, household_id: householdId, transactions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Transactions fetch failed" }, { status: 500 });
  }
}