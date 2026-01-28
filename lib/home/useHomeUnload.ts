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
  // For V1 Home: silence is valid + preferred.
  response: string | null;
};

export type UseHomeUnloadOptions = {
  userId: string | null;
};

function normalize(s: string) {
  return (s || "").trim().toLowerCase();
}

function inferIntent(textRaw: string): HomeUnloadIntent {
  const t = normalize(textRaw);

  if (t.includes("?")) return "question";

  const uncertaintyWords = ["unsure", "not sure", "don't know", "dont know", "confused", "torn", "stuck", "uncertain"];
  if (uncertaintyWords.some((w) => t.includes(w))) return "uncertainty";

  const emotionalWords = ["overwhelmed", "anxious", "worried", "stressed", "panic", "sad", "upset", "angry", "burnt out"];
  if (emotionalWords.some((w) => t.includes(w))) return "emotional_load";

  const decisionWords = ["decide", "decision", "choice", "whether", "pick", "choose", "option", "pros", "cons"];
  if (decisionWords.some((w) => t.includes(w))) return "decision_shaped";

  return "offload";
}

/**
 * Contract: Home Unload (V1)
 * - HOLD always persists to decision_inbox
 * - No chatty prompts
 * - Returns silence (response=null) most of the time
 * - Insert is schema-safe (only guaranteed columns)
 */
export function useHomeUnload(opts: UseHomeUnloadOptions) {
  const { userId } = opts;
  const [response, setResponse] = useState<string | null>(null);

  const submit = useCallback(
    async (rawText: string): Promise<HomeUnloadResult | null> => {
      if (!userId) return null;

      const text = rawText.trim();
      if (!text) return null;

      const intent = inferIntent(text);
      const title = text.length > 80 ? text.slice(0, 79) + "…" : text;

      // ✅ Schema-safe insert: only columns we KNOW exist from prior work
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
        })
        .select("id")
        .single();

      if (error || !data?.id) {
        // Quiet failure (Home shouldn't punish the user)
        setResponse(null);
        return null;
      }

      const inbox_item_id = data.id as string;

      // Home response stays quiet in V1
      setResponse(null);

      return {
        inbox_item_id,
        intent,
        response: null,
      };
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
