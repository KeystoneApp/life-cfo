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
 * The actual “ChatGPT readability rules” in practice:
 * - paragraphs first
 * - whitespace between thoughts
 * - short lists when listing multiple items
 * - bold key phrases
 *
 * Prompting helps, but consistency comes from a light-touch formatter below.
 */
const FORMAT_RULES = [
  "Formatting rules (follow strictly):",
  "- Output MUST be Markdown.",
  "- Do NOT use Markdown headings (NO '#', '##', '###', etc).",
  "- If you use section titles, write them as plain text on their own line (no symbols), then a blank line.",
  "- Add blank lines between paragraphs and between sections.",
  "- Use bullet lists for multiple items, BUT introduce the list with a lead-in sentence first.",
  "- Avoid bullet-only replies unless the user explicitly asks for a list.",
  "- Bold key phrases, numbers, and decisions with **bold**.",
  "- Answer the LATEST user message first. Do not repeat the full structure every turn.",
  "- Ask at most 1–2 questions at the end if needed.",
].join("\n");

const OPTIONAL_TITLES = [
  "Optional titles you MAY use (only when they add NEW value):",
  "- What I’m hearing",
  "- Key factors",
  "- Options",
  "- Suggested next step",
  "- Next question",
].join("\n");

function buildSystemPrompt(args: { decisionTitle: string; decisionStatement?: string; mode: Mode }) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone.",
      "Task: produce a calm, useful capture preview of the conversation.",
      "Rules:",
      "- Do NOT recommend a choice unless explicitly asked.",
      "- Keep it practical and scannable.",
      "",
      FORMAT_RULES,
      "",
      "Summary structure (use if helpful, but keep it short):",
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
      `Decision title: ${decisionTitle}`,
      decisionStatement ? `Decision statement: ${decisionStatement}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are Keystone — a calm, values-anchored decision partner.",
    "You help the user think clearly, without forcing a decision.",
    "Rules:",
    "- Answer the LATEST user message first (do not restate everything unless needed).",
    "- Do NOT repeat the same full template every turn.",
    "- Do NOT recommend a choice unless the user asks you to recommend.",
    "",
    FORMAT_RULES,
    "",
    OPTIONAL_TITLES,
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
 * Light-touch server-side formatter to replicate ChatGPT’s consistent readability.
 *
 * It:
 * - normalizes newlines
 * - ensures blank line after title lines (e.g. "Key factors")
 * - converts runs of "Thing: explanation" into bullets:
 *     - **Thing:** explanation
 *
 * It only kicks in when the output looks like your screenshot (colon-lines but no bullets).
 */
function formatForChatLikeReadability(raw: string) {
  let text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  // 1) Collapse excessive blank lines (keep max 2)
  text = text.replace(/\n{3,}/g, "\n\n");

  const lines = text.split("\n");

  // Helper: detect a plain title line (not a bullet, not numbered, short-ish, no trailing punctuation)
  const isTitle = (l: string) => {
    const t = l.trim();
    if (!t) return false;
    if (t.startsWith("-") || t.startsWith("*") || /^\d+\./.test(t)) return false;
    if (t.length > 40) return false;
    if (/[.!?]$/.test(t)) return false;
    // allow things like "Key factors" / "Suggested next step"
    return /^[A-Za-z0-9’'()\- ]+$/.test(t);
  };

  // 2) Ensure blank line after title lines
  const withTitleSpacing: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    withTitleSpacing.push(l);

    if (isTitle(l)) {
      const next = lines[i + 1] ?? "";
      if (next.trim() !== "") {
        // insert a blank line after title if none exists
        withTitleSpacing.push("");
      }
    }
  }

  // 3) If we have many "Key: explanation" lines and almost no bullets, bulletize those runs.
  const joined = withTitleSpacing.join("\n");
  const hasBullets = /(^|\n)\s*[-*]\s+/.test(joined);
  const colonLinesCount = withTitleSpacing.filter((l) => /^[A-Za-z][A-Za-z0-9’'()\/ \-]{1,40}:\s+\S+/.test(l.trim())).length;

  // Only transform when it's clearly "colon list but not markdown list"
  if (!hasBullets && colonLinesCount >= 3) {
    const out: string[] = [];
    for (let i = 0; i < withTitleSpacing.length; i++) {
      const l = withTitleSpacing[i];
      const t = l.trim();

      const m = t.match(/^([A-Za-z][A-Za-z0-9’'()\/ \-]{1,40}):\s+(.+)$/);
      if (m) {
        const key = m[1].trim();
        const rest = m[2].trim();

        // Ensure there's a blank line before the first bullet in a run
        const prev = out[out.length - 1] ?? "";
        if (prev.trim() !== "" && !prev.trim().startsWith("-")) {
          out.push("");
        }

        out.push(`- **${key}:** ${rest}`);
        continue;
      }

      out.push(l);
    }

    text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return text;
  }

  // 4) Otherwise return spacing-normalized version
  text = withTitleSpacing.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text;
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
      const formatted = formatForChatLikeReadability(intercept.content);
      if (mode === "summarise") return NextResponse.json({ summaryText: formatted, kind: intercept.kind });
      return NextResponse.json({ assistantText: formatted, kind: intercept.kind });
    }

    const system = buildSystemPrompt({
      decisionTitle,
      decisionStatement: decisionStatement || undefined,
      mode,
    });

    const transcript = buildTranscript(safeMessages);
    const latest = lastUserText(safeMessages);

    const userContent =
      mode === "summarise"
        ? [
            "Create a capture preview of this conversation.",
            "Keep it short, readable, and formatted with blank lines and bullets when helpful.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n")
        : [
            "Continue the conversation.",
            "Answer the LATEST user message first.",
            "Use paragraphs + whitespace. If listing multiple items, use bullets (with a lead-in sentence).",
            "",
            `LATEST USER MESSAGE:\n${latest || "(none)"}`,
            "",
            "CONVERSATION SO FAR:",
            transcript,
          ].join("\n");

    const model = process.env.OPENAI_MODEL || "gpt-4.1";

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature: mode === "summarise" ? 0.15 : 0.35,
      max_output_tokens: mode === "summarise" ? 520 : 850,
    });

    const rawText = String(resp.output_text ?? "").trim();
    if (!rawText) {
      return NextResponse.json({ error: "Empty AI response." }, { status: 502 });
    }

    const text = formatForChatLikeReadability(rawText);

    if (mode === "summarise") return NextResponse.json({ summaryText: text });
    return NextResponse.json({ assistantText: text });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
