// app/(app)/decisions/DecisionsClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";
import { DecisionNotes } from "@/components/decision/DecisionNotes";
import { ConversationPanel } from "@/app/(app)/thinking/ConversationPanel";

export const dynamic = "force-dynamic";

type Tab = "active" | "review" | "chapters";

type Decision = {
  id: string;
  user_id: string;
  title: string | null;
  context: string | null;
  status: string | null;
  created_at: string | null;
  decided_at: string | null;
  review_at: string | null;
  reviewed_at: string | null;
  chaptered_at: string | null;
  origin: string | null;
};

function safeMs(iso: unknown) {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function softWhen(iso: unknown) {
  const ms = safeMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

function isoNowPlusDays(days: number) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function isoFromDateInput(dateStr: string) {
  if (!dateStr) return null;
  const ms = Date.parse(`${dateStr}T12:00:00`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export default function DecisionsClient() {
  const { showToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [tab, setTab] = useState<Tab>("active");
  const [items, setItems] = useState<Decision[]>([]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [chatForId, setChatForId] = useState<string | null>(null);

  // Inline review scheduling (per decision)
  const [revisitModeById, setRevisitModeById] = useState<Record<string, "7" | "30" | "90" | "custom" | "">>({});
  const [customDateById, setCustomDateById] = useState<Record<string, string>>({});

  // Inline edit (simple)
  const [isEditingById, setIsEditingById] = useState<Record<string, boolean>>({});
  const [titleById, setTitleById] = useState<Record<string, string>>({});
  const [contextById, setContextById] = useState<Record<string, string>>({});

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setStatusLine("Loading…");

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user?.id) {
      setUserId(null);
      setItems([]);
      setStatusLine("Not signed in.");
      return;
    }

    const uid = auth.user.id;
    setUserId(uid);

    // Base query: decisions for this user (excluding drafts; drafts live in Thinking)
    let q = supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,reviewed_at,chaptered_at,origin")
      .eq("user_id", uid);

    if (tab === "active") {
      q = q.eq("status", "decided").order("decided_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
    } else if (tab === "chapters") {
      q = q.eq("status", "chapter").order("chaptered_at", { ascending: false, nullsFirst: false }).order("decided_at", { ascending: false, nullsFirst: false });
    } else {
      // review tab: anything with review_at set; show due first
      q = q.not("review_at", "is", null).order("review_at", { ascending: true });
    }

    const { data, error } = await q;
    if (error) {
      setItems([]);
      setStatusLine(`Couldn’t load decisions: ${error.message}`);
      return;
    }

    const list = (data ?? []) as Decision[];
    setItems(list);
    setStatusLine(list.length === 0 ? "All clear." : "Loaded.");
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Keep chat anchored to open card
  useEffect(() => {
    setChatForId((cur) => {
      if (!cur) return null;
      if (!openId) return null;
      return cur === openId ? cur : null;
    });
  }, [openId]);

  const beginEdit = (d: Decision) => {
    setIsEditingById((p) => ({ ...p, [d.id]: true }));
    setTitleById((p) => ({ ...p, [d.id]: (d.title ?? "").toString() }));
    setContextById((p) => ({ ...p, [d.id]: (d.context ?? "").toString() }));
  };

  const cancelEdit = (d: Decision) => {
    setIsEditingById((p) => ({ ...p, [d.id]: false }));
  };

  const saveEdit = async (d: Decision) => {
    if (!userId) return;

    const nextTitle = (titleById[d.id] ?? "").trim() || "Untitled";
    const nextContext = (contextById[d.id] ?? "").trim() || null;

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, title: nextTitle, context: nextContext } : x)));
    setIsEditingById((p) => ({ ...p, [d.id]: false }));

    const { error } = await supabase
      .from("decisions")
      .update({ title: nextTitle, context: nextContext })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t save: ${error.message}` }, 3500);
      void load({ silent: true });
      return;
    }

    showToast({ message: "Saved." }, 1800);
  };

  const scheduleReviewAt = async (d: Decision, review_at: string) => {
    if (!userId) return;

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at, reviewed_at: null } : x)));

    const { error } = await supabase
      .from("decisions")
      .update({ review_at, reviewed_at: null })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t schedule: ${error.message}` }, 3500);
      void load({ silent: true });
      return;
    }

    showToast({ message: "Review scheduled." }, 2200);
  };

  const moveToChapters = async (d: Decision) => {
    if (!userId) return;

    // optimistic
    setItems((prev) => prev.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (chatForId === d.id) setChatForId(null);

    const { error } = await supabase
      .from("decisions")
      .update({ status: "chapter", chaptered_at: new Date().toISOString() })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t move to Chapters: ${error.message}` }, 3500);
      void load({ silent: true });
      return;
    }

    showToast({ message: "Moved to Chapters." }, 2500);
  };

  const markReviewed = async (d: Decision) => {
    if (!userId) return;

    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, reviewed_at: now } : x)));

    const { error } = await supabase
      .from("decisions")
      .update({ reviewed_at: now })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t mark reviewed: ${error.message}` }, 3500);
      void load({ silent: true });
      return;
    }

    showToast({ message: "Marked reviewed." }, 2000);
  };

  const newDecisionInline = async () => {
    if (!userId) {
      showToast({ message: "Not signed in." }, 2500);
      return;
    }

    const created_at = new Date().toISOString();

    // Create a decided decision (so it belongs on this page)
    const { data, error } = await supabase
      .from("decisions")
      .insert({
        user_id: userId,
        title: "New decision",
        context: null,
        status: "decided",
        decided_at: created_at,
        created_at,
      })
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,reviewed_at,chaptered_at,origin")
      .single();

    if (error || !data?.id) {
      showToast({ message: `Couldn’t create: ${error?.message ?? "Unknown error"}` }, 3500);
      return;
    }

    const d = data as Decision;

    // Put it at top + open
    setItems((prev) => [d, ...prev]);
    setOpenId(d.id);

    // Scroll into view
    window.setTimeout(() => {
      const el = cardRefs.current[d.id];
      el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 60);

    // Drop into edit mode immediately
    beginEdit(d);
  };

  const visible = useMemo(() => items, [items]);

  return (
    <Page
      title="Decisions"
      subtitle="A safe place to think — without carrying it all."
      right={
        <div className="flex items-center gap-2">
          <Chip active={tab === "active"} onClick={() => setTab("active")}>Active</Chip>
          <Chip active={tab === "review"} onClick={() => setTab("review")}>Review</Chip>
          <Chip active={tab === "chapters"} onClick={() => setTab("chapters")}>Chapters</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">{statusLine}</div>

          {tab === "active" ? (
            <button
              type="button"
              onClick={() => void newDecisionInline()}
              className="inline-flex items-center justify-center rounded-full border border-[#1F5E5C] bg-[#1F5E5C] px-4 py-2 text-sm text-white transition hover:bg-[#174947]"
              title="Create a new decision here"
            >
              New decision
            </button>
          ) : null}
        </div>

        {/* Assisted retrieval */}
        <AssistedSearch scope="decisions" placeholder="Search decisions…" />

        {/* Ask box hook point (keep your existing one if you already have an API + UI you like) */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Ask about your decisions</div>
              <div className="text-sm text-zinc-600">
                Keep it simple. Example: “What decisions are still open?” or “What should I revisit next?”
              </div>
              {/* You can wire this to whatever API you already use for decisions-ask */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-500">
                (Ask box wiring stays as-is — we can plug it in next once we confirm which route you want to call.)
              </div>
            </div>
          </CardContent>
        </Card>

        {visible.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">All clear.</div>
                <div className="text-sm text-zinc-600">
                  {tab === "active"
                    ? "When you decide something, it can live here quietly."
                    : tab === "review"
                    ? "Nothing scheduled for review right now."
                    : "No chapters yet."}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {visible.map((d) => {
              const isOpen = openId === d.id;
              const isChatOpen = chatForId === d.id;
              const isEditing = !!isEditingById[d.id];

              const review_at = d.review_at;
              const dueLabel =
                tab === "review" && review_at
                  ? (() => {
                      const ms = safeMs(review_at) ?? 0;
                      const isDue = ms <= Date.now();
                      return isDue ? "Due now" : "Upcoming";
                    })()
                  : "";

              const revisitMode = revisitModeById[d.id] ?? "";
              const customDate = customDateById[d.id] ?? "";

              return (
                <div
                  key={d.id}
                  ref={(el) => {
                    cardRefs.current[d.id] = el;
                  }}
                >
                  <Card className="border-zinc-200 bg-white">
                    <CardContent>
                      <button
                        type="button"
                        onClick={() => {
                          const nextOpen = isOpen ? null : d.id;
                          setOpenId(nextOpen);
                          if (nextOpen !== d.id) setChatForId(null);
                        }}
                        className="w-full text-left"
                        aria-expanded={isOpen}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[240px] flex-1">
                            <div className="text-base font-semibold text-zinc-900">
                              {(d.title ?? "").trim() || "Untitled"}
                            </div>

                            <div className="mt-1 text-xs text-zinc-500">
                              {d.decided_at ? `Saved ${softWhen(d.decided_at)}` : d.created_at ? `Created ${softWhen(d.created_at)}` : ""}
                              {d.review_at ? ` • Review ${softWhen(d.review_at)}` : ""}
                              {dueLabel ? ` • ${dueLabel}` : ""}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Chip>{isOpen ? "Hide" : "Open"}</Chip>
                          </div>
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="mt-4 space-y-4">
                          {/* Body */}
                          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-zinc-900">Details</div>

                              {!isEditing ? (
                                <Chip onClick={() => beginEdit(d)}>Edit</Chip>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Chip onClick={() => cancelEdit(d)}>Cancel</Chip>
                                  <Chip onClick={() => void saveEdit(d)}>Save</Chip>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs text-zinc-500">Title</div>
                              <input
                                value={isEditing ? (titleById[d.id] ?? d.title ?? "") : d.title ?? ""}
                                disabled={!isEditing}
                                onChange={(e) => setTitleById((p) => ({ ...p, [d.id]: e.target.value }))}
                                className={`h-11 w-full rounded-2xl border px-4 text-[15px] text-zinc-900 outline-none ${
                                  isEditing
                                    ? "border-zinc-200 bg-white focus:ring-2 focus:ring-zinc-200"
                                    : "border-zinc-100 bg-zinc-50"
                                }`}
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs text-zinc-500">Context</div>
                              {!isEditing ? (
                                <div className="whitespace-pre-wrap rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-[15px] leading-relaxed text-zinc-800">
                                  {(d.context ?? "").trim() ? d.context : <span className="text-zinc-500">—</span>}
                                </div>
                              ) : (
                                <textarea
                                  value={contextById[d.id] ?? d.context ?? ""}
                                  onChange={(e) => setContextById((p) => ({ ...p, [d.id]: e.target.value }))}
                                  placeholder="Add any helpful context…"
                                  className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                                />
                              )}
                            </div>
                          </div>

                          {/* Notes */}
                          <DecisionNotes decisionId={d.id} kind="decisions" />

                          {/* Review controls */}
                          <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
                            <div className="text-xs text-zinc-500">Review</div>
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                                value={revisitMode}
                                onChange={(e) => {
                                  const v = e.target.value as "7" | "30" | "90" | "custom" | "";
                                  setRevisitModeById((p) => ({ ...p, [d.id]: v }));
                                  if (v === "7") void scheduleReviewAt(d, isoNowPlusDays(7));
                                  if (v === "30") void scheduleReviewAt(d, isoNowPlusDays(30));
                                  if (v === "90") void scheduleReviewAt(d, isoNowPlusDays(90));
                                }}
                                aria-label="Review schedule"
                                title="Choose when to bring this back"
                              >
                                <option value="">Choose…</option>
                                <option value="7">In 7 days</option>
                                <option value="30">In 30 days</option>
                                <option value="90">In 90 days</option>
                                <option value="custom">Pick a date…</option>
                              </select>

                              {revisitMode === "custom" ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="date"
                                    className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                                    value={customDate}
                                    onChange={(e) => setCustomDateById((p) => ({ ...p, [d.id]: e.target.value }))}
                                  />
                                  <Chip
                                    onClick={() => {
                                      const iso = isoFromDateInput(customDate);
                                      if (!iso) {
                                        showToast({ message: "Pick a valid date." }, 2000);
                                        return;
                                      }
                                      void scheduleReviewAt(d, iso);
                                    }}
                                  >
                                    Set date
                                  </Chip>
                                </div>
                              ) : null}

                              {tab === "review" ? (
                                <Chip onClick={() => void markReviewed(d)} title="Mark as reviewed">
                                  Mark reviewed
                                </Chip>
                              ) : null}
                            </div>
                          </div>

                          {/* Chapter action */}
                          {tab !== "chapters" ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Chip onClick={() => setChatForId((cur) => (cur === d.id ? null : d.id))}>
                                {isChatOpen ? "Hide chat" : "Talk it through"}
                              </Chip>

                              <Chip onClick={() => void moveToChapters(d)} title="Move this into Chapters">
                                Move to Chapters
                              </Chip>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <Chip onClick={() => setChatForId((cur) => (cur === d.id ? null : d.id))}>
                                {isChatOpen ? "Hide chat" : "Talk it through"}
                              </Chip>
                            </div>
                          )}

                          {/* Chat */}
                          {isChatOpen ? (
                            <div className="pt-2">
                              <ConversationPanel
                                decisionId={d.id}
                                decisionTitle={(d.title ?? "").trim() || "Untitled"}
                                frame={{ decision_statement: (d.title ?? "").trim() }}
                                onClose={() => setChatForId(null)}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}
