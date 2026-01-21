// app/(app)/thinking/ThinkingClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Chip, Card, CardContent } from "@/components/ui";

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

function safeDate(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function softWhen(iso: string) {
  const d = safeDate(iso);
  if (!d) return "";
  return d.toLocaleDateString();
}

export default function ThinkingClient() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [drafts, setDrafts] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const openDraft = useMemo(() => drafts.find((d) => d.id === openId) ?? null, [drafts, openId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authError || !auth?.user) {
        setUserId(null);
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

      if (!mounted) return;

      if (error) {
        setStatusLine(`Error: ${error.message}`);
        setDrafts([]);
        return;
      }

      setDrafts((data ?? []) as Decision[]);
      setStatusLine((data?.length ?? 0) === 0 ? "No drafts right now." : `Loaded ${data?.length ?? 0}.`);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Page
      title="Thinking"
      subtitle="A safe space for drafts. Nothing needs to be decided yet."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* Quiet status line (dev-friendly, user-neutral) */}
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {drafts.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">All clear.</div>
                <div className="text-sm text-zinc-600">
                  When something needs thinking time, it can live here without pressure.
                </div>
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
                          <div className="mt-1 text-xs text-zinc-500">Started {softWhen(d.created_at)}</div>
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
                          {/* V1: just a gentle escape hatch */}
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
      </div>
    </Page>
  );
}
