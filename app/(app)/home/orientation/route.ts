// app/api/home/orientation/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ORIENTATION_KEY = "home_orientation_v1";

// Keep copy calm + human + non-urgent.
function pickSentence(input: {
  dueReviews: number;
  upcomingBills: number;
  hasIncome: boolean;
}) {
  // Priority order: decisions due -> bills -> otherwise quiet stability if we have enough context.
  if (input.dueReviews > 0) {
    return {
      text: "A decision is ready to revisit when you’re ready.",
      href: "/revisit",
    };
  }

  if (input.upcomingBills > 0) {
    return {
      text: "One upcoming bill may need a look.",
      href: "/bills",
    };
  }

  // Only say “steady” if we have at least some financial scaffolding (income or bills exist).
  if (input.hasIncome || input.upcomingBills >= 0) {
    return {
      text: "Everything looks steady right now.",
      href: null,
    };
  }

  // Otherwise: silence (valid)
  return null;
}

export async function POST(req: Request) {
  try {
    const { user_id } = (await req.json().catch(() => ({}))) as { user_id?: string };
    if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY; // fallback if you used a different name

    if (!url || !key) {
      return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 });
    }

    const admin = createClient(url, key, { auth: { persistSession: false } });

    // 1) Due (or due-soon) revisit decisions
    const nowIso = new Date().toISOString();
    const soonIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: due, error: dueErr } = await admin
      .from("decisions")
      .select("id")
      .eq("user_id", user_id)
      .not("review_at", "is", null)
      .lte("review_at", soonIso)
      .limit(5);

    if (dueErr) {
      // fail quietly (Home can be silent)
    }

    // 2) Upcoming bills (simple heuristic: any active bills exist)
    const { data: bills, error: billsErr } = await admin
      .from("bills")
      .select("id")
      .eq("user_id", user_id)
      .eq("status", "active")
      .limit(5);

    if (billsErr) {
      // fail quietly
    }

    // 3) Income exists?
    const { data: income, error: incomeErr } = await admin
      .from("income")
      .select("id")
      .eq("user_id", user_id)
      .limit(1);

    const sentence = pickSentence({
      dueReviews: (due ?? []).length,
      upcomingBills: (bills ?? []).length,
      hasIncome: !incomeErr && (income ?? []).length > 0,
    });

    // If no meaningful sentence, remove any existing orientation row for silence.
    if (!sentence) {
      await admin
        .from("decision_inbox")
        .delete()
        .eq("user_id", user_id)
        .eq("type", "engine")
        .eq("dedupe_key", ORIENTATION_KEY);

      return NextResponse.json({ ok: true, item: null });
    }

    // Upsert by (user_id, dedupe_key) style: we’ll emulate with delete + insert to avoid constraints guessing
    await admin
      .from("decision_inbox")
      .delete()
      .eq("user_id", user_id)
      .eq("type", "engine")
      .eq("dedupe_key", ORIENTATION_KEY);

    const { error: insErr } = await admin.from("decision_inbox").insert({
      user_id,
      type: "engine",
      title: sentence.text,
      body: null,
      severity: 2,
      status: "open",
      snoozed_until: null,
      dedupe_key: ORIENTATION_KEY,
      action_label: null,
      action_href: sentence.href,
    });

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: { text: sentence.text, href: sentence.href } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
