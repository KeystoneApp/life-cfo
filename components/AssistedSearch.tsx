"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui";

type Scope = "thinking" | "decisions" | "revisit" | "chapters" | "capture" | "framing";

type Suggestion = {
  kind: "decision" | "inbox";
  id: string;
  title: string;
  subtitle?: string;
  href: string; // where to navigate
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function routeForDecision(scope: Scope, decisionId: string) {
  // For V1: open in Thinking when it’s draft; otherwise go to Decisions/Revisit/Chapters pages but still allow open param.
  // We’ll keep it simple: always route to /thinking?open= for deep open, because Thinking is the safe intelligence workspace.
  // Pages can later honor ?open= too if you want.
  return `/thinking?open=${encodeURIComponent(decisionId)}`;
}

function routeForInbox(scope: Scope, inboxId: string) {
  // Inbox items are worked through Capture/Framing; keep it calm:
  // - Capture items: /framing (loads oldest open capture) — we don’t deep-link yet.
  return `/framing`;
}

async function fetchTopSuggestions(scope: Scope): Promise<Suggestion[]> {
  // Calm defaults: recent drafts + recent decisions (capped)
  // You can tune per scope later without changing UI behavior.
  const out: Suggestion[] = [];

  // Recent draft decisions
  const drafts = await supabase
    .from("decisions")
    .select("id,title,created_at,status")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(4);

  if (!drafts.error) {
    for (const d of drafts.data ?? []) {
      out.push({
        kind: "decision",
        id: d.id,
        title: safeStr(d.title) || "Untitled",
        subtitle: "Draft",
        href: routeForDecision(scope, d.id),
      });
    }
  }

  // Recent non-draft decisions (ledger memory)
  const recent = await supabase
    .from("decisions")
    .select("id,title,created_at,status")
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(3);

  if (!recent.error) {
    for (const d of recent.data ?? []) {
      out.push({
        kind: "decision",
        id: d.id,
        title: safeStr(d.title) || "Untitled",
        subtitle: "Decision",
        href: routeForDecision(scope, d.id),
      });
    }
  }

  return out.slice(0, 7);
}

async function fetchMatches(scope: Scope, q: string): Promise<Suggestion[]> {
  const query = q.trim();
  if (!query) return fetchTopSuggestions(scope);

  // Decisions: title-first, then context
  const { data: decisions, error } = await supabase
    .from("decisions")
    .select("id,title,context,status,created_at")
    .or(`title.ilike.%${query}%,context.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) return [];

  return (decisions ?? []).map((d) => ({
    kind: "decision",
    id: d.id,
    title: safeStr(d.title) || "Untitled",
    subtitle: d.status === "draft" ? "Draft" : "Decision",
    href: routeForDecision(scope, d.id),
  }));
}

export function AssistedSearch({
  scope,
  className,
  placeholder = "Search…",
}: {
  scope: Scope;
  className?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const debouncedQ = useMemo(() => q, [q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    const t = setTimeout(async () => {
      const next = debouncedQ.trim()
        ? await fetchMatches(scope, debouncedQ)
        : await fetchTopSuggestions(scope);

      if (!alive) return;
      setItems(next);
      setLoading(false);
    }, 120);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [debouncedQ, scope]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
        />
        {loading ? (
          <span className="text-xs text-zinc-400">…</span>
        ) : (
          <span className="text-xs text-zinc-400">⌘K</span>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="px-3 py-2 text-xs text-zinc-500">
            {q.trim() ? "Matches" : "Suggestions"}
          </div>

          <div className="max-h-72 overflow-auto">
            {items.length === 0 ? (
              <div className="px-3 py-3 text-sm text-zinc-500">No matches.</div>
            ) : (
              items.map((it) => (
                <button
                  key={`${it.kind}-${it.id}`}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-zinc-50"
                  onClick={() => {
                    setOpen(false);
                    router.push(it.href);
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {it.title}
                    </div>
                    {it.subtitle ? (
                      <div className="truncate text-xs text-zinc-500">{it.subtitle}</div>
                    ) : null}
                  </div>
                  <Chip className="shrink-0 text-xs">{it.kind === "decision" ? "Decision" : "Inbox"}</Chip>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
