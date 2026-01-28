// app/api/home/ask/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Action = "open_bills" | "open_money" | "open_decisions" | "open_review" | "none";

type AskRequest = {
  userId: string;
  question: string;
};

function isAction(x: any): x is Action {
  return ["open_bills", "open_money", "open_decisions", "open_review", "none"].includes(x);
}

function monthBoundsLocal() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function moneyFromCents(cents: number | null | undefined, currency: string | null | undefined) {
  const n = typeof cents === "number" ? cents : cents == null ? null : Number(cents);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const cur = (currency || "AUD").toUpperCase();
  return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n / 100);
}

// Very small “facts pack” — expand later
async function buildFactsPack(userId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // IMPORTANT: use SERVICE ROLE here (server-only)
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ✅ Keystone "truth" for bills in V1 is recurring_bills (has next_due_at)
  const { start, end } = monthBoundsLocal();

  const { data: recurringBills, error: rbErr } = await supabase
    .from("recurring_bills")
    .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,notes,updated_at")
    .eq("user_id", userId)
    .eq("active", true)
    .order("next_due_at", { ascending: true })
    .limit(200);

  const rb = (recurringBills ?? []) as Array<{
    id: string;
    name: string | null;
    amount_cents: number | null;
    currency: string | null;
    cadence: string | null;
    next_due_at: string | null;
    autopay: boolean | null;
    active: boolean | null;
    notes: string | null;
    updated_at: string | null;
  }>;

  const due_this_month = rb
    .filter((b) => {
      if (!b.next_due_at) return false;
      const ms = Date.parse(b.next_due_at);
      if (Number.isNaN(ms)) return false;
      return ms >= start.getTime() && ms < end.getTime();
    })
    .map((b) => ({
      id: b.id,
      name: (b.name || "Bill").trim(),
      next_due_at: b.next_due_at,
      amount: moneyFromCents(b.amount_cents, b.currency),
      autopay: !!b.autopay,
      cadence: b.cadence ?? null,
    }));

  return {
    now_iso: new Date().toISOString(),
    data_quality: {
      recurring_bills_ok: !rbErr,
      recurring_bills_count_active: rb.length,
      recurring_bills_count_due_this_month: due_this_month.length,
      note: "Bills come from recurring_bills. Amounts are derived from amount_cents/currency.",
    },
    bills_due_this_month: due_this_month,
    bills_active: rb.map((b) => ({
      id: b.id,
      name: (b.name || "Bill").trim(),
      next_due_at: b.next_due_at,
      amount_cents: b.amount_cents ?? null,
      currency: (b.currency || "AUD").toUpperCase(),
      autopay: !!b.autopay,
      cadence: b.cadence ?? null,
    })),
  };
}

const SYSTEM = `
You are Keystone Home Answer.
Rules:
- You may ONLY answer using the provided FACTS PACK.
- If the question requires data not present, say clearly what you can and can’t see.
- Do not guess. Do not invent bills, dates, or amounts.
- Be calm, concise, and helpful.
- No urgency, no "you should", no auto-commit, no pretending anything was saved.
- Keep the answer short. If listing bills, prefer "bills_due_this_month" over "bills_active".
Return JSON only that matches the provided schema.
`.trim();

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AskRequest>;
    const userId = (body.userId || "").trim();
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!userId || !question) {
      return NextResponse.json({ error: "Missing userId/question" }, { status: 400 });
    }

    const facts = await buildFactsPack(userId);

    // ✅ Responses API + Structured Outputs (reliable {answer, action})
    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `QUESTION:\n${question}\n\nFACTS PACK:\n${JSON.stringify(facts, null, 2)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "keystone_home_ask",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: { type: "string" },
              action: {
                type: "string",
                enum: ["open_bills", "open_money", "open_decisions", "open_review", "none"],
              },
            },
            required: ["answer", "action"],
          },
        },
      },
    });

    const raw = resp.output_text?.trim() || "";

    let parsed: { answer: string; action: Action };
    try {
      parsed = JSON.parse(raw) as { answer: string; action: Action };
    } catch {
      return NextResponse.json(
        { answer: "I couldn’t format that safely. Try again.", action: "none" as Action },
        { status: 502 }
      );
    }

    const answer = (parsed.answer || "").trim().slice(0, 4000);
    const action: Action = isAction(parsed.action) ? parsed.action : "none";

    return NextResponse.json({ answer, action });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
