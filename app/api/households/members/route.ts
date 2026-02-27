// app/api/households/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

async function getActiveHouseholdId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value ?? null;

  if (cookieValue) {
    const { data } = await supabase
      .from("household_members")
      .select("id")
      .eq("user_id", userId)
      .eq("household_id", cookieValue)
      .limit(1);

    if (data?.length) return cookieValue;
  }

  // preference fallback (cross-device)
  const pref = await supabase.from("household_preferences").select("active_household_id").eq("user_id", userId).maybeSingle();
  const prefId = pref?.data?.active_household_id ?? null;

  if (prefId) {
    const { data } = await supabase
      .from("household_members")
      .select("id")
      .eq("user_id", userId)
      .eq("household_id", prefId)
      .limit(1);

    if (data?.length) return prefId;
  }

  // first membership fallback
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const { data: memberships, error: memErr } = await supabase
      .from("household_members")
      .select("household_id,role,created_at,households(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (memErr) throw memErr;

    const households =
      (memberships ?? []).map((m: any) => ({
        id: m.household_id,
        name: m.households?.name ?? "Household",
        role: m.role ?? "viewer",
      })) ?? [];

    const active_household_id = await getActiveHouseholdId(supabase, user.id);

    return NextResponse.json({ ok: true, households, active_household_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Households fetch failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const household_id = typeof body?.household_id === "string" ? body.household_id : null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!household_id) return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });

    const { error } = await supabase.from("households").update({ name }).eq("id", household_id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Household update failed" }, { status: 500 });
  }
}