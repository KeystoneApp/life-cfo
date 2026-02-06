// app/(app)/lifecfo-home/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { useHomeUnload } from "@/lib/home/useHomeUnload";
import { useRouter } from "next/navigation";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

export const dynamic = "force-dynamic";

/* ---------- helpers ---------- */

function firstNameOf(full: string) {
  const s = (full || "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0] || "";
}

function isYesish(s: string) {
  const t = s.trim().toLowerCase();
  return ["y", "yes", "yep", "yeah", "sure", "ok", "okay"].includes(t);
}

/**
 * Life CFO intent rules (V1.5)
 * Default → ASK (unless clearly "hold")
 */
function inferIntent(raw: string): "ask" | "hold" {
  const s = raw.trim();
  if (!s) return "hold";
  const lower = s.toLowerCase();

  // Explicit question cues → ASK
  if (s.includes("?")) return "ask";
  if (/^(what|when|why|how|can|should|do i|did i|am i|are we|are you)\b/i.test(lower)) return "ask";

  // Help-request cues (even without "?") → ASK
  if (/\b(help me|help us|we need to know|i need to know|best way|what should we do|how should we|can you help)\b/i.test(lower)) return "ask";

  // Strong “hold/capture” cues → HOLD
  if (/^(remember|note|save|hold|capture|remind me)\b/i.test(lower)) return "hold";

  // Emotional unloading (no help cues) → HOLD
  if (/^(i feel|i’m feeling|im feeling)\b/i.test(lower) && !/\b(help|how|what|should|can)\b/i.test(lower)) return "hold";

  // Default → ASK
  return "ask";
}

type CaptureSeed = {
  title: string;
  prompt: string;
  notes: string[];
};

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | {
      status: "done";
      question: string;
      answer: string;
      actionHref?: string | null;
      suggestedNext?: "none" | "create_capture";
      captureSeed?: CaptureSeed | null;
    }
  | { status: "error"; question: string; message: string };

export default function LifeCFOHomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [preferredName, setPreferredName] = useState("");

  const [text, setText] = useState("");
  const [affirmation, setAffirmation] = useState<"Saved." | "Held." | null>(null);
  const [ask, setAsk] = useState<AskState>({ status: "idle" });

  /** 🔑 staged hold (NOT saved yet) */
  const [stagedHold, setStagedHold] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  /**
   * ✅ Keep hook stable (can’t call conditionally).
   * We only *use* unload.submit when authStatus==="signed_in" AND userId exists.
   */
  const unload = useHomeUnload({ userId: userId ?? "" });

  /* ---------- auth ---------- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user) {
        setUserId(null);
        setAuthStatus("signed_out");
        return;
      }

      setUserId(data.user.id);
      setAuthStatus("signed_in");
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    let alive = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("fine_print_signed_name").eq("user_id", userId).maybeSingle();
      if (!alive) return;

      const full = typeof data?.fine_print_signed_name === "string" ? data.fine_print_signed_name : "";
      setPreferredName(firstNameOf(full));
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  const flash = (v: "Saved." | "Held.") => {
    setAffirmation(v);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setAffirmation(null), 1200);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, []);

  const focusInput = () => window.setTimeout(() => inputRef.current?.focus(), 0);
  const scrollToAnswer = () => window.setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);

  /* ---------- ask ---------- */

  const askHome = async (question: string) => {
    if (!userId) return;

    setAsk({ status: "loading", question });

    try {
      const res = await fetch("/api/home/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, question }),
      });

      const json = await res.json();

      if (!res.ok) {
        setAsk({ status: "error", question, message: "I couldn’t answer that right now." });
        scrollToAnswer();
        return;
      }

      const answer = typeof json?.answer === "string" ? json.answer : "";

      const actionHref =
        json?.action === "open_money"
          ? "/money"
          : json?.action === "open_bills"
          ? "/bills"
          : json?.action === "open_decisions"
          ? "/decisions"
          : json?.action === "open_review"
          ? "/revisit"
          : json?.action === "open_chapters"
          ? "/chapters"
          : null;

      setAsk({
        status: "done",
        question,
        answer,
        actionHref,
      });

      scrollToAnswer();
    } catch {
      setAsk({ status: "error", question, message: "I couldn’t answer that right now." });
      scrollToAnswer();
    }
  };

  /* ---------- submit ---------- */

  const submit = async () => {
    const msg = text.trim();
    if (!msg) return;

    setText("");
    focusInput();

    // new input cancels any staged hold UI
    setStagedHold(null);

    if (authStatus !== "signed_in" || !userId) {
      flash("Held.");
      return;
    }

    // Crisis intercept (no save, no AI)
    const intercept = maybeCrisisIntercept(msg);
    if (intercept) {
      flash("Held.");
      setAsk({ status: "done", question: msg, answer: intercept.content });
      scrollToAnswer();
      return;
    }

    // “yes” follow-up after an answer
    if (isYesish(msg) && ask.status === "done") {
      flash("Held.");
      await askHome(`${ask.question}\n\nUser follow-up: yes.`);
      return;
    }

    const intent = inferIntent(msg);

    if (intent === "ask") {
      flash("Held.");
      await askHome(msg);
      return;
    }

    /**
     * 🔒 HOLD = stage only (NOT saved yet)
     * We still show a small “Saved.” toast because it’s familiar,
     * but the inline card makes it explicit that nothing was saved.
     */
    flash("Saved.");
    setAsk({ status: "idle" });
    setStagedHold(msg);
  };

  /* ---------- inline staged card ---------- */

  const stagedInline = useMemo(() => {
    if (!stagedHold) return null;

    return (
      <div className="mt-2 rounded-2xl border border-zinc-200 bg-white p-3">
        <div className="text-xs font-semibold text-zinc-900">Held safely</div>
        <div className="mt-1 text-xs text-zinc-700">Nothing has been saved yet.</div>

        <div className="mt-2 flex flex-wrap gap-2">
          <Chip
            className="text-xs"
            title="Save to Capture"
            onClick={async () => {
              if (!userId) return;

              try {
                await unload.submit(stagedHold);
              } catch {
                // Don’t throw UI errors here; keep calm.
                return;
              }

              setStagedHold(null);
              router.push("/capture");
            }}
          >
            Save to Capture <span className="ml-1 opacity-70">→</span>
          </Chip>

          <Chip className="text-xs" title="Discard" onClick={() => setStagedHold(null)}>
            Discard
          </Chip>
        </div>
      </div>
    );
  }, [stagedHold, unload, router, userId]);

  /* ---------- render ---------- */

  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;

  return (
    <Page title="Home" subtitle={subtitle}>
      <div className="mx-auto max-w-[760px] space-y-6">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Life CFO</div>

              {authStatus === "signed_out" ? (
                <div className="text-sm text-zinc-700">Sign in to use Home.</div>
              ) : (
                <div className="text-sm text-zinc-700">You don’t need to do anything right now.</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What’s on your mind?"
              className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-200"
              disabled={authStatus !== "signed_in"}
              onKeyDown={(e) => {
                const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                if (cmdOrCtrl && e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                  return;
                }

                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />

            <div className="mt-2 flex justify-between text-xs text-zinc-500">
              <span>Ask a question or put something down.</span>
              {affirmation ? <span aria-live="polite">{affirmation}</span> : <span className="h-4" aria-hidden="true" />}
            </div>

            {stagedInline}
          </CardContent>
        </Card>

        {ask.status !== "idle" ? (
          <div ref={answerRef}>
            <Card className="border-zinc-200 bg-white">
              <CardContent>
                {ask.status === "loading" ? (
                  <div className="text-sm text-zinc-700">Thinking…</div>
                ) : ask.status === "error" ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-zinc-900">Life CFO</div>
                    <div className="text-sm text-zinc-700">{ask.message}</div>
                    <div className="text-xs text-zinc-500">
                      <span className="font-medium text-zinc-600">You asked:</span> {ask.question}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip className="text-xs" title="Try again" onClick={() => focusInput()}>
                        Try again
                      </Chip>
                      <Chip className="text-xs" title="Done" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                    </div>
                  </div>
                ) : (
                  // ask.status === "done"
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-zinc-900">Life CFO</div>
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{ask.answer}</div>
                    <div className="text-xs text-zinc-500">
                      <span className="font-medium text-zinc-600">You asked:</span> {ask.question}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {ask.actionHref ? (
                        <Chip className="text-xs" title="Open" onClick={() => router.push(ask.actionHref!)}>
                          Open
                        </Chip>
                      ) : null}

                      <Chip className="text-xs" title="Ask follow-up" onClick={() => focusInput()}>
                        Ask follow-up
                      </Chip>

                      <Chip className="text-xs" title="Done" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
