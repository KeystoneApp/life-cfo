// app/api/ai/conversation/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

export const dynamic = "force-dynamic";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type InMsg = { role: "user" | "assistant"; content: string };
type Mode = "chat" | "summarise";

/**
 * We want ChatGPT-like readability WITHOUT forcing "### headings".
 * So: markdown, but section titles are plain lines (no #), with whitespace.
 */
const STYLE_GUIDE = [
  "Formatting rules (very important):",
  "- Write in Markdown.",
  "- DO NOT use markdown headings that start with # (no '#', '##', '###').",
  "- If you need section titles, write them as plain text lines like:",
  "  What I’m hearing",
  "  Key factors",
  "  Options",
  "  Suggested next step",
  "  Next question",
  "- Always add a blank line between sections and between paragraphs.",
  "- Default to 2–5 short paragraphs. Avoid walls of text.",
  "- Use bullet points only when they genuinely help scanning (usually 3–6 bullets max).",
  "- Use **bold** sparingly for key numbers/constraints/decisions (don’t bold whole paragraphs).",
  "- Answer the user’s latest message FIRST (directly), then add structure if helpful.",
  "- Don’t repeat the same full template every turn. Follow-ups should feel new.",
  "- Ask at most 1 question at the end (2 max only if essential).",
].join("\n");

const CHAT_BEHAVIOUR = [
  "Conversation behaviour (very important):",
  "- This is a back-and-forth. Use prior messages; do not reintroduce the whole framing each time.",
  "- If the user asks a direct question (e.g. 'can you see my accounts?'), answer it plainly in 1–2 sentences first.",
  "- If the user provides new numbers/details, reflect them briefly and move forward (don’t restart).",
  "- Only use 'Options' when there are genuinely multiple paths.",
  "- Only use 'Key factors' when the answer depends on unknowns or trade-offs.",
  "- Keep tone calm, practical, and non-salesy.",
].join("\n");

const SUMMARY_BEHAVIOUR = [
  "Summaries (capture preview) behaviour:",
  "- Output a scannable preview that could be saved to the decision.",
  "- Keep it structured, but again: NO headings with #.",
  "- Include: current leaning (if any), key constraints, key considerations, open questions, suggested next step, revisit trigger (if obvious).",
].join("\n");

function buildSystemPrompt(args: { decisionTitle: string; decisionStatement?: string; mode: Mode }) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone.",
      "Task: Create a calm, useful *capture preview* of the conversation.",
      "Rules:",
      "- Do NOT recommend a choice unless explicitly asked.",
      "- Be brief, clear, and scannable.",
      "",
      STYLE_GUIDE,
      "",
      SUMMARY_BEHAVIOUR,
      "",
      "Suggested layout (only if helpful; do not force):",
      "Snapshot",
      "",
      "Key constraints",
      "",
      "Key considerations",
      "",
      "Open questions",
      "",
      "Suggested next step",
      "",
      "Revisit trigger",
      "",
      `Decision title: ${decisionTitle}`,
      decisionStatement ? `Decision statement: ${decisionStatement}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are Keystone — a calm, values-anchored decision partner.",
    "You are helping the user think, not forcing a decision.",
    "Rules:",
    "- Do NOT recommend a choice unless the user asks you to recommend.",
    "- Do NOT pick a winner unless asked to compare with a winner.",
    "- Do NOT aggressively optimise unless asked.",
    "- Ask clarifying questions when needed instead of guessing.",
    "",
    STYLE_GUIDE,
    "",
    CHAT_BEHAVIOUR,
    "",
    `Decision title: ${decisionTitle}`,
    decisionStatement ? `Decision statement: ${decisionStatement}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTranscript(messages: InMsg[]) {
  // Simple, robust transcript
  return messages.map((m) => `${m.role === "user" ? "You" : "Keystone"}: ${m.content}`).join("\n\n");
}

function lastUserText(messages: InMsg[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      const t = m.content.trim();
      if (t) return t;
    }
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      decisionTitle?: string;
      decisionStatement?: string;
      messages?: InMsg[];
      mode?: Mode;
    };

    const decisionTitle = String(body.decisionTitle ?? "").trim();
    const decisionStatement = String(body.decisionStatement ?? "").trim();
    const mode: Mode = body.mode === "summarise" ? "summarise" : "chat";

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const safeMessages: InMsg[] = messages
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .map((m) => ({ role: m.role, content: m.content.trim() }));

    if (!decisionTitle) {
      return NextResponse.json({ error: "Missing decisionTitle." }, { status: 400 });
    }

    // 🔒 SAFETY INTERCEPT (V1 REQUIRED)
    const userText = lastUserText(safeMessages);
    const intercept = maybeCrisisIntercept(userText);
    if (intercept) {
      if (mode === "summarise") {
        return NextResponse.json({ summaryText: intercept.content, kind: intercept.kind });
      }
      return NextResponse.json({ assistantText: intercept.content, kind: intercept.kind });
    }

    const system = buildSystemPrompt({
      decisionTitle,
      decisionStatement: decisionStatement || undefined,
      mode,
    });

    const transcript = buildTranscript(safeMessages);

    const userContent =
      mode === "summarise"
        ? [
            "Create a capture preview of this conversation.",
            "Follow the formatting rules.",
            "Do not use # headings.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n")
        : [
            "Respond to the user's latest message in context.",
            "Answer first, then add light structure only if helpful.",
            "Follow the formatting rules.",
            "Do not use # headings.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n");

    const model = process.env.OPENAI_MODEL || "gpt-4.1";

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature: mode === "summarise" ? 0.2 : 0.45,
      max_output_tokens: mode === "summarise" ? 520 : 900,
    });

    const text = String(resp.output_text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "Empty AI response." }, { status: 502 });
    }

    if (mode === "summarise") {
      return NextResponse.json({ summaryText: text });
    }

    return NextResponse.json({ assistantText: text });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
