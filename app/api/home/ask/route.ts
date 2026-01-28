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

// Very small “facts pack” — expand later
async function buildFactsPack(userId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // IMPORTANT: use SERVICE ROLE here (server-only)
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: bills } = await supabase
    .from("bills")
    .select("id,nickname,merchant_key,due_day_or_date,expected_amount,status,updated_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(50);

  return {
    now_iso: new Date().toISOString(),
    bills_active: (bills ?? []).map((b: any) => ({
      id: b.id,
      name: b.nickname || b.merchant_key,
      due: b.due_day_or_date,
      expected_amount: b.expected_amount ?? null,
      status: b.status,
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
      // Fail safe: never leak weird formatting into client UI
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
