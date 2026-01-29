// app/(app)/capture/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { softKB, type AttachmentMeta } from "@/lib/attachments";
import { AssistedSearch } from "@/components/AssistedSearch";

export const dynamic = "force-dynamic";

type InboxItem = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string | null;
  framed_decision_id: string | null;
};

function safeTitleFromText(text: string) {
  const firstLine =
    (text || "")
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "";
  const t = firstLine.slice(0, 80);
  return t || "Captured";
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-()+ ]/g, "_");
}

function softDate(iso: string | null) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleDateString();
}

function snippetFromText(text: string, max = 140) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max).trim()}…`;
}

function normalizeAttachments(raw: any): AttachmentMeta[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a.path === "string")
    .map((a) => ({
      name: typeof a.name === "string" ? a.name : "Attachment",
      path: String(a.path),
      type: typeof a.type === "string" ? a.type : "application/octet-stream",
      size: typeof a.size === "number" ? a.size : 0,
    }));
}

function tryParseCaptureBody(raw: string | null): { text: string; attachments: AttachmentMeta[] } {
  if (!raw) return { text: "", attachments: [] };

  const trimmed = raw.trim();
  if (!trimmed) return { text: "", attachments: [] };

  // JSON format: { text, attachments }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as any;
      if (parsed && typeof parsed === "object") {
        const text = typeof parsed.text === "string" ? String(parsed.text) : "";
        const attachments = normalizeAttachments(parsed.attachments);
        return { text, attachments };
      }
    } catch {
      // fall through
    }
  }

  // Plain text fallback
  return { text: trimmed, attachments: [] };
}

function normalizeForCompare(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export default function CapturePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [affirmation, setAffirmation] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Examples dropdown (matches Home pattern)
  const [examplesOpen, setExamplesOpen] = useState(false);

  // Recent list
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [recent, setRecent] = useState<InboxItem[]>([]);
  const [totalOpenCount, setTotalOpenCount] = useState<number>(0);

  // show top 5 vs show all
  const [showAll, setShowAll] = useState(false);

  // Checkbox selections (persist while on page)
  const [selectedPush, setSelectedPush] = useState<Record<string, boolean>>({});
  const [selectedDelete, setSelectedDelete] = useState<Record<string, boolean>>({});

  // Custom delete confirmation (inline, matches UI)
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // “Push to Thinking” prompt state
  const [pushedHref, setPushedHref] = useState<string | null>(null);

  const affirmationTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Auth (quiet) ---
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data?.user) {
        setUserId(null);
        setStatusLine("Not signed in.");
        return;
      }
      setUserId(data.user.id);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const flashAffirmation = (msg: string, ms = 1500) => {
    setAffirmation(msg);
    if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
    affirmationTimerRef.current = window.setTimeout(() => setAffirmation(null), ms);
  };

  useEffect(() => {
    return () => {
      if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
      affirmationTimerRef.current = null;
    };
  }, []);

  const pruneSelections = (rows: InboxItem[]) => {
    const ids = new Set(rows.map((r) => r.id));

    setSelectedPush((prev) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(prev)) if (v && ids.has(k)) next[k] = true;
      return next;
    });

    setSelectedDelete((prev) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(prev)) if (v && ids.has(k)) next[k] = true;
      return next;
    });

    // if confirmation is open, prune that too
    setConfirmDeleteIds((prev) => {
      if (!prev) return null;
      const keep = prev.filter((id) => ids.has(id));
      return keep.length ? keep : null;
    });
  };

  const loadRecent = async (uid: string, opts?: { showAll?: boolean }) => {
    setStatusLine("Loading…");

    const effectiveShowAll = typeof opts?.showAll === "boolean" ? opts.showAll : showAll;

    // 1) Count total open captures (unframed)
    const countRes = await supabase
      .from("decision_inbox")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("status", "open")
      .is("framed_decision_id", null);

    const total = typeof countRes.count === "number" ? countRes.count : 0;
    setTotalOpenCount(total);

    // 2) Load top 5 OR all (capped)
    const q = supabase
      .from("decision_inbox")
      .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
      .eq("user_id", uid)
      .eq("status", "open")
      .is("framed_decision_id", null)
      .order("created_at", { ascending: false });

    const { data, error } = effectiveShowAll ? await q.limit(200) : await q.limit(5);

    if (error) {
      setRecent([]);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const rows = (data ?? []) as InboxItem[];
    setRecent(rows);
    pruneSelections(rows);

    const loaded = rows.length;
    const totalForLine = total || loaded;

    if (loaded === 0) {
      setStatusLine("Nothing captured yet.");
    } else {
      setStatusLine(effectiveShowAll ? `Loaded ${loaded}.` : `Loaded ${loaded} of ${totalForLine}.`);
    }
  };

  useEffect(() => {
    if (!userId) return;
    void loadRecent(userId, { showAll });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, showAll]);

  const addPickedFiles = (picked: FileList | null) => {
    if (!picked) return;

    const incoming = Array.from(picked);

    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const next = [...prev];

      for (const f of incoming) {
        const k = `${f.name}:${f.size}:${f.lastModified}`;
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(f);
      }

      return next;
    });
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSubmit = !!userId && (!!text.trim() || files.length > 0);

  const pushToThinking = (inboxId: string) => {
    const href = `/thinking?from_capture=${encodeURIComponent(inboxId)}`;
    setPushedHref(href);
    flashAffirmation("Sent to Thinking.", 1600);
  };

  const bulkPushSelected = () => {
    const ids = Object.entries(selectedPush)
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (ids.length === 0) {
      flashAffirmation("Select captures to push.", 1400);
      return;
    }

    // For bulk, we won’t attempt to open multiple pages.
    // We’ll set the “Go to Thinking” link to the most-recent selected item (first in list is fine),
    // and clear selections so it feels “done”.
    const first = ids[0];
    setSelectedPush({});
    setExamplesOpen(false);
    setConfirmDeleteIds(null);

    pushToThinking(first);

    if (ids.length > 1) {
      flashAffirmation(`Sent ${ids.length} to Thinking.`, 1800);
    }
  };

  const requestDelete = (ids: string[]) => {
    const uniq = Array.from(new Set(ids)).filter(Boolean);
    if (uniq.length === 0) {
      flashAffirmation("Select captures to delete.", 1400);
      return;
    }
    setConfirmDeleteIds(uniq);
  };

  const deleteOneCapture = async (item: InboxItem) => {
    if (!userId) return;

    // Best effort: remove attachments from storage (if any)
    const parsed = tryParseCaptureBody(item.body);
    const paths = (parsed.attachments || []).map((a) => a.path).filter(Boolean);

    if (paths.length > 0) {
      await supabase.storage.from("captures").remove(paths);
    }

    const { error } = await supabase.from("decision_inbox").delete().eq("id", item.id).eq("user_id", userId);
    if (error) throw error;
  };

  const confirmDeleteNow = async () => {
    if (!userId) return;
    if (!confirmDeleteIds || confirmDeleteIds.length === 0) return;
    if (isDeleting) return;

    const ids = [...confirmDeleteIds];

    // optimistic UI
    setRecent((prev) => prev.filter((x) => !ids.includes(x.id)));
    setConfirmDeleteIds(null);
    setSelectedDelete((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setSelectedPush((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });

    setIsDeleting(true);

    try {
      // delete sequentially to keep storage cleanup simple & reliable
      const byId = new Map(recent.map((r) => [r.id, r]));
      for (const id of ids) {
        const item = byId.get(id);
        if (!item) continue;
        await deleteOneCapture(item);
      }

      flashAffirmation("Deleted.", 1200);
      await loadRecent(userId, { showAll });
    } catch {
      flashAffirmation("Couldn’t delete right now.", 1800);
      await loadRecent(userId, { showAll });
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Capture submit contract:
   * - Writes ONLY to decision_inbox
   * - Does NOT navigate
   *
   * Attachment contract:
   * - Uploads files to Supabase Storage bucket: "captures"
   * - Writes decision_inbox.body as JSON string: { text, attachments: [...] }
   */
  const submit = async () => {
    if (isSubmitting) return;
    if (!canSubmit) return;

    const raw = text.trim();
    const hasFiles = files.length > 0;

    if (!userId) {
      flashAffirmation("Held.", 1600);
      return;
    }

    // Snapshot values BEFORE clearing UI
    const textSnapshot = raw;
    const filesSnapshot = [...files];

    // Release moment: clear immediately (critical)
    setText("");
    setFiles([]);
    setAffirmation(null);
    setPushedHref(null);
    setExamplesOpen(false);

    // Keep focus available for continued capture
    window.setTimeout(() => inputRef.current?.focus(), 0);

    setIsSubmitting(true);

    try {
      // 1) Create inbox row first (so we have an id for attachment paths)
      const title = textSnapshot
        ? safeTitleFromText(textSnapshot)
        : filesSnapshot[0]?.name
          ? `File: ${filesSnapshot[0].name}`
          : "Captured";

      // If no files, keep body as plain text (simple + backward compatible)
      const initialBody = hasFiles ? null : textSnapshot;

      const { data: created, error: createErr } = await supabase
        .from("decision_inbox")
        .insert({
          user_id: userId,
          type: "capture",
          status: "open",
          title,
          body: initialBody,
        })
        .select("id")
        .single();

      if (createErr) throw createErr;

      const inboxId = String(created?.id);

      // 2) Upload attachments (if any)
      let uploaded: AttachmentMeta[] = [];
      let uploadFailures = 0;

      if (hasFiles) {
        const bucket = supabase.storage.from("captures");

        for (const f of filesSnapshot) {
          const safeName = safeFileName(f.name);
          const stamp = Date.now();
          const path = `${userId}/${inboxId}/${stamp}-${safeName}`;

          const { error: upErr } = await bucket.upload(path, f, {
            upsert: false,
            contentType: f.type || undefined,
          });

          if (upErr) {
            uploadFailures += 1;
            continue;
          }

          uploaded.push({
            name: f.name,
            path,
            type: f.type || "application/octet-stream",
            size: f.size,
          });
        }

        // 3) Persist JSON body with text + attachments (even if some failed)
        const bodyJson = JSON.stringify({ text: textSnapshot, attachments: uploaded });

        const { error: updErr } = await supabase
          .from("decision_inbox")
          .update({ body: bodyJson })
          .eq("id", inboxId)
          .eq("user_id", userId);

        if (updErr) {
          flashAffirmation("Saved (details couldn’t update).", 2200);
          await loadRecent(userId, { showAll });
          return;
        }

        if (uploaded.length === 0 && filesSnapshot.length > 0) {
          flashAffirmation("Saved (attachments didn’t upload).", 2400);
          await loadRecent(userId, { showAll });
          return;
        }

        if (uploadFailures > 0) {
          flashAffirmation("Saved (some attachments didn’t upload).", 2400);
          await loadRecent(userId, { showAll });
          return;
        }
      }

      flashAffirmation("Saved.", 1300);
      await loadRecent(userId, { showAll });
    } catch {
      flashAffirmation("Held.", 1800);
    } finally {
      setIsSubmitting(false);
    }
  };

  const insertExample = (s: string) => {
    setExamplesOpen(false);
    setText((prev) => {
      const next = prev.trim().length > 0 ? `${prev}\n${s}` : s;
      return next;
    });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const selectedPushCount = useMemo(() => Object.values(selectedPush).filter(Boolean).length, [selectedPush]);
  const selectedDeleteCount = useMemo(() => Object.values(selectedDelete).filter(Boolean).length, [selectedDelete]);

  const allVisibleIds = useMemo(() => recent.map((r) => r.id), [recent]);

  const toggleAllPushVisible = () => {
    if (recent.length === 0) return;
    const allSelected = recent.every((r) => !!selectedPush[r.id]);
    setSelectedPush((prev) => {
      const next = { ...prev };
      for (const id of allVisibleIds) next[id] = !allSelected;
      return next;
    });
  };

  const toggleAllDeleteVisible = () => {
    if (recent.length === 0) return;
    const allSelected = recent.every((r) => !!selectedDelete[r.id]);
    setSelectedDelete((prev) => {
      const next = { ...prev };
      for (const id of allVisibleIds) next[id] = !allSelected;
      return next;
    });
  };

  return (
    <Page title="Capture" subtitle={null} right={null}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* Friendly line + examples chip */}
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-zinc-600">Drop anything here — a thought, a worry, a reminder. I’ll hold it for you.</div>

          <div className="relative">
            <Chip onClick={() => setExamplesOpen((v) => !v)} title="Examples">
              Examples
            </Chip>

            {examplesOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-[360px] rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                {/* Money & big life goals */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">Money & big life goals</div>
                  <div className="space-y-1">
                    {[
                      "Can we buy a pool?",
                      "When could we realistically buy our first home?",
                      "Are we actually on track financially?",
                      "Can we afford an overseas holiday?",
                      "I’m scared we’ll never get ahead.",
                    ].map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertExample(e)}
                        className="block w-full rounded-xl px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Decisions */}
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">Decisions I’m stuck on</div>
                  <div className="space-y-1">
                    {[
                      "I don’t know what the right decision is here.",
                      "I keep going back and forth on this.",
                      "I feel pressure to decide, but I’m not ready.",
                      "This feels bigger than I can think through right now.",
                    ].map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertExample(e)}
                        className="block w-full rounded-xl px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mental load */}
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">Mental load</div>
                  <div className="space-y-1">
                    {[
                      "I’m carrying too much in my head.",
                      "Everything feels messy and unfinished.",
                      "I can’t tell what actually matters right now.",
                      "I’m overwhelmed but don’t know why.",
                    ].map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertExample(e)}
                        className="block w-full rounded-xl px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Family */}
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">Family & life direction</div>
                  <div className="space-y-1">
                    {[
                      "I’m worried about our family rhythm.",
                      "I feel tension about money and family choices.",
                      "I want our life to feel calmer than this.",
                      "I don’t know how to plan for the next few years.",
                    ].map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertExample(e)}
                        className="block w-full rounded-xl px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Chip onClick={() => setExamplesOpen(false)}>Done</Chip>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Input + compact action row */}
        <div className="space-y-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Drop it here."
            className="w-full min-h-[180px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            onKeyDown={(e) => {
              // Enter submits; Shift+Enter newline
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            aria-label="Capture"
          />

          {/* One compact row: files left, save right */}
          <div
            className="flex flex-wrap items-center justify-between gap-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addPickedFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (fileInputRef.current) fileInputRef.current.value = "";
                  fileInputRef.current?.click();
                }}
                className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:border-zinc-300"
              >
                Add files
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addPickedFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />

              {files.length > 0 ? (
                <div className="text-sm text-zinc-600">{files.length} attached</div>
              ) : (
                <div className="text-sm text-zinc-500">Optional. You can also drag & drop here.</div>
              )}
            </div>

            <Chip onClick={() => void submit()} title={!canSubmit ? "Add text or a file" : isSubmitting ? "Working…" : "Save capture"}>
              {isSubmitting ? "Saving…" : "Save"}
            </Chip>
          </div>

          {/* Attached files list (only when present) */}
          {files.length > 0 ? (
            <div className="space-y-2 pt-1">
              {files.map((f, idx) => (
                <div key={`${f.name}-${f.size}-${f.lastModified}-${idx}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-900">{f.name}</div>
                    <div className="text-xs text-zinc-500">{softKB(f.size)}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:border-zinc-300"
                    aria-label={`Remove ${f.name}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Soft confirmation (brief, fades) */}
        {affirmation ? (
          <div className="text-sm text-zinc-600" aria-live="polite">
            {affirmation}
          </div>
        ) : (
          <div className="h-5" aria-hidden="true" />
        )}

        {/* ✅ Recent captures */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-1">
              <div className="text-sm font-semibold text-zinc-900">Recent captures</div>
              <div className="text-sm text-zinc-600">Captures auto-delete after 30 days unless sent to Thinking.</div>
            </div>

            {/* Search belongs here (above the list) */}
            <div className="mt-4">
              <AssistedSearch scope="capture" placeholder="Search captures…" />
            </div>

            {/* Show more / show all */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-zinc-500">{statusLine}</div>

              {totalOpenCount > 5 ? (
                <Chip onClick={() => setShowAll((v) => !v)} title={showAll ? "Show less" : "Show all"}>
                  {showAll ? "Show less" : "Show all"}
                </Chip>
              ) : null}
            </div>

            {/* “Sent to Thinking” prompt (no auto-nav) */}
            {pushedHref ? (
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                <div className="text-sm text-zinc-700">Sent to Thinking.</div>
                <Chip onClick={() => router.push(pushedHref)} title="Go to Thinking">
                  Go to Thinking <span className="ml-1 opacity-70">›</span>
                </Chip>
              </div>
            ) : null}

            {/* Inline delete confirm (replaces window.confirm) */}
            {confirmDeleteIds && confirmDeleteIds.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-zinc-700">
                    Delete {confirmDeleteIds.length} capture{confirmDeleteIds.length === 1 ? "" : "s"}?
                    <span className="ml-2 text-xs text-zinc-500">This can’t be undone.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Chip
                      onClick={() => setConfirmDeleteIds(null)}
                      title="Cancel"
                    >
                      Cancel
                    </Chip>

                    <Chip
                      onClick={() => void confirmDeleteNow()}
                      title={isDeleting ? "Deleting…" : "Delete"}
                      className="border-zinc-200 bg-white text-zinc-700"
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </Chip>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Bulk header (checkbox columns + actions) */}
            {recent.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-600">Select captures</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Your selections stay while you’re on this page.
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Push column */}
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-medium text-zinc-600">Push to Thinking</div>
                      <Chip onClick={toggleAllPushVisible} title="Select all in this column">
                        {recent.every((r) => !!selectedPush[r.id]) ? "Clear" : "All"}
                      </Chip>
                      <Chip onClick={bulkPushSelected} title={selectedPushCount ? `Push ${selectedPushCount}` : "Push selected"}>
                        Push{selectedPushCount ? ` (${selectedPushCount})` : ""}
                      </Chip>
                    </div>

                    {/* Delete column */}
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-medium text-zinc-600">Delete</div>
                      <Chip onClick={toggleAllDeleteVisible} title="Select all in this column">
                        {recent.every((r) => !!selectedDelete[r.id]) ? "Clear" : "All"}
                      </Chip>
                      <Chip
                        onClick={() => requestDelete(Object.entries(selectedDelete).filter(([, v]) => v).map(([k]) => k))}
                        title={selectedDeleteCount ? `Delete ${selectedDeleteCount}` : "Delete selected"}
                      >
                        Delete{selectedDeleteCount ? ` (${selectedDeleteCount})` : ""}
                      </Chip>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {recent.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-600">Nothing here yet.</div>
            ) : (
              <div className="mt-3 grid gap-2">
                {recent.map((r) => {
                  const p = tryParseCaptureBody(r.body);
                  const displayText = (p.text || "").trim();

                  const title = (r.title || safeTitleFromText(displayText)).trim();
                  const meta = r.created_at ? softDate(r.created_at) : "";

                  const attachmentsCount = p.attachments?.length ?? 0;
                  const hasAtts = attachmentsCount > 0;

                  const titleKey = normalizeForCompare(title);
                  const snippet = snippetFromText(displayText, 140);
                  const snippetKey = normalizeForCompare(snippet);
                  const hasExtraText = !!snippet && snippetKey !== titleKey;

                  return (
                    <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {meta ? meta : "Open capture"}
                            {hasAtts ? ` • ${attachmentsCount} attachment${attachmentsCount === 1 ? "" : "s"}` : ""}
                          </div>

                          {hasExtraText ? (
                            <div className="mt-2 truncate text-sm text-zinc-700">{snippet}</div>
                          ) : null}
                        </div>

                        {/* Two checkbox columns on the right */}
                        <div className="flex shrink-0 items-start gap-6">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!selectedPush[r.id]}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedPush((prev) => ({ ...prev, [r.id]: checked }));
                              }}
                              className="h-4 w-4 rounded border-zinc-300"
                              aria-label={`Select ${title} to push`}
                            />
                            <span className="text-xs text-zinc-600">Push</span>
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!selectedDelete[r.id]}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedDelete((prev) => ({ ...prev, [r.id]: checked }));
                              }}
                              className="h-4 w-4 rounded border-zinc-300"
                              aria-label={`Select ${title} to delete`}
                            />
                            <span className="text-xs text-zinc-600">Delete</span>
                          </label>
                        </div>
                      </div>

                      {/* Single-item quick actions (optional, but clean) */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Chip onClick={() => pushToThinking(r.id)} title="Push this capture to Thinking">
                          Push to Thinking
                        </Chip>
                        <Chip onClick={() => requestDelete([r.id])} title="Delete this capture">
                          Delete
                        </Chip>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
