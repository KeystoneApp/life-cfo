import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);

    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const { data: categoriesData, error: categoriesErr } = await supabase
      .from("categories")
      .select("name")
      .eq("household_id", householdId)
      .order("name", { ascending: true });

    if (categoriesErr) throw categoriesErr;

    let rules: any[] = [];

    const { data: rulesData, error: rulesErr } = await supabase
      .from("categorisation_rules")
      .select("id,merchant_pattern,description_pattern,category,priority,created_at")
      .eq("household_id", householdId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (!rulesErr) {
      rules = rulesData ?? [];
    }

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      rules,
      categories_available: (categoriesData ?? []).map((c) => c.name).filter(Boolean),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Rules fetch failed" },
      { status: 500 }
    );
  }
}