// app/api/money/connections/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getDefaultHouseholdIdForUser(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}

async function requireOwnerOrEditor(supabase: any, householdId: string, userId: string) {
  const { data, error } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .in("role", ["owner", "editor"])
    .maybeSingle();

  if (error) throw error;
  if (!data?.role) {
    return { ok: false as const, error: "You don’t have permission to do that." };
  }
  return { ok: true as const };
}

function normalizeProvider(input: unknown): "manual" | "plaid" | "basiq" {
  if (typeof input !== "string") return "manual";
  const p = input.trim().toLowerCase();
  if (p === "plaid") return "plaid";
  if (p === "basiq") return "basiq";
  return "manual";
}

function connectionStatusForProvider(provider: string): string {
  // manual = placeholder
  return provider === "manual" ? "manual" : "needs_auth";
}

function defaultDisplayName(provider: string): string {
  if (provider === "manual") return "Manual connection";
  return provider.toUpperCase();
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await getDefaultHouseholdIdForUser(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    // Household scoped (RLS also applies)
    const { data, error } = await supabase
      .from("external_connections")
      .select("id,household_id,provider,status,provider_connection_id,display_name,last_sync_at,created_at,updated_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, connections: data ?? [] });
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

    const householdId = await getDefaultHouseholdIdForUser(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    // ✅ enforce owner/editor at API level (RLS should also enforce)
    const perm = await requireOwnerOrEditor(supabase, householdId, user.id);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const provider = normalizeProvider(body?.provider);
    const status = connectionStatusForProvider(provider);

    const display_name =
      typeof body?.display_name === "string" && body.display_name.trim()
        ? body.display_name.trim()
        : defaultDisplayName(provider);

    // 1) create connection row (placeholder for manual; provider link later)
    const { data: connection, error: connErr } = await supabase
      .from("external_connections")
      .insert({
        household_id: householdId,
        user_id: user.id, // keep for audit/creator; NOT the access boundary
        provider,
        status,
        display_name,
        provider_connection_id: null,
        encrypted_access_token: null, // must be nullable in DB
        item_id: null,
        metadata: null,
      })
      .select("id,household_id,provider,status,display_name,created_at")
      .maybeSingle();

    if (connErr) throw connErr;

    // 2) seed starter accounts IF none exist for this household
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
        user_id: user.id, // creator/audit only
        provider,
        name: s.name,
        type: s.type,
        status: "active",
        currency,
        current_balance_cents: 0,
        archived: false,
        connection_id: connection?.id ?? null,
      }));

      const { data: created, error: seedErr } = await supabase
        .from("accounts")
        .insert(rows)
        .select("id,household_id,name,provider,type,status,currency,current_balance_cents,updated_at,created_at");

      if (seedErr) throw seedErr;

      seeded_accounts = created ?? [];
    }

    return NextResponse.json({ ok: true, connection, seeded_accounts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connection create failed" }, { status: 500 });
  }
}