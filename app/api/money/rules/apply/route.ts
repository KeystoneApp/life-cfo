import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RuleRow = {
  id: string;
  merchant_pattern: string | null;
  description_pattern: string | null;
  category: string;
  priority: number | null;
};

type TxRow = {
  id: string;
  merchant: string | null;
  description: string | null;
  category: string | null;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function normalise(s: unknown) {
  return safeStr(s).toLowerCase();
}

function matchesRule(tx: TxRow, rule: RuleRow) {
  const merchantPattern = normalise(rule.merchant_pattern);
  const descriptionPattern = normalise(rule.description_pattern);

  const merchant = normalise(tx.merchant);
  const description = normalise(tx.description);

  if (!merchantPattern && !descriptionPattern) return false;

  if (merchantPattern && !merchant.includes(merchantPattern)) return false;
  if (descriptionPattern && !description.includes(descriptionPattern)) return false;

  return true;
}

export async function POST() {
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
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const { data: rulesData, error: rulesErr } = await supabase
      .from("categorisation_rules")
      .select("id,merchant_pattern,description_pattern,category,priority")
      .eq("household_id", householdId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (rulesErr) throw rulesErr;

    const rules = (rulesData ?? []) as RuleRow[];

    if (rules.length === 0) {
      return NextResponse.json({
        ok: true,
        household_id: householdId,
        scanned: 0,
        updated: 0,
        message: "No rules to apply.",
      });
    }

    const { data: txData, error: txErr } = await supabase
      .from("transactions")
      .select("id,merchant,description,category")
      .eq("household_id", householdId)
      .or("category.is.null,category.eq.")
      .order("date", { ascending: false })
      .limit(5000);

    if (txErr) throw txErr;

    const txRows = (txData ?? []) as TxRow[];

    let updated = 0;

    for (const tx of txRows) {
      const matchedRule = rules.find((rule) => matchesRule(tx, rule));
      if (!matchedRule) continue;

      const nextCategory = safeStr(matchedRule.category);
      if (!nextCategory) continue;

      const { error: updateErr } = await supabase
        .from("transactions")
        .update({
          category: nextCategory,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tx.id)
        .eq("household_id", householdId);

      if (updateErr) throw updateErr;
      updated += 1;
    }

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      scanned: txRows.length,
      updated,
      message: updated > 0 ? "Rules applied." : "No uncategorised transactions matched.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Rule apply failed" },
      { status: 500 }
    );
  }
}