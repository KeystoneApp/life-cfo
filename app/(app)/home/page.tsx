// app/(app)/home/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export default function HomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [preferredName, setPreferredName] = useState<string>("");

  const [text, setText] = useState("");
  const [affirmation, setAffirmation] = useState<"Saved." | "Held." | null>(null);

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

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;

    setText("");
    flashAffirmation("Saved.");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    await unload.submit(raw);
  };

  const openHref = (href?: string | null) => {
    if (!href) return;
    router.push(href);
  };

  const showExamples = text.trim().length === 0;
  const canSend = authStatus === "signed_in" && text.trim().length > 0;

  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;

  return (
    <Page title="Home" subtitle={subtitle} right={<div className="flex items-center gap-2"></div>}>
      <div className="mx-auto w-full max-w-[680px] space-y-6">
        {/* Unload (primary) */}
        <div className="space-y-3">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What’s on your mind?"
              className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-14 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
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
                title="Send"
              >
                →
              </button>
            ) : null}
          </div>

          <div className="text-xs text-zinc-600">Unload it here. Ask if you want help.</div>

          {showExamples ? (
            <div className="text-xs text-zinc-500 space-y-1">
              <div>• “Can we afford this right now?”</div>
              <div>• “What are my total bills due this month?”</div>
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

          {/* AI response appears here (below the box) */}
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
