// app/api/money/accounts/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || "";
}

export async function GET(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anon) {
      return NextResponse.json({ error: "Missing Supabase env (URL/ANON)" }, { status: 500 });
    }

    const token = bearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    // ✅ Use the user's JWT so RLS applies (no service role)
    const supabase = createClient(url, anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: auth, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("accounts")
      .select("id,name,provider,type,status,archived,current_balance_cents,currency,updated_at,created_at")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      accounts: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Accounts fetch failed" }, { status: 500 });
  }
}