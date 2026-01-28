// lib/home/useHomeUnload.ts
"use client";

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type HomeUnloadIntent =
  | "offload"
  | "uncertainty"
  | "question"
  | "decision_shaped"
  | "emotional_load"
  | "unknown";

export type HomeUnloadResult = {
  inbox_item_id: string;
  intent: HomeUnloadIntent;
  // Optional, calm, brief. Null = silence (most common, valid).
  response: string | null;
  // Optional: Engine may create draft decisions silently.
  created_draft_decision_id?: string | null;
};

export type UseHomeUnloadOptions = {
  userId: string | null;
};

function normalize(s: string) {
  return (s || "").trim().toLowerCase();
}

function inferIntent(textRaw: string): HomeUnloadIntent {
  const t = normalize(textRaw);

  // Question signals
  const questionStarts = [
    "can i",
    "can we",
    "should i",
    "should we",
    "what ",
    "how ",
    "why ",
    "when ",
    "where ",
    "who ",
    "do i",
    "do we",
    "is it",
    "are we",
    "am i",
    "could i",
    "could we",
    "would it",
    "would we",
  ];

  if (t.includes("?")) return "question";
  if (questionStarts.some((p) => t.startsWith(p))) return "question";

  // Uncertainty signals
  const uncertaintyWords = ["unsure", "not sure", "don't know", "dont know", "confused", "torn", "stuck", "uncertain"];
  if (uncertaintyWords.some((w) => t.includes(w))) return "uncertainty";

  // Emotional load signals
  const emotionalWords = ["overwhelmed", "anxious", "worried", "stressed", "panic", "sad", "upset", "angry", "burnt out"];
  if (emotionalWords.some((w) => t.includes(w))) return "emotional_load";

  // Decision-shaped signals (even without a direct question mark)
  const decisionWords = ["decide", "decision", "choice", "whether", "pick", "choose", "option", "pros", "cons"];
  if (decisionWords.some((w) => t.includes(w))) return "decision_shaped";

  // Default: offload (silence is valid)
  return "offload";
}

function fallbackResponseFor(intent: HomeUnloadIntent): string | null {
  // Keep extremely brief and non-pushy.
  if (intent === "question") return "Want help answering that, or just hold it here for now?";
  if (intent === "uncertainty") return "Want to talk it through, or should I just hold it for now?";
  if (intent === "decision_shaped") return "Want to think this through together, or just park it here?";
  if (intent === "emotional_load") return "I’ve got it. Want to unpack it a little, or just leave it here for now?";
  return null; // offload/unknown => silence
}

/**
 * Contract: Home Unload
 * - Always available
 * - No mode selection
 * - Submit clears UI immediately (caller responsibility)
 * - May return a brief reflection/question OR silence
 */
export function useHomeUnload(opts: UseHomeUnloadOptions) {
  const { userId } = opts;

  const [response, setResponse] = useState<string | null>(null);

  const submit = useCallback(
    async (rawText: string): Promise<HomeUnloadResult | null> => {
      if (!userId) return null;

      const text = rawText.trim();
      if (!text) return null;

      // Local (V1) intent + fallback (used if API is missing/quiet)
      const localIntent = inferIntent(text);
      const localFallback = fallbackResponseFor(localIntent);

      // 1) Persist the unload as an inbox item (infrastructure, not surfaced on Home)
      const title = text.length > 80 ? text.slice(0, 79) + "…" : text;

      const { data, error } = await supabase
        .from("decision_inbox")
        .insert({
          user_id: userId,
          type: "note",
          title,
          body: text,
          severity: null,
          status: "open",
          snoozed_until: null,
          dedupe_key: `home_unload_${Date.now()}`,
          action_label: null,
          action_href: null,
        })
        .select("id")
        .single();

      if (error || !data?.id) {
        // Quiet failure: do not punish the user with noise.
        return null;
      }

      const inboxItemId = data.id as string;

      // 2) Optional inference (future real AI). If not available, fall back calmly.
      try {
        const res = await fetch("/api/home/unload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inbox_item_id: inboxItemId, text }),
        });

        const json = await res.json().catch(() => null);

        if (res.ok && json && typeof json === "object") {
          const next: HomeUnloadResult = {
            inbox_item_id: inboxItemId,
            intent: (json.intent as HomeUnloadIntent) ?? localIntent ?? "unknown",
            response: typeof json.response === "string" ? json.response : null,
            created_draft_decision_id:
              typeof json.created_draft_decision_id === "string" ? json.created_draft_decision_id : null,
          };

          // If AI returns silence, we may still show the local fallback (only for non-offload intents)
          const finalResponse = (next.response ?? "").trim().length ? next.response : localFallback;

          setResponse(finalResponse ?? null);
          return { ...next, response: finalResponse ?? null };
        }
      } catch {
        // silence -> fallback below
      }

      // 3) V1 fallback (only for question/uncertainty/decision/emotion)
      setResponse(localFallback ?? null);
      return { inbox_item_id: inboxItemId, intent: localIntent, response: localFallback ?? null };
    },
    [userId]
  );

  return useMemo(
    () => ({
      submit,
      response,
      clearResponse: () => setResponse(null),
    }),
    [submit, response]
  );
}
