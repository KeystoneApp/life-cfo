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
 * We want ChatGPT-like readability:
 * - markdown headings + bullets
 * - whitespace
 * - bold key phrases
 * We must REQUIRE markdown output (not just suggest it),
 * otherwise the model will often respond in plain prose.
 */
const OUTPUT_CONTRACT = [
  "OUTPUT CONTRACT (must follow):",
  "1) Output MUST be valid Markdown.",
  "2) Use headings with '### ' exactly (NOT plain text headings).",
  "3) Use bullet points with '- ' for lists (NOT plain sentences).",
  "4) Add blank lines between sections.",
  "5) Bold key phrases and numbers using **bold**.",
  "6) Ask at most 1–2 questions at the end under '### Next question'.",
  "7) Do NOT include any meta commentary about these rules.",
  "8) Do NOT wrap the entire answer in a code block.",
].join("\n");

const CHAT_TEMPLATE = [
  "TEMPLATE (use exactly these headings):",
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
  "### Next question",
  "- ... (ask 1–2 max)",
].join("\n");

const SUMMARY_TEMPLATE = [
  "TEMPLATE (use exactly these headings):",
  "",
  "### Snapshot",
  "- **Current leaning:** ... (or **Not stated**)",
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
  "",
  "### Next question",
  "- ... (ask 1–2 max, only if needed)",
].join("\n");

function buildSystemPrompt(args: { decisionTitle: string; decisionStatement?: string; mode: Mode }) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone.",
      "Task: produce a calm, scannable capture preview of the conversation.",
      "Rules:",
      "- Do NOT recommend a choice unless explicitly asked.",
      "- Keep it short and useful.",
      "- Include: current leaning (if any), constraints, open questions, next steps.",
      "",
      OUTPUT_CONTRACT,
      "",
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
    "- Ask clarifying questions when needed instead of guessing.",
    "- Keep tone grounded, gentle, practical.",
    "",
    OUTPUT_CONTRACT,
    "",
    CHAT_TEMPLATE,
    "",
    `Decision title: ${decisionTitle}`,
    decisionStatement ? `Decision statement: ${decisionStatement}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTranscript(messages: InMsg[]) {
  // Keep transcript simple + robust.
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

// If the model still tries to output plain headings, this nudges it hard.
function buildUserInstruction(mode: Mode, transcript: string) {
  if (mode === "summarise") {
    return [
      "Create a capture preview from the conversation below.",
      "IMPORTANT: Follow the OUTPUT CONTRACT and TEMPLATE exactly.",
      "Headings must begin with '### '. Lists must use '- '.",
      "",
      "CONVERSATION:",
      transcript,
    ].join("\n");
  }

  return [
    "Continue the conversation below.",
    "IMPORTANT: Follow the OUTPUT CONTRACT and TEMPLATE exactly.",
    "Headings must begin with '### '. Lists must use '- '.",
    "Keep it calm and scannable.",
    "Ask 1–2 questions max under '### Next question'.",
    "",
    "CONVERSATION:",
    transcript,
  ].join("\n");
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
      if (mode === "summarise") return NextResponse.json({ summaryText: intercept.content, kind: intercept.kind });
      return NextResponse.json({ assistantText: intercept.content, kind: intercept.kind });
    }

    const system = buildSystemPrompt({
      decisionTitle,
      decisionStatement: decisionStatement || undefined,
      mode,
    });

    const transcript = buildTranscript(safeMessages);
    const userContent = buildUserInstruction(mode, transcript);

    const model = process.env.OPENAI_MODEL || "gpt-4.1";

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      // Lower temp makes formatting + template adherence more reliable
      temperature: mode === "summarise" ? 0.15 : 0.35,
      max_output_tokens: mode === "summarise" ? 520 : 900,
    });

    const text = String(resp.output_text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "Empty AI response." }, { status: 502 });
    }

    if (mode === "summarise") return NextResponse.json({ summaryText: text });
    return NextResponse.json({ assistantText: text });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
