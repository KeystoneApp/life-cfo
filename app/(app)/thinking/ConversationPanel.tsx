"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, Chip } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string; at: string };

type Frame = {
  decision_statement?: string;
};

type SummaryPreview = {
  summary_bullets: string[];
  preferences_learned: string[];
  constraints_added: string[];
  unknowns_resolved: string[];
  open_questions: string[];
  next_helpful_step: string;
};

export function ConversationPanel(props: {
  decisionId: string;
  decisionTitle: string;
  frame?: Frame | null;
  onClose: () => void;
}) {
  const { decisionId, decisionTitle, frame, onClose } = props;

  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [summarising, setSummarising] = useState<boolean>(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState<string>("");

  const [summary, setSummary] = useState<SummaryPreview | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<string>("");

  const endRef = useRef<HTMLDivElement | null>(null);

  const decisionStatement = useMemo(() => frame?.decision_statement ?? "", [frame]);

  // Load auth + conversation
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        setStatus("Not signed in.");
        setLoading(false);
        return;
      }

      setUserId(auth.user.id);

      const { data, error } = await supabase
        .from("decision_conversations")
        .select("messages")
        .eq("user_id", auth.user.id)
        .eq("decision_id", decisionId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setStatus(`Couldn’t load conversation: ${error.message}`);
        setMessages([]);
        setLoading(false);
        return;
      }

      const raw = (data?.messages ?? []) as any[];
      const safe: Msg[] = Array.isArray(raw)
        ? raw
            .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
            .map((m) => ({
  role: m.role === "user" ? ("user" as const) : ("assistant" as const),
  content: m.content,
  at: m.at ?? new Date().toISOString(),
}))
        : [];

      setMessages(safe);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [decisionId]);

  // Autoscroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const persist = async (next: Msg[]) => {
    if (!userId) return;
    const { error } = await supabase.from("decision_conversations").upsert(
      {
        user_id: userId,
        decision_id: decisionId,
        messages: next,
      },
      { onConflict: "user_id,decision_id" }
    );

    if (error) setStatus(`Save failed: ${error.message}`);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    if (sending) return;

    setSending(true);

    const now = new Date().toISOString();
    const next: Msg[] = [...messages, { role: "user" as const, content: text, at: now }];
    setDraft("");
    setMessages(next);
    setStatus("");
    void persist(next);

    // Sending new content should “invalidate” any prior summary preview
    setSummary(null);
    setSummaryStatus("");

    try {
      setStatus("Thinking…");

      const res = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          decisionTitle,
          decisionStatement,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(json?.error ? String(json.error) : "AI request failed.");
        return;
      }

      const assistantText = String(json?.assistantText ?? "").trim();
      if (!assistantText) {
        setStatus("No response.");
        return;
      }

      const after: Msg[] = [
  ...next,
  { role: "assistant" as const, content: assistantText, at: new Date().toISOString() },
];
      setMessages(after);
      setStatus("");
      void persist(after);
    } catch (e: any) {
      setStatus(e?.message ?? "AI request failed.");
    } finally {
      setSending(false);
    }
  };

  const summariseChat = async () => {
    if (summarising) return;

    if (messages.length === 0) {
      setSummary(null);
      setSummaryStatus("Nothing to summarise yet.");
      return;
    }

    setSummarising(true);
    setSummary(null);
    setSummaryStatus("Summarising…");

    try {
      const res = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summarise",
          decisionTitle,
          decisionStatement,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // If server returned raw fallback, show a gentle error
        setSummaryStatus(json?.error ? String(json.error) : "Summary failed.");
        return;
      }

      const s = json?.summary as SummaryPreview | undefined;
      if (!s) {
        setSummaryStatus("No summary returned.");
        return;
      }

      setSummary(s);
      setSummaryStatus("");
    } catch (e: any) {
      setSummaryStatus(e?.message ?? "Summary failed.");
    } finally {
      setSummarising(false);
    }
  };

  const renderList = (label: string, items: string[]) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="space-y-1">
        <div className="text-xs font-semibold text-zinc-700">{label}</div>
        <ul className="list-disc pl-5 space-y-1">
          {items.map((t, i) => (
            <li key={i} className="text-sm text-zinc-700">
              {t}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-900">Conversation</div>
            <div className="mt-0.5 text-xs text-zinc-500 truncate">Anchored to: {decisionTitle}</div>
          </div>
          <div className="flex items-center gap-2">
            <Chip onClick={onClose} title="Close conversation">
              Done
            </Chip>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-zinc-200 bg-white">
          <div className="max-h-[320px] overflow-auto p-3 space-y-3">
            {loading ? <div className="text-sm text-zinc-600">Loading…</div> : null}

            {!loading && messages.length === 0 ? (
              <div className="text-sm text-zinc-600">Start anywhere. Keystone will keep this conversation with the decision.</div>
            ) : null}

            {messages.map((m, idx) => (
              <div key={idx} className="space-y-1">
                <div className="text-xs text-zinc-500">{m.role === "user" ? "You" : "Keystone"}</div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{m.content}</div>
              </div>
            ))}

            <div ref={endRef} />
          </div>

          <div className="border-t border-zinc-200 p-3 space-y-2">
            {status ? <div className="text-xs text-zinc-500">{status}</div> : null}

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Talk it through…"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Chip onClick={send} title={sending ? "Working…" : "Send"}>
                {sending ? "Thinking…" : "Send"}
              </Chip>

              <Chip onClick={summariseChat} title="Generate a preview summary (nothing is saved yet)">
                {summarising ? "Summarising…" : "Summarise chat"}
              </Chip>

              <div className="text-xs text-zinc-500">
                You can ask me to recommend, compare, simulate, optimise, or show reasoning — only if you want.
              </div>
            </div>

            {summaryStatus ? <div className="text-xs text-zinc-500">{summaryStatus}</div> : null}

            {summary ? (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Summary preview</div>
                    <div className="text-xs text-zinc-600">Nothing has been added to the decision yet.</div>
                  </div>
                  <Chip
                    onClick={() => {
                      setSummary(null);
                      setSummaryStatus("");
                    }}
                    title="Dismiss preview"
                  >
                    Dismiss
                  </Chip>
                </div>

                {renderList("Summary", summary.summary_bullets)}
                {renderList("Preferences learned", summary.preferences_learned)}
                {renderList("Constraints", summary.constraints_added)}
                {renderList("Unknowns resolved", summary.unknowns_resolved)}
                {renderList("Open questions", summary.open_questions)}

                {summary.next_helpful_step ? (
                  <div className="text-sm text-zinc-700">
                    <span className="text-xs font-semibold text-zinc-700">Next helpful step:</span>{" "}
                    {summary.next_helpful_step}
                  </div>
                ) : null}

                {/* Placeholder for the next bundle */}
                <div className="pt-1 text-xs text-zinc-500">
                  Next: “Add summary to decision” (explicit consent) — coming next.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
