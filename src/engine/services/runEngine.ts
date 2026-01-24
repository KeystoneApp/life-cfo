// src/engine/services/runEngine.ts
import { supabase } from "../adapters/supabase";
import { Bill, Transaction, RecurringPattern } from "../domain/types";
import { detectRecurringPatterns } from "../domain/recurring";
import { forecastCashflow30d } from "../domain/forecast";
import { generateInsights } from "../domain/insights";
import { autoReopenExpiredSnoozes } from "./autoReopenSnoozed";

type StoredRecurringPatternRow = {
  merchant_key: string;
  status: string | null;
  confirmed_at: string | null;
  ignored_at: string | null;
};

type UpcomingBillsItem = {
  merchant_key: string;
  amount: number;
  date: string;
};

type UpcomingBillsPayload = {
  count?: number;
  items?: UpcomingBillsItem[];
};

type SafeToSpendPayload = {
  amount?: number;
};

type NextActionPayload = {
  action?: string;
  message?: string;
};

type ExistingInboxRow = {
  dedupe_key: string;
  status: string | null;
  snoozed_until: string | null;
};

type InboxUpsertRow = {
  user_id: string;
  run_id: string;
  dedupe_key: string;
  type: string;
  title: string;
  body?: string | null;
  severity?: number | null;
  action_href?: string | null; // ✅ for Home Orientation (and future engine links)
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function parseUpcomingBillsPayload(payload: unknown): UpcomingBillsPayload {
  if (!isObject(payload)) return {};

  const rawItems = payload.items;
  const items: UpcomingBillsItem[] = Array.isArray(rawItems)
    ? rawItems
        .filter(isObject)
        .map((it) => ({
          merchant_key: typeof it.merchant_key === "string" ? it.merchant_key : "Unknown",
          amount: asNumber(it.amount) ?? 0,
          date: typeof it.date === "string" ? it.date : "",
        }))
    : [];

  const count = asNumber(payload.count);

  return { count, items };
}

function parseSafeToSpendPayload(payload: unknown): SafeToSpendPayload {
  if (!isObject(payload)) return {};
  return { amount: asNumber(payload.amount) };
}

function parseNextActionPayload(payload: unknown): NextActionPayload {
  if (!isObject(payload)) return {};
  return {
    action: typeof payload.action === "string" ? payload.action : undefined,
    message: typeof payload.message === "string" ? payload.message : undefined,
  };
}

type HomeOrientationDraft = {
  text: string;
  href: string | null;
  severity: number;
} | null;

/**
 * Home Orientation is ONE calm conclusion (no numbers, no lists) written by Engine.
 * It must not be derived from UI state; it’s an engine-authored synthesis.
 */
function buildHomeOrientation(insights: Array<{ type: string; severity?: number | null; payload: unknown }>): HomeOrientationDraft {
  // priority order (v1)
  const pick = (t: string) => insights.find((i) => i.type === t) ?? null;

  const upcoming = pick("upcoming_bills");
  if (upcoming) {
    return {
      text: "One upcoming bill may need a look.",
      href: "/bills",
      severity: upcoming.severity ?? 2,
    };
  }

  const safe = pick("safe_to_spend_week");
  if (safe) {
    return {
      text: "You look steady within your usual range.",
      href: null,
      severity: safe.severity ?? 1,
    };
  }

  const next = pick("next_action");
  if (next) {
    const payload = parseNextActionPayload(next.payload);
    const msg = (payload.message ?? "").trim();

    // Keep calm + non-urgent. Also avoid empty.
    const text = msg.length > 0 ? msg : "There’s one small next step worth considering.";
    return {
      text,
      href: "/inbox",
      severity: next.severity ?? 2,
    };
  }

  return null;
}

export async function runEngine(userId: string, startBalance = 0, startDateISO?: string) {
  // Auto-reopen any snoozes that have expired
  await autoReopenExpiredSnoozes(userId);

  // 1) Load data
  const { data: bills, error: billsErr } = await supabase.from("bills").select("*").eq("user_id", userId);
  if (billsErr) throw billsErr;

  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (txErr) throw txErr;

  const typedBills = (bills ?? []) as Bill[];
  const typedTxs = (txs ?? []) as Transaction[];

  // 2) Domain logic
  const patterns = detectRecurringPatterns(typedTxs, userId);

  // 2.1) Persist detected recurring patterns (upsert)
  if (patterns.length > 0) {
    const { error: patErr } = await supabase
      .from("recurring_patterns")
      .upsert(
        patterns.map((p) => ({
          user_id: p.user_id,
          merchant_key: p.merchant_key,
          cadence: p.cadence,
          avg_amount: p.avg_amount ?? null,
          next_due_date: p.next_due_date ?? null,
          confidence: p.confidence,
        })),
        { onConflict: "user_id,merchant_key" }
      );

    if (patErr) throw patErr;
  }

  // 2.2) Load stored recurring_patterns so we can respect status (confirmed/ignored)
  const { data: storedPatterns, error: storedErr } = await supabase
    .from("recurring_patterns")
    .select("merchant_key,status,confirmed_at,ignored_at")
    .eq("user_id", userId);

  if (storedErr) throw storedErr;

  const storedByMerchant = new Map<string, StoredRecurringPatternRow>(
    (storedPatterns ?? []).map((p) => p as StoredRecurringPatternRow).map((p) => [p.merchant_key, p])
  );

  // 2.3) Merge stored status fields onto detected patterns (for insights + output)
  const patternsWithStatus: Array<Omit<RecurringPattern, "id" | "created_at">> = patterns.map((p) => {
    const stored = storedByMerchant.get(p.merchant_key);

    const rawStatus = stored?.status ?? "pending";
    const status: RecurringPattern["status"] =
      rawStatus === "confirmed" || rawStatus === "ignored" || rawStatus === "pending" ? rawStatus : "pending";

    return {
      ...p,
      status,
      confirmed_at: stored?.confirmed_at ?? null,
      ignored_at: stored?.ignored_at ?? null,
    };
  });

  const forecast = forecastCashflow30d({
    startBalance,
    bills: typedBills,
    startDateISO,
  });

  const insights = generateInsights({
    forecast,
    bills: typedBills,
    patterns: patternsWithStatus,
  });

  // 3) Write engine run record
  const version = "engine-v1";
  const { data: runRow, error: runErr } = await supabase
    .from("engine_runs")
    .insert([{ user_id: userId, version, status: "success" }])
    .select("*")
    .single();

  if (runErr) throw runErr;

  const runId = String((runRow as { id: unknown }).id);

  // 4) Write insights
  const insightRows = insights.map((i) => ({
    user_id: userId,
    run_id: runId,
    type: i.type,
    severity: i.severity ?? 1,
    payload_json: i.payload,
  }));

  const { error: insErr } = await supabase.from("engine_insights").insert(insightRows);
  if (insErr) throw insErr;

  // 5) Decision Inbox (deduped)
  const inboxItems: InboxUpsertRow[] = [];

  for (const ins of insights) {
    if (ins.type === "upcoming_bills") {
      const payload = parseUpcomingBillsPayload(ins.payload);
      const items = payload.items ?? [];
      const lines = items.map((b) => `• ${b.merchant_key} — $${b.amount} on ${b.date}`).join("\n");

      inboxItems.push({
        user_id: userId,
        run_id: runId,
        dedupe_key: "upcoming_bills",
        type: "upcoming_bills",
        title: `Upcoming bills (${payload.count ?? items.length})`,
        body: lines || "No upcoming bills found.",
        severity: ins.severity ?? 1,
        action_href: "/bills",
      });
    }

    if (ins.type === "safe_to_spend_week") {
      const payload = parseSafeToSpendPayload(ins.payload);

      inboxItems.push({
        user_id: userId,
        run_id: runId,
        dedupe_key: "safe_to_spend_week",
        type: "safe_to_spend_week",
        title: "Safe to spend this week",
        body: `Estimated safe-to-spend: $${payload.amount ?? 0}`,
        severity: ins.severity ?? 1,
        action_href: "/inputs",
      });
    }

    if (ins.type === "next_action") {
      const payload = parseNextActionPayload(ins.payload);
      const action = payload.action ?? "unknown";

      inboxItems.push({
        user_id: userId,
        run_id: runId,
        dedupe_key: `next_action:${action}`,
        type: "next_action",
        title: "Next action",
        body: payload.message ?? "",
        severity: ins.severity ?? 2,
        action_href: "/inbox",
      });
    }
  }

  // ✅ 5.1) Home Orientation (ONE calm sentence, no numbers, no lists)
  const home = buildHomeOrientation(
    insights.map((i) => ({ type: i.type, severity: i.severity ?? null, payload: i.payload }))
  );

  if (home) {
    inboxItems.push({
      user_id: userId,
      run_id: runId,
      dedupe_key: "home_orientation_v1",
      type: "engine",
      title: home.text,
      body: null,
      severity: home.severity,
      action_href: home.href,
    });
  }

  // ---- decision inbox: respect done + snoozed (do not overwrite them) ----
  const now = new Date();
  const nowISO = now.toISOString();

  const dedupeKeys = Array.from(new Set(inboxItems.map((x) => x.dedupe_key).filter((k) => k.length > 0)));

  let inboxItemsToUpsert = inboxItems;

  if (dedupeKeys.length > 0) {
    const { data: existing, error: existingErr } = await supabase
      .from("decision_inbox")
      .select("dedupe_key,status,snoozed_until")
      .eq("user_id", userId)
      .in("dedupe_key", dedupeKeys);

    if (existingErr) throw existingErr;

    const existingByKey = new Map<string, ExistingInboxRow>(
      (existing ?? []).map((r) => r as ExistingInboxRow).map((r) => [r.dedupe_key, r])
    );

    inboxItemsToUpsert = inboxItems.filter((item) => {
      const current = existingByKey.get(item.dedupe_key);

      // If no existing row, allow insert/upsert
      if (!current) return true;

      // If done, never touch it
      if (current.status === "done") return false;

      // If snoozed into the future, don't touch it
      if (current.status === "snoozed" && current.snoozed_until) {
        const snoozeUntilISO = new Date(current.snoozed_until).toISOString();
        if (snoozeUntilISO > nowISO) return false;
      }

      // Otherwise, ok to upsert (open or snooze expired)
      return true;
    });
  }

  console.log("decision_inbox items to upsert =", inboxItemsToUpsert.length);

  if (inboxItemsToUpsert.length > 0) {
    const { error: inboxErr } = await supabase
      .from("decision_inbox")
      .upsert(inboxItemsToUpsert, { onConflict: "user_id,dedupe_key" });

    if (inboxErr) throw inboxErr;
  }

  // 6) Return result for runner
  return {
    runId,
    version,
    forecast,
    patterns: patternsWithStatus,
    insights,
  };
}
