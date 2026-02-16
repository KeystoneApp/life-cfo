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

const STYLE_GUIDE = [
  "Formatting rules (very important):",
  "- Write in Markdown.",
  "- Use short sections with headings using '###'.",
  "- Prefer bullet points for lists.",
  "- Add blank lines between paragraphs.",
  "- Bold key phrases, numbers, and decisions (use **bold**).",
  "- Keep sentences short and scannable.",
  "- Avoid walls of text. Aim for calm whitespace.",
  "- Ask at most 1–2 questions at a time.",
  "- If you provide steps, use numbered lists.",
  "- If you provide options, present as 'Option A / Option B' with trade-offs.",
].join("\n");

const CHAT_TEMPLATE = [
  "When helpful, use this structure:",
  "",
  "### What I’m hearing",
  "- ...",
  "",
  "### Key factors",
  "- ...",
  "",
  "### Options",
  "- **Option A:** ...",
  "- **Option B:** ...",
  "",
  "### Suggested next step",
  "- ...",
  "",
  "### Next question (pick one)",
  "- ...",
].join("\n");

const SUMMARY_TEMPLATE = [
  "When summarising, use this structure:",
  "",
  "### Snapshot",
  "- **Current leaning:** ... (or 'Not stated')",
  "- **Why it matters:** ...",
  "",
  "### Key constraints",
  "- ...",
  "",
  "### Key considerations",
  "- ...",
  "",
  "### Open questions",
  "- ...",
  "",
  "### Suggested next step",
  "- ...",
].join("\n");

function buildSystemPrompt(args: { decisionTitle: string; decisionStatement?: string; mode: Mode }) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone.",
      "Task: Summarise the user's conversation about a decision into a calm, useful preview.",
      "Rules:",
      "- Do NOT recommend a choice unless explicitly asked.",
      "- Keep it short and scannable.",
      "- Include: current leaning (if any), key constraints, open questions, next steps.",
      "- If unclear, ask 1–2 clarifying questions at the end.",
      "",
      STYLE_GUIDE,
      "",
      "Template:",
      SUMMARY_TEMPLATE,
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
    "- Do NOT simulate irreversible outcomes unless asked.",
    "- Do NOT aggressively optimise unless asked.",
    "- Keep tone grounded, gentle, and practical.",
    "- Ask clarifying questions when needed instead of guessing.",
    "",
    STYLE_GUIDE,
    "",
    "Template:",
    CHAT_TEMPLATE,
    "",
    `Decision title: ${decisionTitle}`,
    decisionStatement ? `Decision statement: ${decisionStatement}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTranscript(messages: InMsg[]) {
  // Simple, robust transcript for both modes.
  // Avoids content-block typing + avoids input_text/output_text mismatch.
  return messages
    .map((m) => `${m.role === "user" ? "You" : "Keystone"}: ${m.content}`)
    .join("\n\n");
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
            "Summarise this conversation as a capture preview.",
            "Follow the formatting rules and template.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n")
        : [
            "Continue the conversation.",
            "Follow the formatting rules and template.",
            "Keep it calm and scannable.",
            "Ask at most 1–2 questions at the end if needed.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n");

    // Keep your env override; default matches your current setup.
    const model = process.env.OPENAI_MODEL || "gpt-4.1";

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature: mode === "summarise" ? 0.2 : 0.5,
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
