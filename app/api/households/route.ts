// app/api/households/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

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

    // Households the user belongs to
    const { data, error } = await supabase
      .from("household_members")
      .select("household_id,role,created_at,households!inner(id,name,created_at)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const households =
      (data ?? []).map((r: any) => ({
        household_id: r.household_id,
        role: r.role,
        joined_at: r.created_at,
        id: r.households?.id,
        name: r.households?.name,
        created_at: r.households?.created_at,
      })) ?? [];

    return NextResponse.json({ ok: true, households });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Households fetch failed" }, { status: 500 });
  }
}