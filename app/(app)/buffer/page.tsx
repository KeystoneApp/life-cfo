"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | { status: "done"; question: string; answer: string }
  | { status: "error"; question: string; message: string };

function fmtAud(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

export const dynamic = "force-dynamic";

export default function BufferPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [targetCents, setTargetCents] = useState<number | null>(null);
  const [note, setNote] = useState<string>("");

  const [inputTarget, setInputTarget] = useState<string>(""); // dollars
  const [saving, setSaving] = useState(false);

  const [ask, setAsk] = useState<AskState>({ status: "idle" });
  const [askText, setAskText] = useState("");
  const answerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(data?.user?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function load(u: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from("money_buffer")
      .select("target_cents,note")
      .eq("user_id", u)
      .maybeSingle();

    if (error) {
      setTargetCents(null);
      setNote("");
      setInputTarget("");
      setLoading(false);
      return;
    }

    const t = typeof data?.target_cents === "number" ? data.target_cents : null;
    const n = typeof data?.note === "string" ? data.note : "";
    setTargetCents(t);
    setNote(n);
    setInputTarget(t != null ? String(Math.round(t / 100)) : "");
    setLoading(false);
  }

  useEffect(() => {
    if (!userId) return;
    void load(userId);
  }, [userId]);

  async function save() {
    if (!userId) return;

    const dollarsRaw = inputTarget.trim();
    if (!dollarsRaw) {
      toast({ title: "Target needed", description: "Type a buffer target (e.g., 2000)." });
      return;
    }

    const dollars = Number(dollarsRaw);
    if (!Number.isFinite(dollars) || dollars < 0) {
      toast({ title: "Target looks off", description: "Use a positive number like 2000." });
      return;
    }

    const cents = Math.round(dollars * 100);

    setSaving(true);
    try {
      const { error } = await supabase.from("money_buffer").upsert(
        {
          user_id: userId,
          target_cents: cents,
          note: note.trim() || null,
        },
        { onConflict: "user_id" }
      );

      if (error) {
        toast({ title: "Couldn’t save", description: error.message });
        return;
      }

      toast({ title: "Saved", description: "Buffer updated." });
      await load(userId);
    } finally {
      setSaving(false);
    }
  }

  async function submitAsk() {
    const q = askText.trim();
    if (!q || !userId) return;

    setAskText("");
    setAsk({ status: "loading", question: q });

    const intercept = maybeCrisisIntercept(q);
    if (intercept) {
      setAsk({ status: "done", question: q, answer: intercept.content });
      return;
    }

    try {
      const res = await fetch("/api/home/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, question: q, scope: "buffer" }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAsk({ status: "error", question: q, message: "I couldn’t answer that right now." });
        return;
      }

      setAsk({
        status: "done",
        question: q,
        answer: typeof (json as any)?.answer === "string" ? (json as any).answer : "",
      });

      window.setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
    } catch {
      setAsk({ status: "error", question: q, message: "I couldn’t answer that right now." });
    }
  }

  const targetAud = targetCents != null ? targetCents / 100 : null;

  return (
    <Page title="Buffer" subtitle="A small decision that removes a lot of stress.">
      <div className="mx-auto max-w-[760px] space-y-6">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-zinc-900">Your buffer target</div>
                <div className="text-xs text-zinc-500">This is the “don’t touch” cushion for calm months.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip className="text-xs" onClick={() => router.push("/money")}>Back to Money</Chip>
              </div>
            </div>

            {loading ? (
              <div className="mt-4 text-sm text-zinc-600">Loading…</div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="text-xs font-medium text-zinc-700">Current target</div>
                  <div className="mt-1 text-lg font-medium text-zinc-900">{fmtAud(targetAud)}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    If you’re unsure: start with 1–2 weeks of essentials, then adjust later.
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="space-y-1">
                    <div className="text-xs text-zinc-600">Target (AUD)</div>
                    <input
                      value={inputTarget}
                      onChange={(e) => setInputTarget(e.target.value)}
                      inputMode="numeric"
                      placeholder="2000"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="text-xs text-zinc-600">Note (optional)</div>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="E.g., ‘minimum to feel calm’"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void save()} disabled={saving} className="rounded-2xl">
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Chip className="text-xs" onClick={() => userId && load(userId)} disabled={saving}>
                    Refresh
                  </Chip>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <textarea
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder="Ask about buffer…"
              className="w-full min-h-[110px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitAsk();
                }
              }}
            />

            <div className="mt-2 flex justify-between text-xs text-zinc-500">
              <span>Questions stay scoped to buffer.</span>
              {ask.status === "loading" ? <span>Thinking…</span> : null}
            </div>

            <div className="mt-3 flex gap-2">
              <Button onClick={() => void submitAsk()} disabled={!askText.trim() || ask.status === "loading"}>
                Get answer
              </Button>
              <Chip className="text-xs" onClick={() => setAskText("")} disabled={!askText.trim()}>
                Clear
              </Chip>
            </div>
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
                    <div className="text-sm text-zinc-700">{ask.message}</div>
                    <div className="flex flex-wrap gap-2">
                      <Chip className="text-xs" onClick={() => setAsk({ status: "idle" })}>Done</Chip>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-500">Question</div>
                    <div className="text-sm text-zinc-900">{ask.question}</div>
                    <div className="pt-2 text-[15px] leading-relaxed text-zinc-800 whitespace-pre-wrap">{ask.answer}</div>
                    <div className="pt-3 flex flex-wrap gap-2">
                      <Chip className="text-xs" onClick={() => setAsk({ status: "idle" })}>Done</Chip>
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
