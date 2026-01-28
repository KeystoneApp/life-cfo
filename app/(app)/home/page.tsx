// app/(app)/home/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { useHomeUnload } from "@/lib/home/useHomeUnload";
import { useHomeOrientation } from "@/lib/home/useHomeOrientation";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

function firstNameOf(full: string) {
  const s = (full || "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0] || "";
}

function safeMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function money(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  // expected_amount is numeric (likely dollars)
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "AUD" }).format(n);
}

type BillRow = {
  id: string;
  user_id: string;
  merchant_key: string;
  nickname: string | null;
  due_day_or_date: string; // text
  expected_amount: number | null; // numeric
  status: string | null; // 'active' default
  created_at: string | null;
  updated_at: string | null;
};

type ParsedDue =
  | { kind: "date"; date: Date; label: string }
  | { kind: "day"; day: number; label: string }
  | { kind: "unknown"; label: string };

function parseDue(due_day_or_date: string): ParsedDue {
  const raw = (due_day_or_date || "").trim();
  if (!raw) return { kind: "unknown", label: "Due date not set" };

  // ISO date e.g. 2026-01-15
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const ms = Date.parse(`${raw}T12:00:00`);
    if (!Number.isNaN(ms)) {
      const dt = new Date(ms);
      return { kind: "date", date: dt, label: dt.toLocaleDateString() };
    }
  }

  // Day-of-month: allow "15", "15th", "15th of month", etc.
  const dayMatch = raw.match(/(\d{1,2})/);
  if (dayMatch) {
    const day = Number(dayMatch[1]);
    if (day >= 1 && day <= 31) {
      return { kind: "day", day, label: `Day ${day}` };
    }
  }

  // Fallback: show raw
  return { kind: "unknown", label: raw };
}

function isBillsQuestion(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return false;

  const hasBillsWord = s.includes("bill") || s.includes("bills");
  const hasMonthCue =
    s.includes("this month") ||
    s.includes("month") ||
    s.includes("due") ||
    s.includes("upcoming") ||
    s.includes("coming up");

  return hasBillsWord && hasMonthCue;
}

export default function HomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [preferredName, setPreferredName] = useState<string>("");

  const [text, setText] = useState("");
  const [affirmation, setAffirmation] = useState<"Saved." | "Held." | null>(null);

  // Inline “answer” for Home questions
  const [answerStatus, setAnswerStatus] = useState<string>("");
  const [answerText, setAnswerText] = useState<string>("");
  const [lastQuestion, setLastQuestion] = useState<string>("");

  const affirmationTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // --- Auth (quiet) ---
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data?.user) {
        setUserId(null);
        setAuthStatus("signed_out");
        return;
      }

      setUserId(data.user.id);
      setAuthStatus("signed_in");
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // --- Load name (from Fine Print signature) ---
  useEffect(() => {
    if (!userId) {
      setPreferredName("");
      return;
    }

    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("fine_print_signed_name")
        .eq("user_id", userId)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setPreferredName("");
        return;
      }

      const full = typeof data?.fine_print_signed_name === "string" ? data.fine_print_signed_name : "";
      setPreferredName(firstNameOf(full));
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  // --- Hooks (contracts) ---
  const unload = useHomeUnload({ userId });
  const orientation = useHomeOrientation({ userId });

  // --- Helpers ---
  const flashAffirmation = (v: "Saved." | "Held.") => {
    setAffirmation(v);
    if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
    affirmationTimerRef.current = window.setTimeout(() => setAffirmation(null), 1300);
  };

  useEffect(() => {
    return () => {
      if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
      affirmationTimerRef.current = null;
    };
  }, []);

  const openHref = (href?: string | null) => {
    if (!href) return;
    router.push(href);
  };

  const answerBillsThisMonth = async (uid: string) => {
    setAnswerText("");
    setAnswerStatus("Checking bills…");

    const { data, error } = await supabase
      .from("bills")
      .select("id,user_id,merchant_key,nickname,due_day_or_date,expected_amount,status,created_at,updated_at")
      .eq("user_id", uid)
      .eq("status", "active");

    if (error) {
      setAnswerStatus("");
      setAnswerText("I couldn’t load bills right now.");
      return;
    }

    const rows = (data ?? []) as BillRow[];
    if (rows.length === 0) {
      setAnswerStatus("");
      setAnswerText("I can’t see any active bills yet.");
      return;
    }

    const now = new Date();
    const thisMonth = monthKey(now);
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-based

    const enriched = rows
      .map((b) => {
        const parsed = parseDue(b.due_day_or_date);
        let sortKey = 9999;
        let dueLabel = parsed.label;

        if (parsed.kind === "date") {
          const mk = monthKey(parsed.date);
          // If it's a specific date NOT in this month, we still list it but push it down.
          sortKey = mk === thisMonth ? parsed.date.getDate() : 200 + parsed.date.getDate();
          dueLabel = parsed.date.toLocaleDateString();
        } else if (parsed.kind === "day") {
          sortKey = parsed.day;
          // show as a real date within this month
          const dt = new Date(year, month, parsed.day, 12, 0, 0, 0);
          dueLabel = dt.toLocaleDateString();
        }

        return {
          bill: b,
          parsed,
          sortKey,
          dueLabel,
        };
      })
      .sort((a, b) => a.sortKey - b.sortKey);

    // Build output lines
    const lines = enriched.map(({ bill, dueLabel }) => {
      const name = bill.nickname?.trim() ? bill.nickname.trim() : bill.merchant_key;
      const amt = bill.expected_amount != null ? money(Number(bill.expected_amount)) : null;
      return `• ${name} — ${dueLabel}${amt ? ` — ${amt}` : ""}`;
    });

    // Totals (optional)
    const total = enriched.reduce((sum, x) => {
      const n = x.bill.expected_amount;
      if (typeof n !== "number" || !Number.isFinite(n)) return sum;
      return sum + n;
    }, 0);

    setAnswerStatus("");
    setAnswerText(
      `${lines.join("\n")}\n\nEstimated total: ${money(total) ?? "—"}`
    );
  };

  const answerHomeQuestion = async (uid: string, qRaw: string) => {
    const q = qRaw.trim();
    setLastQuestion(q);
    setAnswerText("");
    setAnswerStatus("Checking…");

    if (isBillsQuestion(q)) {
      await answerBillsThisMonth(uid);
      return;
    }

    setAnswerStatus("");
    setAnswerText("I can’t answer that yet here — but it’s been held.");
  };

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;

    // Clear old answer display whenever a new message is sent
    setAnswerStatus("");
    setAnswerText("");
    setLastQuestion("");

    const msg = raw;

    setText("");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    if (authStatus !== "signed_in" || !userId) {
      flashAffirmation("Held.");
      return;
    }

    const looksLikeQuestion = msg.endsWith("?") || isBillsQuestion(msg);

    if (looksLikeQuestion) {
      flashAffirmation("Held.");
      await answerHomeQuestion(userId, msg);
      return;
    }

    flashAffirmation("Saved.");
    await unload.submit(msg);
  };

  const showExamples = text.trim().length === 0;
  const canSend = authStatus === "signed_in" && text.trim().length > 0;
  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;

  return (
    <Page title="Home" subtitle={subtitle} right={<div className="flex items-center gap-2"></div>}>
      <div className="mx-auto w-full max-w-[680px] space-y-6">
        {/* Unload / Ask (primary) */}
        <div className="space-y-3">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What’s on your mind?"
              className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-14 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                // Cmd/Ctrl + Enter sends
                if (cmdOrCtrl && e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                  return;
                }

                // Enter sends (Shift+Enter makes a newline)
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              aria-label="What’s on your mind?"
              disabled={authStatus !== "signed_in"}
            />

            {canSend ? (
              <button
                type="button"
                onClick={() => void submit()}
                className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                aria-label="Send"
                title="Send (Enter)"
              >
                →
              </button>
            ) : null}
          </div>

          <div className="text-xs text-zinc-600">Unload it here. Ask if you want help.</div>

          {showExamples ? (
            <div className="text-xs text-zinc-500 space-y-1">
              <div>• “Can we afford this right now?”</div>
              <div>• “What bills do I have this month?”</div>
              <div>• “I feel unsure about a money decision.”</div>
            </div>
          ) : null}

          {affirmation ? (
            <div className="text-sm text-zinc-600" aria-live="polite">
              {affirmation}
            </div>
          ) : (
            <div className="h-5" aria-hidden="true" />
          )}

          {/* Inline answer card (bills questions) */}
          {answerStatus || answerText ? (
            <Card className="border-zinc-200 bg-white">
              <CardContent>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-600">Answer</div>
                  {answerStatus ? <div className="text-xs text-zinc-500">{answerStatus}</div> : null}
                  {answerText ? <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{answerText}</div> : null}

                  {lastQuestion && isBillsQuestion(lastQuestion) ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Chip onClick={() => router.push("/bills")} title="Open Bills">
                        Open Bills
                      </Chip>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Existing unload response (if your hook provides one) */}
          {unload.response ? <div className="text-[15px] leading-relaxed text-zinc-800">{unload.response}</div> : null}

          {authStatus === "signed_out" ? <div className="text-sm text-zinc-600">Sign in to use Home.</div> : null}
        </div>

        {/* Notes from Keystone */}
        {orientation.items.length > 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="text-xs font-medium text-zinc-600">Notes from Keystone</div>

              <div className="mt-2 space-y-3">
                {orientation.items.slice(0, 3).map((n, idx) => (
                  <div key={`${idx}-${n.href}-${n.text}`} className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => openHref(n.href)}
                      className="min-w-0 flex-1 text-left text-[15px] leading-relaxed text-zinc-800 hover:underline underline-offset-4"
                      title="Open"
                    >
                      {n.text}
                    </button>

                    <div className="shrink-0">
                      <Chip onClick={() => openHref(n.href)} title="Open">
                        Open
                      </Chip>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Page>
  );
}
