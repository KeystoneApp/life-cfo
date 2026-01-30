"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui";

type Kind = "thinking";

type Props = {
  decisionId: string;
  kind: Kind;
  label?: string;
};

function useDebouncedCallback(fn: () => void, delayMs: number) {
  const t = useRef<number | null>(null);

  return () => {
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => fn(), delayMs);
  };
}

export function DecisionNotes({ decisionId, kind, label }: Props) {
  const title = useMemo(() => {
    if (label) return label;
    return "Scratchpad";
  }, [kind, label]);

  const [open, setOpen] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("idle");
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from("decision_notes")
        .select("id, body")
        .eq("user_id", userId)
        .eq("decision_id", decisionId)
        .eq("kind", kind)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setStatus("error");
        return;
      }

      setNoteId(data?.id ?? null);
      setText(data?.body ?? "");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [decisionId, kind]);

  const saveNow = async () => {
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;
    if (!userId) return;

    setStatus("saving");

    const payload = {
      id: noteId ?? undefined,
      user_id: userId,
      decision_id: decisionId,
      kind,
      body: text,
    };

    const { data, error } = await supabase
      .from("decision_notes")
      .upsert(payload, { onConflict: "user_id,decision_id,kind" })
      .select("id")
      .single();

    if (error) {
      setStatus("error");
      return;
    }

    setNoteId(data?.id ?? noteId);
    setStatus("saved");

    window.setTimeout(() => {
      setStatus((s) => (s === "saved" ? "idle" : s));
    }, 1200);
  };

  const debouncedSave = useDebouncedCallback(saveNow, 800);

  const preview = text.trim().slice(0, 120);

  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent className="p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3"
        >
          <div className="text-sm font-medium text-zinc-900">{title}</div>
          <div className="flex items-center gap-2">
            {status === "saving" && <span className="text-xs text-zinc-500">Saving…</span>}
            {status === "saved" && <span className="text-xs text-zinc-500">Saved</span>}
            {status === "error" && <span className="text-xs text-zinc-500">Couldn’t save</span>}
            <span className="text-xs text-zinc-500">{open ? "Hide" : "Show"}</span>
          </div>
        </button>

        {!open ? (
          <div className="mt-2 text-sm text-zinc-600">
            {preview.length ? (
              <span>
                {preview}
                {text.trim().length > preview.length ? "…" : ""}
              </span>
            ) : (
              <span className="text-zinc-400">Add a note if it helps.</span>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                debouncedSave();
              }}
              placeholder={kind === "thinking" ? "Why this matters, constraints, values signals…" : "Anything you’re thinking through…"}
              className="min-h-[90px] w-full resize-none rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-300"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
