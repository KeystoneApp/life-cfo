// app/api/money/transactions/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function intOr(v: string | null, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

async function supabaseServer() {
  const cookieStore = await Promise.resolve(cookies() as any);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll?.() ?? [];
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) => cookieStore.set?.(name, value, options));
          } catch {
            // ignore
          }
        },
      },
    }
  );
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const uid = auth?.user?.id;
    if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const url = new URL(req.url);
    const accountId = url.searchParams.get("account_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const pending = url.searchParams.get("pending");
    const limit = Math.min(intOr(url.searchParams.get("limit"), 50), 200);

    let q = supabase
      .from("transactions")
      .select("id,user_id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,connection_id,provider,external_id,created_at,updated_at")
      .eq("user_id", uid)
      .order("date", { ascending: false })
      .limit(limit);

    if (accountId) q = q.eq("account_id", accountId);
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