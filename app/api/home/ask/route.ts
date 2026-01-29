// app/api/home/ask/route.ts
import { NextResponse } from "next/server";
import { resolveHomeAsk, type AskAction } from "@/lib/ask/resolveHomeAsk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "open_bills" | "open_money" | "open_decisions" | "open_review" | "none";

type AskRequest = {
  userId: string;
  question: string;
};

function isAction(x: any): x is Action {
  return ["open_bills", "open_money", "open_decisions", "open_review", "none"].includes(x);
}

/**
 * Home Ask API
 * - Calls the canonical resolver (grounded, read-only).
 * - Keeps client contract stable: {answer, action}
 * - May also return {suggested_next, framing_seed} for future UI hooks.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AskRequest>;
    const userId = (body.userId || "").trim();
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!userId || !question) {
      return NextResponse.json({ error: "Missing userId/question" }, { status: 400 });
    }

    const result = await resolveHomeAsk({ userId, question });

    // Maintain backward compatible "action" enum for the current Home UI.
    // If resolver returns "create_framing", we downgrade action to "none" for now
    // and surface the intent via suggested_next/framing_seed (future hook).
    const rawAction: AskAction = result.action;
    const action: Action = isAction(rawAction) ? rawAction : "none";

    const payload: any = {
      answer: (result.answer || "").trim().slice(0, 4000),
      action,
    };

    if (result.suggested_next) payload.suggested_next = result.suggested_next;
    if (result.framing_seed) payload.framing_seed = result.framing_seed;

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
