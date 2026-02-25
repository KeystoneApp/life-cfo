// app/api/money/connections/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function supabaseServer() {
  // Next's cookies() shape varies by version — treat it as async-safe.
  // @supabase/ssr wants getAll/setAll.
  const cookieStore = await Promise.resolve(cookies() as any);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // Use ANON key + user cookies (RLS + session auth)
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll?.() ?? [];
        },
        setAll(cookiesToSet) {
          // In Route Handlers you typically can't persist cookies reliably
          // without a Response object. Supabase still works for reads.
          // We no-op safely here.
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
      .from("external_connections")
      .select("id,provider,status,provider_connection_id,display_name,last_sync_at,created_at,updated_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, connections: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connections fetch failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const uid = auth?.user?.id;
    if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === "string" ? body.provider : "manual";
    const display_name = typeof body?.display_name === "string" ? body.display_name : "Manual connection";

    const { data, error } = await supabase
      .from("external_connections")
      .insert({
        user_id: uid,
        provider,
        status: "active",
        display_name,
        metadata: {},
      })
      .select("id,provider,status,display_name,created_at")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ ok: true, connection: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connection create failed" }, { status: 500 });
  }
}