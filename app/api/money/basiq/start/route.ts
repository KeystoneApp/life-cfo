import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { basiqFetch } from "@/lib/money/providers/basiq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemIdPayload = {
  basiq_user_id: string;
  basiq_authlink_id?: string;
};

function safeJsonParse<T>(input: unknown): T | null {
  if (typeof input !== "string") return null;
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function jsonStringifyStable(v: unknown) {
  return JSON.stringify(v);
}

export async function POST(req: Request) {
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
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body?.connection_id === "string" ? body.connection_id : "";
    if (!connectionId) {
      return NextResponse.json({ ok: false, error: "Missing connection_id" }, { status: 400 });
    }

    // Load external connection (must belong to household)
    const { data: conn, error: connErr } = await supabase
      .from("external_connections")
      .select("id, household_id, provider, status, item_id, display_name")
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (connErr) throw connErr;
    if (!conn) return NextResponse.json({ ok: false, error: "Connection not found." }, { status: 404 });
    if (conn.provider !== "basiq") {
      return NextResponse.json({ ok: false, error: "Not a Basiq connection." }, { status: 400 });
    }

    // item_id will store JSON like {"basiq_user_id":"...", "basiq_authlink_id":"..."}
    let payload = safeJsonParse<ItemIdPayload>(conn.item_id) ?? null;

    // Ensure Basiq user exists
    let basiqUserId = payload?.basiq_user_id ?? "";
    if (!basiqUserId) {
      // Create a Basiq user
      // Basiq expects an email; we can use the current user's email if available,
      // otherwise create a stable synthetic email in your domain.
      const email =
        typeof user.email === "string" && user.email.includes("@")
          ? user.email
          : `${user.id}@users.life-cfo.local`;

      const created: any = await basiqFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          mobile: null,
          firstName: null,
          lastName: null,
        }),
      });

      // Basiq returns a user object; id is typically on `id`
      basiqUserId = String(created?.id || "");
      if (!basiqUserId) {
        throw new Error("Basiq user create failed (missing id).");
      }

      payload = { basiq_user_id: basiqUserId };
    }

    // Create AuthLink (hosted bank-connect flow)
    // We'll use a simple description that maps to the household/connection.
    const authlink: any = await basiqFetch("/authlink", {
      method: "POST",
      body: JSON.stringify({
        userId: basiqUserId,
        // Optional: branding/redirect depends on your Basiq setup.
        // We'll start without redirect so you can test the hosted flow.
        // You can add redirectUrl later when you have a callback page.
        // redirectUrl: "https://life-cfo.com/money/connect/basiq/callback",
        description: `Life CFO (${conn.display_name ?? "Basiq"})`,
      }),
    });

    const authLinkUrl = String(authlink?.link || authlink?.url || "");
    const authLinkId = String(authlink?.id || "");
    if (!authLinkUrl) {
      throw new Error("Basiq authlink create failed (missing link/url).");
    }

    // Persist item_id JSON so later sync can use basiq_user_id (and optionally authlink id)
    const nextPayload: ItemIdPayload = {
      basiq_user_id: basiqUserId,
      basiq_authlink_id: authLinkId || payload?.basiq_authlink_id,
    };

    const { error: updErr } = await supabase
      .from("external_connections")
      .update({
        item_id: jsonStringifyStable(nextPayload),
        status: "needs_auth",
      })
      .eq("id", connectionId)
      .eq("household_id", householdId);

    if (updErr) throw updErr;

    return NextResponse.json({
      ok: true,
      connection_id: connectionId,
      basiq_user_id: basiqUserId,
      auth_link_url: authLinkUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Basiq start failed" }, { status: 500 });
  }
}