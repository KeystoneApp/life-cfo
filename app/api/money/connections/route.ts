import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function supabaseServer(cookieStore: any) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // no-ops are fine for our read-mostly API routes
        set() {},
        remove() {},
      },
    }
  );
}

async function getHouseholdIdForUser(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.household_id ?? null;
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = supabaseServer(cookieStore);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await getHouseholdIdForUser(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === "string" ? body.provider : "manual";
    const displayName = typeof body?.display_name === "string" ? body.display_name : null;

    // Build insert payload in a way that survives schema differences (eg display_name not yet present)
    const base: any = {
      user_id: user.id,
      household_id: householdId,
      provider,
      status: "active",
      metadata: { display_name: displayName },
      // satisfy NOT NULL constraints for “placeholder” connections
      encrypted_access_token: "",
    };

    // If the column exists, nice-to-have
    if (displayName) base.display_name = displayName;

    // Try insert; if we get a “column does not exist” for display_name, retry without it.
    let inserted: any = null;

    {
      const { data, error } = await supabase
        .from("external_connections")
        .insert(base)
        .select("id,provider,status,created_at,updated_at")
        .maybeSingle();

      if (!error) inserted = data;
      else {
        const msg = (error as any)?.message ?? "";
        if (msg.includes('column "display_name"') || msg.includes("display_name")) {
          delete base.display_name;

          const retry = await supabase
            .from("external_connections")
            .insert(base)
            .select("id,provider,status,created_at,updated_at")
            .maybeSingle();

          if (retry.error) throw retry.error;
          inserted = retry.data;
        } else {
          throw error;
        }
      }
    }

    return NextResponse.json({ ok: true, connection: inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connection create failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = supabaseServer(cookieStore);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await getHouseholdIdForUser(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    // Keep select conservative (avoid schema-cache/column mismatch surprises)
    const { data, error } = await supabase
      .from("external_connections")
      .select("id,provider,status,created_at,updated_at")
      .eq("user_id", user.id)
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, connections: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connections fetch failed" }, { status: 500 });
  }
}