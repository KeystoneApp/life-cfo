// app/(app)/home/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { useHomeUnload } from "@/lib/home/useHomeUnload";
import { useHomeOrientation } from "@/lib/home/useHomeOrientation";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");

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

    // Release moment: clear immediately.
    setText("");
    flashAffirmation("Saved.");

    // Keep focus available for continued unloading
    window.setTimeout(() => inputRef.current?.focus(), 0);

    // Persist + optional silent inference
    await unload.submit(raw);
  };

  // Orientation click: navigate away (no inline expansion)
  const onOrientationClick = () => {
    const href = orientation.item?.href;
    if (!href) return;
    router.push(href);
  };

  const hasOrientation = Boolean(orientation.item?.text);
  const canOpenOrientation = Boolean(orientation.item?.href);

  return (
    <Page title="Home">
      <div className="mx-auto w-full max-w-[680px] space-y-8">
        {/* Unload (primary) */}
        <div className="space-y-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What’s on your mind?"
            className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            onKeyDown={(e) => {
              // Natural: Enter submits; Shift+Enter creates a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            aria-label="What’s on your mind?"
            disabled={authStatus !== "signed_in"}
          />

          {/* Soft confirmation (brief, fades) */}
          {affirmation ? (
            <div className="text-sm text-zinc-600" aria-live="polite">
              {affirmation}
            </div>
          ) : (
            <div className="h-5" aria-hidden="true" />
          )}

          {/* Optional, conditional AI response (rare; may be empty) */}
          {unload.response ? (
            <div className="text-[15px] leading-relaxed text-zinc-800">{unload.response}</div>
          ) : null}

          {authStatus === "signed_out" ? (
            <div className="text-sm text-zinc-600">Sign in to use Home.</div>
          ) : null}
        </div>

        {/* Orientation (separate; never competes with input) */}
        {hasOrientation ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-zinc-600">Orientation</div>
                  <div className="mt-2 text-[15px] leading-relaxed text-zinc-800">{orientation.item?.text}</div>
                </div>

                {canOpenOrientation ? (
                  <div className="shrink-0">
                    <Chip onClick={onOrientationClick} title="Open">
                      Open
                    </Chip>
                  </div>
                ) : null}
              </div>

              {/* If it has no href, it stays as a calm signal only */}
              {!canOpenOrientation ? <div className="mt-2 text-xs text-zinc-500">No action needed.</div> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Page>
  );
}
