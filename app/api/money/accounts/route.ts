// app/api/money/accounts/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
          // Route Handlers generally can't persist cookies reliably without a Response object.
          // For read-only requests, this is fine; keep it safe/no-op.
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

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const uid = auth?.user?.id;
    if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const { data, error } = await supabase
      .from("accounts")
      .select("id,user_id,name,provider,type,status,archived,current_balance_cents,currency,updated_at,created_at")
      .eq("user_id", uid)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ ok: true, accounts: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Accounts fetch failed" }, { status: 500 });
  }
}