// app/api/money/ask/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import { buildFinancialSnapshot } from "@/lib/money/reasoning/buildFinancialSnapshot";
import { explainSnapshot } from "@/lib/money/reasoning/explainSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

type AskBody = {
  q?: string;
  limit?: number;
};

const ORIENTATION_KEYWORDS = ["are we okay", "how are things looking", "financial status"];

const DIAGNOSIS_KEYWORDS = [
  "why does money feel tight",
  "why does money feel",
  "what changed recently",
  "what is the main pressure",
  "main pressure",
  "feel tight",
  "pressure right now",
];

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function readCookie(name: string) {
  // Next.js cookies() is async
  const jar = await cookies();
  return jar.get(name)?.value?.trim() || null;
}

async function resolveActiveHouseholdId(
  supabase: any,
  userId: string
): Promise<string | null> {
  // cookie-first (must be a valid membership)
  const preferred = await readCookie(COOKIE_NAME);

  if (preferred) {
    const { data: okRows, error: okErr } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .eq("household_id", preferred)
      .limit(1);

    if (!okErr && okRows?.length) return preferred;
  }

  // fallback to earliest membership
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}

async function ensureHouseholdMember(
  supabase: any,
  userId: string,
  householdId: string
) {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.household_id) throw new Error("Not a member of this household.");
  return { role: (data.role as string | null) ?? null };
}

export async function POST(req: Request) {
  try {
    // Create supabase client using your canonical helper
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AskBody;
    const q = safeStr(body.q).trim();
    const limit = clampInt(body.limit, 3, 30, 10);

    const householdId = await resolveActiveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const { role } = await ensureHouseholdMember(supabase, user.id, householdId);

    const lowerQ = q.toLowerCase();
    const looksOrientation =
      !q ||
      ORIENTATION_KEYWORDS.some((kw) => lowerQ.includes(kw));
    const looksDiagnosis = q && DIAGNOSIS_KEYWORDS.some((kw) => lowerQ.includes(kw));

    // Orientation path: empty query or simple keyword match
    if (looksOrientation) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);

      return NextResponse.json({
        ok: true,
        mode: "snapshot",
        household_id: householdId,
        snapshot,
        explanation,
      });
    }

    if (looksDiagnosis) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);

      const signals = snapshot.pressure;

      const rankedSignals: Array<{ name: string; summary: string; score: number }> = [
        { name: "structural", summary: signals.structural_pressure.summary, score: signals.structural_pressure.score },
        { name: "discretionary", summary: signals.discretionary_drift.summary, score: signals.discretionary_drift.score },
        { name: "timing", summary: signals.timing_mismatch.summary, score: signals.timing_mismatch.score },
        { name: "stability", summary: signals.stability_risk.summary, score: signals.stability_risk.score },
      ].sort((a, b) => b.score - a.score);

      const drivers = rankedSignals
        .filter((s) => s.score >= 0.15)
        .slice(0, 4)
        .map((s) => s.summary);

      const diagnosis = {
        headline: explanation.headline || "Current money pressure overview",
        summary: explanation.summary || "Here is what the current money signals show.",
        drivers,
        signals: {
          structural: signals.structural_pressure.summary,
          discretionary: signals.discretionary_drift.summary,
          timing: signals.timing_mismatch.summary,
          stability: signals.stability_risk.summary,
        },
      };

      return NextResponse.json({
        ok: true,
        mode: "diagnosis",
        household_id: householdId,
        diagnosis,
      });
    }

    const like = `%${q}%`;

    // NOTE: keep this as retrieval-only (no “AI answers” here)
    const [accountsRes, billsRes, txRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,provider,type,status,currency,current_balance_cents,updated_at,archived")
        .eq("household_id", householdId)
        .or(`name.ilike.${like},provider.ilike.${like},type.ilike.${like},status.ilike.${like}`)
        .order("updated_at", { ascending: false })
        .limit(limit),

      supabase
        .from("recurring_bills")
        .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,updated_at")
        .eq("household_id", householdId)
        .ilike("name", like)
        .order("next_due_at", { ascending: true })
        .limit(limit),

      supabase
        .from("transactions")
        .select("id,account_id,posted_at,amount_cents,currency,merchant,description,category")
        .eq("household_id", householdId)
        .or(`merchant.ilike.${like},description.ilike.${like},category.ilike.${like}`)
        .order("posted_at", { ascending: false })
        .limit(limit),
    ]);

    const firstErr = accountsRes.error || billsRes.error || txRes.error;
    if (firstErr) {
      return NextResponse.json(
        {
          ok: false,
          error: firstErr.message,
          debug: {
            accounts_ok: !accountsRes.error,
            bills_ok: !billsRes.error,
            transactions_ok: !txRes.error,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "search",
      household_id: householdId,
      role,
      q,
      results: {
        accounts: accountsRes.data ?? [],
        bills: billsRes.data ?? [],
        transactions: txRes.data ?? [],
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Ask failed." }, { status: 500 });
  }
}
