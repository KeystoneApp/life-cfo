// app/api/money/connections/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getMemberRole(supabase: any, userId: string, householdId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("role")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .limit(1);

  if (error) throw error;
  return (data?.[0]?.role as string | undefined) ?? null;
}

async function resolveHouseholdId(supabase: any, userId: string, requested?: string | null) {
  // 1) explicit request (persist)
  if (requested) {
    const role = await getMemberRole(supabase, userId, requested);
    if (role) {
      await supabase
        .from("household_preferences")
        .upsert({ user_id: userId, active_household_id: requested }, { onConflict: "user_id" });
      return requested;
    }
  }

  // 2) preference
  const { data: pref, error: prefErr } = await supabase
    .from("household_preferences")
    .select("active_household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (prefErr) throw prefErr;

  const preferred = pref?.active_household_id as string | undefined;
  if (preferred) {
    const role = await getMemberRole(supabase, userId, preferred);
    if (role) return preferred;
  }

  // 3) fallback
  const { data: hm, error: hmErr } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (hmErr) throw hmErr;
  return (hm?.[0]?.household_id as string | undefined) ?? null;
}

function normalizeProvider(input: unknown): string {
  if (typeof input !== "string") return "manual";
  const p = input.trim().toLowerCase();
  return p || "manual";
}

function connectionStatusForProvider(provider: string): string {
  return provider === "manual" ? "manual" : "needs_auth";
}

function defaultDisplayName(provider: string): string | null {
  if (provider === "manual") return "Manual";
  return provider.toUpperCase();
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const requestedHouseholdId = url.searchParams.get("household_id");

    const householdId = await resolveHouseholdId(supabase, user.id, requestedHouseholdId);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("external_connections")
      .select("id,household_id,provider,status,provider_connection_id,display_name,last_sync_at,created_at,updated_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, household_id: householdId, connections: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connections fetch failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const requestedHouseholdId = typeof body?.household_id === "string" ? body.household_id : null;
    const householdId = await resolveHouseholdId(supabase, user.id, requestedHouseholdId);

    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    const role = await getMemberRole(supabase, user.id, householdId);
    if (!role) return NextResponse.json({ ok: false, error: "Not a member of that household." }, { status: 403 });

    // enforce: only owner/editor can create connections
    if (role !== "owner" && role !== "editor") {
      return NextResponse.json({ ok: false, error: "You don’t have permission to connect accounts for this household." }, { status: 403 });
    }

    const provider = normalizeProvider(body?.provider);
    const status = connectionStatusForProvider(provider);
    const display_name = typeof body?.display_name === "string" ? body.display_name : defaultDisplayName(provider);

    const { data: connection, error: connErr } = await supabase
      .from("external_connections")
      .insert({
        user_id: user.id,
        household_id: householdId,
        provider,
        status,
        display_name,
        provider_connection_id: null,
        encrypted_access_token: null,
      })
      .select("id,household_id,provider,status,display_name,created_at")
      .maybeSingle();

    if (connErr) throw connErr;

    // Seed accounts only if household has no accounts yet (household-scoped!)
    const { count: existingCount, error: countErr } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("archived", false);

    if (countErr) throw countErr;

    let seeded_accounts: any[] = [];

    if ((existingCount ?? 0) === 0) {
      const currency = typeof body?.currency === "string" ? body.currency : "AUD";

      const seed = [
        { name: "Everyday Spending", type: "cash" },
        { name: "Bills Buffer", type: "cash" },
        { name: "Savings", type: "cash" },
      ];

      const rows = seed.map((s) => ({
        household_id: householdId,
        user_id: user.id,
        provider,
        name: s.name,
        type: s.type,
        status: "active",
        currency,
        current_balance_cents: 0,
        archived: false,
      }));

      const { data: created, error: seedErr } = await supabase
        .from("accounts")
        .insert(rows)
        .select("id,name,provider,type,status,currency,current_balance_cents,updated_at,created_at");

      if (seedErr) throw seedErr;
      seeded_accounts = created ?? [];
    }

    return NextResponse.json({ ok: true, household_id: householdId, connection, seeded_accounts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connection create failed" }, { status: 500 });
  }
}