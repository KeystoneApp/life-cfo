// app/api/money/transactions/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function intOr(v: string | null, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const accountId = url.searchParams.get("account_id"); // optional
    const connectionId = url.searchParams.get("connection_id"); // optional
    const from = url.searchParams.get("from"); // optional YYYY-MM-DD
    const to = url.searchParams.get("to"); // optional YYYY-MM-DD
    const pending = url.searchParams.get("pending"); // optional "true" | "false"
    const limit = Math.min(intOr(url.searchParams.get("limit"), 50), 200);

    let q = supabase
      .from("transactions")
      .select(
        "id,user_id,date,amount,amount_cents,currency,description,merchant,category,pending,account_id,connection_id,provider,external_id,created_at,updated_at"
      )
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (accountId) q = q.eq("account_id", accountId);
    if (connectionId) q = q.eq("connection_id", connectionId);

    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);

    if (pending === "true") q = q.eq("pending", true);
    if (pending === "false") q = q.eq("pending", false);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ ok: true, transactions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Transactions fetch failed" }, { status: 500 });
  }
}