// app/api/ai/decision-frame/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type FrameResult = {
  title: string;
  statement: string;
  what_im_hearing: string;
  questions: string[];
};

function safeString(x: any) {
  return typeof x === "string" ? x : "";
}

function safeArray(x: any) {
  return Array.isArray(x) ? x.filter((v) => typeof v === "string") : [];
}

// IMPORTANT: This route assumes you already have an OpenAI wrapper somewhere.
// If your existing /api/ai/conversation route already calls OpenAI, copy that pattern here.
// I’m using a placeholder `callModel()` function signature below.
async function callModel(prompt: string): Promise<string> {
  // TODO: Replace with your existing model call helper used in /api/ai/conversation
  // Return raw assistant text.
  throw new Error("callModel() not implemented. Copy your existing OpenAI call here.");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = safeString(body?.text).trim();

    if (!text) {
      return NextResponse.json({ error: "Missing text." }, { status: 400 });
    }

    const prompt = `
You are a calm, practical Life CFO assistant.

Task: turn the user's messy decision input into a clear, single decision statement.
Return ONLY valid JSON with keys:
- title (string, <= 90 chars)
- statement (string, one sentence if possible)
- what_im_hearing (string, 2-4 short bullet-ish lines separated by "\\n")
- questions (array of 2-5 strings)

Rules:
- Do not add advice. Do not decide for them.
- No markdown, no extra keys.

User input:
"""${text}"""
`.trim();

    const raw = await callModel(prompt);

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // fallback: try to salvage something minimal
      parsed = {
        title: text.length > 90 ? `${text.slice(0, 87)}…` : text,
        statement: text,
        what_im_hearing: "• A decision is being held.\n• We need to clarify the exact question.",
        questions: ["What’s the exact outcome you’re trying to decide?"],
      };
    }

    const result: FrameResult = {
      title: safeString(parsed?.title) || (text.length > 90 ? `${text.slice(0, 87)}…` : text),
      statement: safeString(parsed?.statement) || text,
      what_im_hearing: safeString(parsed?.what_im_hearing) || "",
      questions: safeArray(parsed?.questions).slice(0, 5),
    };

    return NextResponse.json({ frame: result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Frame failed." }, { status: 500 });
  }
}
