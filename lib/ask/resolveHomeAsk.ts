// lib/ask/resolveHomeAsk.ts
import { createClient } from "@supabase/supabase-js";

/**
 * ============================
 * Home Ask — Core Resolver
 * ============================
 *
 * Canonical engine for:
 * - Intent classification
 * - Safe data retrieval
 * - Grounded snapshot building
 * - Escalation to Capture seed (Framing-style)
 *
 * ❗️NO UI
 * ❗️NO side effects
 * ❗️READ-ONLY
 */

export type AskIntent =
  | "state"
  | "find"
  | "compare"
  | "afford"
  | "attention"
  | "unknown";

export type AskAction =
  | "open_bills"
  | "open_money"
  | "open_decisions"
  | "open_review"
  | "create_capture"
  | "none";

export type AskResult = {
  answer: string;
  action: AskAction;
  suggested_next?: "create_capture";
  // NOTE: kept name "framing_seed" to avoid breaking callers,
  // but it represents a Capture seed (title + prompt + notes).
  framing_seed?: {
    title: string;
    prompt: string;
    notes: string[];
  };
};

/**
 * ---------- Intent detection ----------
 * Small, deterministic, conservative.
 */
export function classifyIntent(question: string): AskIntent {
  const q = question.toLowerCase();

  if (/(can we|should we|afford|safe to)/.test(q)) return "afford";
  if (/(what bills|what decisions|what captures|what is due|what's due)/.test(q)) return "state";
  if (/(find|where is|what did we decide|show me)/.test(q)) return "find";
  if (/(compare|vs|change|difference|last month)/.test(q)) return "compare";
  if (/(what should i look at|anything i should check)/.test(q)) return "attention";

  return "unknown";
}

/**
 * ---------- Resolver ----------
 */
export async function resolveHomeAsk(args: {
  userId: string;
  question: string;
}): Promise<AskResult> {
  const { userId, question } = args;
  const intent = classifyIntent(question);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
  );

  const now = new Date();
  const nowIso = now.toISOString();

  /**
   * ============================
   * A) STATE QUERIES
   * ============================
   */
  if (intent === "state") {
    // Bills due in next 30 days (default window)
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: bills } = await supabase
      .from("recurring_bills")
      .select("name,amount_cents,currency,next_due_at,autopay")
      .eq("user_id", userId)
      .eq("active", true)
      .gte("next_due_at", nowIso)
      .lt("next_due_at", end.toISOString())
      .order("next_due_at", { ascending: true })
      .limit(6);

    if (!bills || bills.length === 0) {
      return {
        answer: `I don’t see any bills due in the next 30 days (from what I can see).`,
        action: "open_bills",
      };
    }

    const lines = bills.map((b) => {
      const amt =
        typeof b.amount_cents === "number"
          ? new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: (b.currency || "AUD").toUpperCase(),
            }).format(b.amount_cents / 100)
          : "—";

      const due = b.next_due_at ? new Date(b.next_due_at).toLocaleDateString() : "—";

      const name = String(b.name ?? "Bill").trim() || "Bill";
      return `• ${name} — ${due} — ${amt}${b.autopay ? " (autopay)" : ""}`;
    });

    return {
      answer: `In the next 30 days (until ${end.toLocaleDateString()}), you have:\n\n${lines.join("\n")}`,
      action: "open_bills",
    };
  }

  /**
   * ============================
   * D) AFFORD / SHOULD WE
   * ============================
   * ❗ Never grant permission
   * ❗ Frame only
   */
  if (intent === "afford") {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("name,current_balance_cents,currency")
      .eq("user_id", userId)
      .eq("archived", false);

    const { data: upcomingBills } = await supabase
      .from("recurring_bills")
      .select("name,amount_cents,currency,next_due_at")
      .eq("user_id", userId)
      .eq("active", true)
      .gte("next_due_at", nowIso)
      .limit(6);

    // Note: conservative — if currencies are mixed, we still present a single AUD total
    // (matches current V1 assumptions in this resolver). This is framing-only.
    const cashTotal =
      accounts?.reduce((sum, a) => {
        const n = typeof a.current_balance_cents === "number" ? a.current_balance_cents : 0;
        return sum + n;
      }, 0) ?? 0;

    const billTotal =
      upcomingBills?.reduce((sum, b) => {
        const n = typeof b.amount_cents === "number" ? b.amount_cents : 0;
        return sum + n;
      }, 0) ?? 0;

    return {
      answer: [
        `Here’s what I can see right now:`,
        ``,
        `• Available cash across accounts: ${new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: "AUD",
        }).format(cashTotal / 100)}`,
        `• Upcoming committed bills: ${new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: "AUD",
        }).format(billTotal / 100)}`,
        ``,
        `I can’t say “yes” or “no” from here — but we can frame it so it’s safe and clear.`,
      ].join("\n"),
      action: "open_money",
      suggested_next: "create_capture",
      framing_seed: {
        title: question,
        prompt: question,
        notes: [
          "Goal: assess affordability without granting permission",
          "Known: current cash position (accounts)",
          "Known: upcoming commitments (active recurring bills)",
          "Unknown: exact timing and which account it comes from",
          "Unknown: whether this is one-off or recurring",
          "Unknown: the buffer you want to keep",
        ],
      },
    };
  }

  /**
   * ============================
   * FALLBACK
   * ============================
   */
  return {
    answer: "I can’t confidently answer that yet with the data I have. If this matters, we can capture it properly.",
    action: "none",
    suggested_next: "create_capture",
    framing_seed: {
      title: question,
      prompt: question,
      notes: ["More context is needed to answer safely from data."],
    },
  };
}
