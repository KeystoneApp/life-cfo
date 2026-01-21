// app/(app)/thinking/ThinkingClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Chip, Card, CardContent, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type Decision = {
  id: string;
  user_id: string;
  title: string;
  context: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
  review_at: string | null;
};

function safeMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function softWhen(iso: string | null | undefined) {
  const ms = safeMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

function isoNowPlusDays(days: number) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export default function ThinkingClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [drafts, setDrafts] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const loadRef = useRef<(opts?: { silent?: boolean }) => void>(() => {});
  const reloadTimerRef = useRef<number | null>(null);

  const scheduleReload = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      loadRef.current({ silent: true });
    }, 250);
  };

  const openDraft = useMemo(() => drafts.find((d) => d.id === openId) ?? null, [drafts, openId]);

  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setStatusLine("Loading…");

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) {
      setUserId(null);
      setDrafts([]);
      setStatusLine("Not signed in.");
      return;
    }

    setUserId(auth.user.id);

    const { data, error } = await supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at")
      .eq("user_id", auth.user.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    if (error) {
      setDrafts([]);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const list = (data ?? []) as Decision[];
    setDrafts(list);
    setStatusLine(list.length === 0 ? "No drafts right now." : `Loaded ${list.length}.`);
  };

  useEffect(() => {
    loadRef.current = (opts?: { silent?: boolean }) => void load(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();

    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: draft decisions
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`thinking-drafts-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const eventType: string | undefined = payload?.eventType;
          const next = payload?.new as any | undefined;
          const prev = payload?.old as any | undefined;

          const id = (next?.id ?? prev?.id) as string | undefined;
          if (!eventType || !id) {
            scheduleReload();
            return;
          }

          // We only care about drafts.
          const rowStatus = String(next?.status ?? prev?.status ?? "");
          const isDraft = rowStatus === "draft";

          setDrafts((current) => {
            // DELETE
            if (eventType === "DELETE") {
              if (openId === id) setOpenId(null);
              return current.filter((d) => d.id !== id);
            }

            // INSERT/UPDATE
            if (!isDraft) {
              // If it stopped being a draft, remove it from this page
              if (openId === id) setOpenId(null);
              return current.filter((d) => d.id !== id);
            }

            const toDecision = (r: any): Decision => ({
              id: r.id,
              user_id: r.user_id,
              title: r.title ?? "",
              context: r.context ?? null,
              status: r.status ?? "draft",
              created_at: r.created_at ?? new Date().toISOString(),
              decided_at: r.decided_at ?? null,
              review_at: r.review_at ?? null,
            });

            const patch = toDecision(next ?? prev);

            const exists = current.some((d) => d.id === patch.id);
            const merged = exists ? current.map((d) => (d.id === patch.id ? { ...d, ...patch } : d)) : [patch, ...current];

            merged.sort((a, b) => {
              const ta = safeMs(a.created_at) ?? 0;
              const tb = safeMs(b.created_at) ?? 0;
              return tb - ta;
            });

            return merged;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, openId]);

  const decideNow = async (d: Decision) => {
    if (!userId) return;

    // Optimistic UI: remove immediately
    setDrafts((prev) => prev.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);

    const { error } = await supabase
      .from("decisions")
      .update({ status: "decided", decided_at: new Date().toISOString() })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t mark decided: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast(
      {
        message: "Moved to Decisions.",
        undoLabel: "Undo",
        onUndo: async () => {
          const { error: undoErr } = await supabase
            .from("decisions")
            .update({ status: "draft", decided_at: null })
            .eq("id", d.id)
            .eq("user_id", userId);

          if (undoErr) {
            showToast({ message: `Undo failed: ${undoErr.message}` }, 3500);
            return;
          }
          loadRef.current({ silent: true });
        },
      },
      7000
    );
  };

  const scheduleRevisit = async (d: Decision, days: number) => {
    if (!userId) return;

    const review_at = isoNowPlusDays(days);

    // Optimistic: update locally
    setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at } : x)));

    const { error } = await supabase
      .from("decisions")
      .update({ review_at })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t schedule: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: `Scheduled revisit in ${days}d.` }, 2500);
  };

  const deleteDraft = async (d: Decision) => {
    if (!userId) return;

    // Optimistic: remove
    const prev = drafts;
    setDrafts((p) => p.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);

    const { error } = await supabase.from("decisions").delete().eq("id", d.id).eq("user_id", userId).eq("status", "draft");

    if (error) {
      showToast({ message: `Couldn’t delete: ${error.message}` }, 3500);
      setDrafts(prev);
      return;
    }

    showToast(
      {
        message: "Draft deleted.",
        undoLabel: "Undo",
        onUndo: async () => {
          // Undoing a delete would require re-insert; keep it simple for v1.
          showToast({ message: "Undo isn’t available for deletes yet." }, 3000);
        },
      },
      6000
    );
  };

  return (
    <Page
      title="Thinking"
      subtitle="A safe space for drafts. Nothing needs to be decided yet."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
          <Chip onClick={() => loadRef.current({ silent: false })}>Refresh</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {drafts.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">All clear.</div>
                <div className="text-sm text-zinc-600">When something needs thinking time, it can live here without pressure.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {drafts.map((d) => {
              const isOpen = openId === d.id;

              return (
                <Card key={d.id} className="border-zinc-200 bg-white">
                  <CardContent>
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : d.id)}
                      className="w-full text-left"
                      aria-expanded={isOpen}
                      title={isOpen ? "Collapse" : "Open"}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-[240px] flex-1">
                          <div className="text-base font-semibold text-zinc-900">{d.title}</div>

                          <div className="mt-1 text-xs text-zinc-500">
                            Started {softWhen(d.created_at)}
                            {d.review_at ? ` • Revisit ${softWhen(d.review_at)}` : ""}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Chip>{isOpen ? "Hide" : "Open"}</Chip>
                        </div>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="mt-4 space-y-4">
                        {d.context ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{d.context}</div>
                        ) : (
                          <div className="text-sm text-zinc-600">No extra context yet.</div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <Chip onClick={() => decideNow(d)} title="Move to Decisions (decided)">
                            Decide
                          </Chip>

                          <Chip onClick={() => scheduleRevisit(d, 7)} title="Schedule a revisit in 7 days">
                            Revisit 7d
                          </Chip>

                          <Chip onClick={() => scheduleRevisit(d, 30)} title="Schedule a revisit in 30 days">
                            Revisit 30d
                          </Chip>

                          <Chip onClick={() => router.push("/revisit")} title="Open the revisit page">
                            Go to Revisit
                          </Chip>

                          <Chip onClick={() => deleteDraft(d)} title="Delete this draft">
                            Delete
                          </Chip>

                          <Chip onClick={() => router.push("/home")} title="Return to Home">
                            Put this down
                          </Chip>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* little dev-only sanity detail */}
        {process.env.NODE_ENV === "development" && openDraft ? (
          <div className="text-xs text-zinc-400">openId: {openDraft.id}</div>
        ) : null}
      </div>
    </Page>
  );
}
