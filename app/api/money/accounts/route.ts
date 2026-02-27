// app/api/money/accounts/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  // 1) explicit request (and persist as preference)
  if (requested && (await isMember(supabase, userId, requested))) {
    await supabase
      .from("household_preferences")
      .upsert({ user_id: userId, active_household_id: requested }, { onConflict: "user_id" });
    return requested;
  }

  // 2) preference
  const { data: pref, error: prefErr } = await supabase
    .from("household_preferences")
    .select("active_household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (prefErr) throw prefErr;

  const preferred = pref?.active_household_id as string | undefined;
  if (preferred && (await isMember(supabase, userId, preferred))) return preferred;

  // 3) fallback membership
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

    const { data, error } = await supabase
      .from("accounts")
      .select("id,user_id,household_id,name,provider,type,status,archived,current_balance_cents,currency,updated_at,created_at")
      .eq("household_id", householdId)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ ok: true, household_id: householdId, accounts: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Accounts fetch failed" }, { status: 500 });
  }
}