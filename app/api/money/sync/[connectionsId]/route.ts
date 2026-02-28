// app/api/money/sync/[connectionId]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { getProvider } from "@/lib/money/providers";

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

export async function POST(_req: Request, { params }: { params: { connectionId: string } }) {
  try {
    const supabase = await supabaseRoute();

    // 1) Auth
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await resolveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    const connectionId = params.connectionId;
    if (!connectionId) {
      return NextResponse.json({ ok: false, error: "Missing connection id." }, { status: 400 });
    }

    // 2) Fetch connection (must belong to household)
    const { data: connection, error: connErr } = await supabase
      .from("external_connections")
      .select("id, household_id, provider, status")
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (connErr) throw connErr;

    if (!connection) {
      return NextResponse.json({ ok: false, error: "Connection not found." }, { status: 404 });
    }

    // 3) Provider dispatch
    const provider = getProvider(connection.provider);

    // IMPORTANT: provider.sync should behave household-safely.
    // For now we pass the connection id as before.
    const result = await provider.sync(connection.id);

    // 4) Update last_sync_at
    await supabase
      .from("external_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("household_id", householdId);

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      synced: true,
      result,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Sync failed" }, { status: 500 });
  }
}