"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

type Account = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

type RecurringBill = {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  cadence: Cadence;
  next_due_at: string;
  autopay: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type RecurringIncome = {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  cadence: Cadence;
  next_pay_at: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type DecisionRow = {
  id: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  reviewed_at: string | null;
  review_at: string | null;
  confidence_level: number | null; // decision-time confidence (1-3)
  review_history: any[] | null; // jsonb array
  ai_json: any | null; // can be object or stringified JSON
};

function formatMoneyFromCents(cents: number, currency = "AUD") {
  const value = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function sumCents(items: { amount_cents: number }[]) {
  return items.reduce((acc, x) => acc + (x.amount_cents || 0), 0);
}

type ComputedTotals = {
  balance: number;

  bills7: RecurringBill[];
  bills14: RecurringBill[];
  bills30: RecurringBill[];

  income7: RecurringIncome[];
  income14: RecurringIncome[];
  income30: RecurringIncome[];

  bills7Total: number;
  bills14Total: number;
  bills30Total: number;

  income7Total: number;
  income14Total: number;
  income30Total: number;

  safeToSpendWeek: number;
};

function computeTotals(accounts: Account[], bills: RecurringBill[], income: RecurringIncome[]): ComputedTotals {
  const activeBills = bills.filter((b) => b.active);
  const activeIncome = income.filter((i) => i.active);

  const balance = accounts.reduce((acc, a) => acc + (a.current_balance_cents || 0), 0);

  const now = new Date();
  const t7 = daysFromNow(7).getTime();
  const t14 = daysFromNow(14).getTime();
  const t30 = daysFromNow(30).getTime();

  const dueIn = (iso: string, toMs: number) => {
    const ms = new Date(iso).getTime();
    return ms >= now.getTime() && ms <= toMs;
  };

  const bills7 = activeBills.filter((b) => dueIn(b.next_due_at, t7));
  const bills14 = activeBills.filter((b) => dueIn(b.next_due_at, t14));
  const bills30 = activeBills.filter((b) => dueIn(b.next_due_at, t30));

  const income7 = activeIncome.filter((i) => dueIn(i.next_pay_at, t7));
  const income14 = activeIncome.filter((i) => dueIn(i.next_pay_at, t14));
  const income30 = activeIncome.filter((i) => dueIn(i.next_pay_at, t30));

  const bills7Total = sumCents(bills7);
  const bills14Total = sumCents(bills14);
  const bills30Total = sumCents(bills30);

  const income7Total = sumCents(income7);
  const income14Total = sumCents(income14);
  const income30Total = sumCents(income30);

  // v1 safe-to-spend: simple + truthful, no forecasting
  const safeToSpendWeek = Math.max(0, balance + income7Total - bills7Total);

  return {
    balance,
    bills7,
    bills14,
    bills30,
    income7,
    income14,
    income30,
    bills7Total,
    bills14Total,
    bills30Total,
    income7Total,
    income14Total,
    income30Total,
    safeToSpendWeek,
  };
}

// ----------------------
// Insights helpers (v1)
// ----------------------

function safeMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return ms;
}

function getAI(ai_json: any | null) {
  if (!ai_json) return null;
  if (typeof ai_json === "string") {
    try {
      return JSON.parse(ai_json);
    } catch {
      return null;
    }
  }
  if (typeof ai_json === "object") return ai_json;
  return null;
}

type ReviewHistoryEntry = {
  reviewed_at?: string;
  notes?: string;
  outcome?: string;
  confidence_level?: number | null; // review-time confidence (0-100 per RPC; may be null)
  at?: string; // legacy
  note?: string; // legacy
};

function normalizeReviewHistory(input: any): ReviewHistoryEntry[] {
  if (!Array.isArray(input)) return [];
  return input.filter((x) => x && typeof x === "object");
}

function daysBetween(aMs: number, bMs: number) {
  const diff = bMs - aMs;
  return diff / (1000 * 60 * 60 * 24);
}

function pickReviewConfidence100(history: ReviewHistoryEntry[]): number | null {
  // Prefer last entry with confidence_level (0-100), else null
  for (let i = history.length - 1; i >= 0; i--) {
    const v = history[i]?.confidence_level;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function decisionConfTo100(v: number | null): number | null {
  // decision confidence is 1-3. Map to 33/67/100.
  if (v === 1) return 33;
  if (v === 2) return 67;
  if (v === 3) return 100;
  return null;
}

function bucketLabel(type: any) {
  if (type === "spending") return "Spending";
  if (type === "time") return "Time";
  if (type === "relationship") return "Relationship";
  if (type === "health") return "Health";
  if (type === "other") return "Other";
  return "Unknown";
}

type Insight = {
  title: string;
  body: string;
  tone?: "neutral" | "warning" | "positive";
};

function buildInsights(decisions: DecisionRow[]): { insights: Insight[]; stats: { reviewedCount: number } } {
  const now = Date.now();

  const withReviewAt = decisions.filter((d) => d.review_at != null);
  const overdue = withReviewAt.filter((d) => {
    const ra = safeMs(d.review_at);
    if (!ra) return false;
    if (ra > now) return false;

    const rv = safeMs(d.reviewed_at);
    // overdue if never reviewed OR reviewed before scheduled review date
    if (!rv) return true;
    return rv < ra;
  });

  const reviewed = decisions.filter((d) => !!safeMs(d.reviewed_at));
  const reviewedCount = reviewed.length;

  // Review lateness
  const latenessDays: number[] = [];
  for (const d of reviewed) {
    const ra = safeMs(d.review_at);
    const rv = safeMs(d.reviewed_at);
    if (!rv || !ra) continue;

    const diffDays = daysBetween(ra, rv);
    if (diffDays > 0.05) latenessDays.push(diffDays); // > ~1.2 hours late counts as late
  }
  const lateCount = latenessDays.length;
  const latenessRate = reviewedCount > 0 ? lateCount / reviewedCount : 0;
  const avgLateDays = lateCount > 0 ? latenessDays.reduce((a, b) => a + b, 0) / lateCount : 0;

  // Confidence drift (decision 1-3 -> 33/67/100 vs review history confidence 0-100)
  const drift: number[] = [];
  for (const d of reviewed) {
    const dec100 = decisionConfTo100(d.confidence_level);
    const history = normalizeReviewHistory(d.review_history);
    const rev100 = pickReviewConfidence100(history);
    if (dec100 == null || rev100 == null) continue;
    drift.push(rev100 - dec100); // positive means more confident after review
  }
  const driftAvg = drift.length ? drift.reduce((a, b) => a + b, 0) / drift.length : null;

  // Avoidance by type: compare overdue rate by decision_type (from ai_json)
  const byType: Record<string, { total: number; overdue: number }> = {};
  for (const d of withReviewAt) {
    const ai = getAI(d.ai_json);
    const t = ai?.decision_type ?? "unknown";
    if (!byType[t]) byType[t] = { total: 0, overdue: 0 };
    byType[t].total += 1;
    if (overdue.some((x) => x.id === d.id)) byType[t].overdue += 1;
  }
  const typePairs = Object.entries(byType)
    .filter(([, v]) => v.total >= 2) // need at least 2 items to claim a pattern
    .map(([k, v]) => ({ type: k, total: v.total, overdue: v.overdue, rate: v.total ? v.overdue / v.total : 0 }))
    .sort((a, b) => b.rate - a.rate);

  const mostAvoided = typePairs[0] ?? null;

  // Learning velocity: reviews in last 30 days
  const cutoff30 = now - 30 * 24 * 60 * 60 * 1000;
  const reviews30 = reviewed.filter((d) => {
    const rv = safeMs(d.reviewed_at);
    return rv != null && rv >= cutoff30;
  }).length;

  const insights: Insight[] = [];

  // 1) Overdue
  if (withReviewAt.length > 0) {
    if (overdue.length > 0) {
      insights.push({
        title: "Reviews currently overdue",
        tone: "warning",
        body: `You have ${overdue.length} decision(s) past their review date. Clearing even 1 can reduce mental load.`,
      });
    } else {
      insights.push({
        title: "Review system is on track",
        tone: "positive",
        body: "Nothing is overdue right now. Keystone’s feedback loop is staying healthy.",
      });
    }
  } else {
    insights.push({
      title: "No reviews scheduled yet",
      tone: "neutral",
      body: "Schedule a review date on a decision to let Keystone learn over time.",
    });
  }

  // 2) Lateness rate
  if (reviewedCount >= 3) {
    const pct = Math.round(latenessRate * 100);
    if (pct >= 50) {
      insights.push({
        title: "Reviews tend to happen late",
        tone: "warning",
        body: `${pct}% of reviewed decisions were completed after their planned review date. Average lateness (when late): ${avgLateDays.toFixed(
          1
        )} days.`,
      });
    } else if (pct > 0) {
      insights.push({
        title: "Review timing is mostly on time",
        tone: "neutral",
        body: `${pct}% of reviewed decisions were late. When late, average lateness was ${avgLateDays.toFixed(1)} days.`,
      });
    } else {
      insights.push({
        title: "You review on time",
        tone: "positive",
        body: "So far, your reviewed decisions have been on time vs their scheduled review date.",
      });
    }
  } else {
    insights.push({
      title: "Not enough review data (yet)",
      tone: "neutral",
      body: "Keystone needs ~3 reviewed decisions to detect timing patterns reliably.",
    });
  }

  // 3) Confidence drift
  if (driftAvg != null && drift.length >= 3) {
    const direction = driftAvg >= 0 ? "up" : "down";
    const amt = Math.abs(driftAvg).toFixed(0);
    insights.push({
      title: "Confidence drift after review",
      tone: direction === "down" ? "warning" : "positive",
      body: `On average, your confidence shifts ${direction} by ~${amt} points after review (based on ${drift.length} reviews with confidence data).`,
    });
  } else {
    insights.push({
      title: "Confidence patterns pending",
      tone: "neutral",
      body: "Add confidence when reviewing decisions (0–100) to unlock confidence drift insights.",
    });
  }

  // 4) Avoidance by type
  if (mostAvoided && mostAvoided.rate >= 0.5) {
    insights.push({
      title: "Possible avoidance pattern by decision type",
      tone: "warning",
      body: `${bucketLabel(mostAvoided.type)} decisions are overdue more often (${Math.round(
        mostAvoided.rate * 100
      )}% overdue across ${mostAvoided.total} item(s)).`,
    });
  } else if (mostAvoided && mostAvoided.total >= 2) {
    insights.push({
      title: "No strong avoidance signal by type",
      tone: "neutral",
      body: `By decision type, overdue rates are currently low or mixed. (Top bucket: ${bucketLabel(mostAvoided.type)} at ${Math.round(
        mostAvoided.rate * 100
      )}% overdue.)`,
    });
  } else {
    insights.push({
      title: "Type-based insights need more data",
      tone: "neutral",
      body: "Keystone needs multiple reviewed + scheduled decisions per type to spot patterns.",
    });
  }

  // 5) Learning velocity
  insights.push({
    title: "Learning velocity",
    tone: reviews30 >= 5 ? "positive" : "neutral",
    body: `You reviewed ${reviews30} decision(s) in the last 30 days. Every review compounds Keystone’s usefulness.`,
  });

  // 6) Small meta insight: how many decisions exist
  insights.push({
    title: "Decision trail depth",
    tone: "neutral",
    body: `You have ${decisions.length} decision(s) recorded, ${reviewedCount} reviewed, and ${withReviewAt.length} scheduled for review.`,
  });

  return { insights, stats: { reviewedCount } };
}

export default function EnginePage() {
  const { showToast } = useToast();

  const notify = (opts: { title?: string; description?: string }) => {
    const msg = [opts.title, opts.description].filter(Boolean).join(" — ");
    showToast({ message: msg || "Done." });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [income, setIncome] = useState<RecurringIncome[]>([]);

  // Decisions for insights
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);

  // Step 1: last ran indicator (local-only)
  const [lastRanAt, setLastRanAt] = useState<string | null>(null);

  // Step 2: cooldown (local-only)
  const COOLDOWN_MS = 10_000;
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr || !data.user) {
        setError("Not signed in.");
        setLoading(false);
        return;
      }

      setUserId(data.user.id);
      await loadAll(data.user.id);
      await loadDecisionsForInsights(data.user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll(uid: string) {
    const [aRes, bRes, iRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", uid).order("created_at", { ascending: true }),
      supabase
        .from("recurring_bills")
        .select("*")
        .eq("user_id", uid)
        .order("active", { ascending: false })
        .order("next_due_at", { ascending: true }),
      supabase
        .from("recurring_income")
        .select("*")
        .eq("user_id", uid)
        .order("active", { ascending: false })
        .order("next_pay_at", { ascending: true }),
    ]);

    if (aRes.error) setError(aRes.error.message);
    if (bRes.error) setError(bRes.error.message);
    if (iRes.error) setError(iRes.error.message);

    const a = (aRes.data || []) as Account[];
    const b = (bRes.data || []) as RecurringBill[];
    const i = (iRes.data || []) as RecurringIncome[];

    setAccounts(a);
    setBills(b);
    setIncome(i);

    return { accounts: a, bills: b, income: i };
  }

  async function loadDecisionsForInsights(uid: string) {
    setInsightsLoading(true);
    try {
      const { data, error } = await supabase
        .from("decisions")
        .select("id,status,created_at,decided_at,reviewed_at,review_at,confidence_level,review_history,ai_json")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message);
        setDecisions([]);
        return;
      }

      setDecisions((data ?? []) as DecisionRow[]);
    } finally {
      setInsightsLoading(false);
    }
  }

  const activeBills = useMemo(() => bills.filter((b) => b.active), [bills]);
  const activeIncome = useMemo(() => income.filter((i) => i.active), [income]);

  const totals = useMemo(() => computeTotals(accounts, bills, income), [accounts, bills, income]);

  const insightsPack = useMemo(() => buildInsights(decisions), [decisions]);

  function buildUpcomingBillsBody(t: ComputedTotals) {
    if (t.bills14.length === 0) {
      return [
        "No bills due in the next 14 days.",
        "",
        `Balance: ${formatMoneyFromCents(t.balance)}`,
        `Bills (7d): ${formatMoneyFromCents(t.bills7Total)}`,
        `Bills (14d): ${formatMoneyFromCents(t.bills14Total)}`,
        `Bills (30d): ${formatMoneyFromCents(t.bills30Total)}`,
      ].join("\n");
    }

    const lines = t.bills14.map((b) => {
      const flags = [b.autopay ? "autopay" : null].filter(Boolean).join(", ");
      const flagText = flags ? ` (${flags})` : "";
      return `• ${b.name}: ${formatMoneyFromCents(b.amount_cents, b.currency)} — due ${fmtDateTime(
        b.next_due_at
      )}${flagText}`;
    });

    return [
      `Bills due in the next 14 days (${t.bills14.length}):`,
      ...lines,
      "",
      `Total (14d): ${formatMoneyFromCents(t.bills14Total)}`,
      `Balance now: ${formatMoneyFromCents(t.balance)}`,
    ].join("\n");
  }

  function buildUpcomingIncomeBody(t: ComputedTotals) {
    if (t.income14.length === 0) {
      return [
        "No income due in the next 14 days.",
        "",
        `Balance: ${formatMoneyFromCents(t.balance)}`,
        `Income (7d): ${formatMoneyFromCents(t.income7Total)}`,
        `Income (14d): ${formatMoneyFromCents(t.income14Total)}`,
        `Income (30d): ${formatMoneyFromCents(t.income30Total)}`,
      ].join("\n");
    }

    const lines = t.income14.map((i) => {
      return `• ${i.name}: ${formatMoneyFromCents(i.amount_cents, i.currency)} — next pay ${fmtDateTime(i.next_pay_at)}`;
    });

    return [
      `Income due in the next 14 days (${t.income14.length}):`,
      ...lines,
      "",
      `Total (14d): ${formatMoneyFromCents(t.income14Total)}`,
      `Balance now: ${formatMoneyFromCents(t.balance)}`,
    ].join("\n");
  }

  function severityForSafeToSpend(t: ComputedTotals) {
    const dollars = t.safeToSpendWeek / 100;
    if (dollars <= 0) return 3;
    if (dollars < 200) return 2;
    return 1;
  }

  function severityForUpcomingBills(t: ComputedTotals) {
    if (t.bills14Total > t.balance) return 3;
    if (t.bills14Total > 0) return 2;
    return 1;
  }

  function severityForUpcomingIncome(t: ComputedTotals) {
    // income is usually a reassurance, not an alarm
    if (t.income14Total > 0) return 1;
    return 2;
  }

  async function writeSingleReminder(opts: {
    runId: string;
    dedupe_key: string;
    title: string;
    body: string;
    severity: number;
  }) {
    if (!userId) return;

    const { error: upErr } = await supabase.from("decision_inbox").upsert(
      [
        {
          user_id: userId,
          run_id: opts.runId,
          type: "engine",
          title: opts.title,
          body: opts.body,
          severity: opts.severity,
          status: "open",
          snoozed_until: null, // Step 3: always clear snooze on engine refresh
          dedupe_key: opts.dedupe_key,
        },
      ],
      { onConflict: "user_id,dedupe_key" }
    );

    if (upErr) throw upErr;
  }

  async function runEngineV1() {
    if (!userId) return;

    // Step 2: cooldown
    const now = Date.now();
    if (cooldownUntil && now < cooldownUntil) {
      const secs = Math.ceil((cooldownUntil - now) / 1000);
      notify({ title: "Please wait", description: `Engine cooldown: ${secs}s` });
      return;
    }

    setRunning(true);
    setCooldownUntil(now + COOLDOWN_MS);

    try {
      // refresh right before writing, and compute totals from fresh data
      const fresh = await loadAll(userId);
      const freshTotals = computeTotals(fresh.accounts, fresh.bills, fresh.income);

      const runId = crypto.randomUUID();

      // Step 5: missing inputs nudges (truthful + deduped)
      if (fresh.bills.length === 0) {
        await writeSingleReminder({
          runId,
          dedupe_key: "engine_missing_bills",
          title: "Add bills so Keystone can remind you",
          severity: 2,
          body: [
            "Keystone can’t remind you about upcoming bills yet because there are no bills.",
            "",
            "Next step:",
            "Go to Bills and add your recurring obligations (rent, internet, insurance…).",
          ].join("\n"),
        });
      }

      if (fresh.income.length === 0) {
        await writeSingleReminder({
          runId,
          dedupe_key: "engine_missing_income",
          title: "Add income so safe-to-spend can be truthful",
          severity: 2,
          body: [
            "Keystone can’t include income in safe-to-spend yet because there is no recurring income.",
            "",
            "Next step:",
            "Go to Income and add your recurring pay / benefits / transfers (if applicable).",
          ].join("\n"),
        });
      }

      // SAFEGUARD: if no accounts, write missing-accounts reminder and stop
      if (fresh.accounts.length === 0) {
        await writeSingleReminder({
          runId,
          dedupe_key: "engine_missing_accounts",
          title: "Add accounts to compute safe-to-spend",
          severity: 1,
          body: [
            "Keystone can’t compute safe-to-spend yet because there are no accounts.",
            "",
            "Truth reminder:",
            "Safe-to-spend is based on your account balances + income due - bills due.",
            "",
            "Next step:",
            "Go to Accounts and add at least one account balance.",
          ].join("\n"),
        });

        setLastRanAt(new Date().toLocaleString());
        notify({ title: "Engine v1 ran", description: "Missing accounts reminder written to Inbox." });
        return;
      }

      // Clear missing-accounts reminder if it exists and we now have accounts
      await supabase
        .from("decision_inbox")
        .update({ status: "done", snoozed_until: null })
        .eq("user_id", userId)
        .eq("dedupe_key", "engine_missing_accounts");

      const safeTitle = "Safe to spend this week";
      const billsTitle = "Upcoming bills (next 14 days)";
      const incomeTitle = "Upcoming income (next 14 days)";

      const safeBody = [
        `Balance now: ${formatMoneyFromCents(freshTotals.balance)}`,
        `Income (7d): ${formatMoneyFromCents(freshTotals.income7Total)}`,
        `Bills (7d): ${formatMoneyFromCents(freshTotals.bills7Total)}`,
        "",
        `Safe-to-spend (7d): ${formatMoneyFromCents(freshTotals.safeToSpendWeek)}`,
        "",
        "Truth reminder:",
        "safe_to_spend = balance + income_due_7d - bills_due_7d (floored at 0).",
      ].join("\n");

      const billsBody = buildUpcomingBillsBody(freshTotals);
      const incomeBody = buildUpcomingIncomeBody(freshTotals);

      // Step 3: always write "open" and clear snooze
      const rows: any[] = [
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: safeTitle,
          body: safeBody,
          severity: severityForSafeToSpend(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_safe_to_spend_week",
        },
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: billsTitle,
          body: billsBody,
          severity: severityForUpcomingBills(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_upcoming_bills_14d",
        },
        // Step 4: upcoming income (14d)
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: incomeTitle,
          body: incomeBody,
          severity: severityForUpcomingIncome(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_upcoming_income_14d",
        },
      ];

      const { error: upErr } = await supabase.from("decision_inbox").upsert(rows, {
        onConflict: "user_id,dedupe_key",
      });

      if (upErr) throw upErr;

      // If income/bills now exist, close the "missing" reminders if they exist
      await supabase
        .from("decision_inbox")
        .update({ status: "done", snoozed_until: null })
        .eq("user_id", userId)
        .in("dedupe_key", ["engine_missing_bills", "engine_missing_income"]);

      // refresh decisions insights too (they may have changed)
      await loadDecisionsForInsights(userId);

      setLastRanAt(new Date().toLocaleString());
      notify({
        title: "Engine v1 ran",
        description: "Wrote Safe-to-spend + Upcoming bills + Upcoming income into Inbox (dedupe-safe).",
      });
    } catch (e: any) {
      notify({ title: "Engine error", description: e?.message ?? "Failed to run engine." });
    } finally {
      setRunning(false);
    }
  }

  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)) : 0;

  return (
    <Page title="Engine" subtitle="Manual simulation harness. Engine v1 reads your truths and writes reminders to Inbox.">
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {loading ? <Chip>Loading…</Chip> : <Chip>Ready</Chip>}
                {error ? <Chip>{error}</Chip> : null}
                {lastRanAt ? <Chip>Last ran: {lastRanAt}</Chip> : <Chip>Last ran: —</Chip>}
                {cooldownSeconds > 0 ? <Chip>Cooldown: {cooldownSeconds}s</Chip> : null}
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={() => userId && loadAll(userId)} disabled={!userId || loading || running}>
                  Refresh inputs
                </Button>
                <Button onClick={runEngineV1} disabled={!userId || loading || running || cooldownSeconds > 0}>
                  {running ? "Running…" : "Run Engine v1"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ✅ NEW: Keystone Insights v1 */}
        <Card className="bg-zinc-50">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">Keystone Insights (v1)</div>
                <div className="text-sm opacity-70">
                  Explainable patterns from your decision + review history. No guessing.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => userId && loadDecisionsForInsights(userId)}
                  disabled={!userId || insightsLoading}
                >
                  {insightsLoading ? "Refreshing…" : "Refresh insights"}
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>Decisions: {decisions.length}</Badge>
              <Badge>Reviewed: {insightsPack.stats.reviewedCount}</Badge>
              <Badge>Scheduled: {decisions.filter((d) => d.review_at != null).length}</Badge>
            </div>

            <div className="mt-4 grid gap-3">
              {insightsLoading ? (
                <div className="text-sm opacity-70">Loading insights…</div>
              ) : (
                insightsPack.insights.map((x, idx) => (
                  <div
                    key={`ins-${idx}`}
                    className={`rounded-lg border p-3 ${
                      x.tone === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : x.tone === "positive"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-zinc-200 bg-white"
                    }`}
                  >
                    <div className="font-semibold">{x.title}</div>
                    <div className="text-sm opacity-80 mt-1 whitespace-pre-wrap">{x.body}</div>
                  </div>
                ))
              )}
            </div>

            <div className="text-xs opacity-60 mt-3">
              Tip: Add confidence (0–100) when reviewing decisions to unlock richer confidence drift insights.
(Decision confidence is currently 1–3.)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Inputs</div>
            <div className="flex flex-wrap gap-2">
              <Badge>Accounts: {accounts.length}</Badge>
              <Badge>Bills (active): {activeBills.length}</Badge>
              <Badge>Income (active): {activeIncome.length}</Badge>
              <Chip>Balance: {formatMoneyFromCents(totals.balance)}</Chip>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Obligations snapshot</div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="font-semibold">Next 7 days</div>
                <div className="text-sm opacity-75 mt-1">
                  Bills: {formatMoneyFromCents(totals.bills7Total)} ({totals.bills7.length})
                </div>
                <div className="text-sm opacity-75">
                  Income: {formatMoneyFromCents(totals.income7Total)} ({totals.income7.length})
                </div>
                <div className="text-sm opacity-75 mt-2">
                  Safe-to-spend: <span className="font-semibold">{formatMoneyFromCents(totals.safeToSpendWeek)}</span>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="font-semibold">Next 14 days</div>
                <div className="text-sm opacity-75 mt-1">
                  Bills: {formatMoneyFromCents(totals.bills14Total)} ({totals.bills14.length})
                </div>
                <div className="text-sm opacity-75">
                  Income: {formatMoneyFromCents(totals.income14Total)} ({totals.income14.length})
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="font-semibold">Next 30 days</div>
                <div className="text-sm opacity-75 mt-1">
                  Bills: {formatMoneyFromCents(totals.bills30Total)} ({totals.bills30.length})
                </div>
                <div className="text-sm opacity-75">
                  Income: {formatMoneyFromCents(totals.income30Total)} ({totals.income30.length})
                </div>
              </div>
            </div>

            <div className="text-sm opacity-70 mt-3">
              Engine v1 writes deduped truth reminders to Inbox. No graphs. No guessing. Cooldown prevents spam runs.
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
