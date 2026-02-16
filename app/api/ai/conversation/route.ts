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
 * We want “ChatGPT-like readability”:
 * - Bold section titles (NO ### headings)
 * - Short paragraphs + a few bullets
 * - Options have short paragraphs (not bullet walls)
 */
const STYLE_GUIDE = [
  "Formatting rules (must follow exactly):",
  "- Write in Markdown.",
  "- Do NOT use headings with # (no '#', '##', '###').",
  "- Use bold section titles on their own line, e.g. '**What I’m hearing**'.",
  "- Each section must start with 1–2 short sentences of normal text (not bullets).",
  "- Only then (optionally) include a SHORT bullet list.",
  "- Bullet lists must be small: max 4 bullets per section.",
  "- Use blank lines between sections and between paragraphs.",
  "- Bold key phrases, numbers, and decision-relevant terms (use **bold**).",
  "- Keep sentences short. Avoid walls of text.",
  "- Ask at most 1–2 questions at the end (if needed).",
  "- For steps: use a short intro sentence then a numbered list (max 5).",
  "- For options: write Option A / Option B as bold labels with 1–3 sentences each, plus at most 2 bullets if needed.",
].join("\n");

const CHAT_TEMPLATE = [
  "Preferred structure (use when helpful):",
  "",
  "**What I’m hearing**",
  "1–2 sentences.",
  "- (optional) up to 3–4 bullets",
  "",
  "**Key factors**",
  "1–2 sentences.",
  "- up to 3–4 bullets",
  "",
  "**Options**",
  "**Option A:** 1–3 sentences. (optional) - up to 2 bullets",
  "**Option B:** 1–3 sentences. (optional) - up to 2 bullets",
  "",
  "**Suggested next step**",
  "1 sentence.",
  "1) ...",
  "2) ...",
  "",
  "**Next question**",
  "Ask 1 question (or 2 max).",
].join("\n");

const SUMMARY_TEMPLATE = [
  "When summarising as a capture preview, use this structure:",
  "",
  "**Snapshot**",
  "1–2 sentences.",
  "- **Current leaning:** ... (or **Not stated**)",
  "- **Why it matters:** ...",
  "",
  "**Key constraints**",
  "1 sentence.",
  "- up to 3–4 bullets",
  "",
  "**Key considerations**",
  "1 sentence.",
  "- up to 3–4 bullets",
  "",
  "**Open questions**",
  "1 sentence.",
  "- up to 3 bullets",
  "",
  "**Suggested next step**",
  "1 sentence.",
  "1) ...",
  "2) ...",
  "",
  "**Next question**",
  "Ask 1 question (or 2 max).",
].join("\n");

function buildSystemPrompt(args: { decisionTitle: string; decisionStatement?: string; mode: Mode }) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone.",
      "Task: Create a calm, useful *capture preview* of the conversation.",
      "Rules:",
      "- Do NOT recommend a choice unless explicitly asked.",
      "- Keep it short, human, and easy to read.",
      "- Use short paragraphs + a few bullets. No bullet walls.",
      "- Include: current leaning (if any), key constraints, open questions, suggested next step.",
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
    "- Do NOT pick a winner unless asked.",
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

/**
 * Lightweight “make it look like ChatGPT” normalizer:
 * - enforce bold section titles for common titles
 * - convert • bullets to -
 * - add blank lines between detected sections
 */
function normalizeMarkdownOut(raw: string) {
  let t = (raw || "").replace(/\r\n/g, "\n").trim();

  // Convert bullet dot to markdown dash
  t = t.replace(/^\s*•\s+/gm, "- ");

  const titles = [
    "What I’m hearing",
    "What I'm hearing",
    "Key factors",
    "Options",
    "Suggested next step",
    "Next question",
    "Snapshot",
    "Key constraints",
    "Key considerations",
    "Open questions",
  ];

  // Bold standalone title lines (optionally ending with :)
  for (const title of titles) {
    const re = new RegExp(`^\\s*${escapeRegExp(title)}\\s*:?\\s*$`, "gmi");
    t = t.replace(re, `**${title.replace("I'm", "I’m")}**`);
  }

  // Ensure blank line before bold titles (except at very top)
  t = t.replace(/\n(\*\*[^*\n]+\*\*)/g, "\n\n$1");

  // Avoid triple+ blank lines
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
            "Create a capture preview from the conversation.",
            "Follow the formatting rules and template exactly.",
            "Remember: short paragraphs first, then small bullets.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n")
        : [
            "Continue the conversation.",
            "Follow the formatting rules and template exactly.",
            "Remember: short paragraphs first, then small bullets.",
            "Ask at most 1–2 questions at the end if needed.",
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
      max_output_tokens: mode === "summarise" ? 560 : 950,
    });

    const textRaw = String(resp.output_text ?? "").trim();

    if (!textRaw) {
      return NextResponse.json({ error: "Empty AI response." }, { status: 502 });
    }

    const text = normalizeMarkdownOut(textRaw);

    if (mode === "summarise") {
      return NextResponse.json({ summaryText: text });
    }

    return NextResponse.json({ assistantText: text });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
