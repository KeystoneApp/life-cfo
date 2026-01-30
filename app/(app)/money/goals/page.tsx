// app/(app)/money/goals/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Button, Card, CardContent, Chip, Badge, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * GOALS — V1 (Money → Goals)
 *
 * Table expected (Supabase): money_goals
 * Columns:
 * - id (uuid, pk, default gen_random_uuid())
 * - user_id (uuid, not null)
 * - name (text, not null)
 * - target_amount_cents (bigint, not null, default 0)
 * - currency (text, not null, default 'AUD')
 * - target_date (date, null)
 * - priority (int, not null, default 2)   -- 1..3
 * - notes (text, null)
 * - created_at (timestamptz, default now())
 * - updated_at (timestamptz, default now())
 */

type Goal = {
  id: string;
  user_id: string;
  name: string;
  target_amount_cents: number;
  currency: string;
  target_date: string | null; // YYYY-MM-DD
  priority: 1 | 2 | 3;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function toCents(input: string) {
  // Accept "1234", "1,234.56", "$1234.56"
  const cleaned = (input || "").replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function fromCents(cents: number) {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return (n / 100).toFixed(2);
}

function fmtMoney(cents: number, currency: string) {
  const cur = (currency || "AUD").toUpperCase();
  return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format((cents || 0) / 100);
}

function fmtDatePretty(yyyyMMdd: string) {
  // yyyy-mm-dd -> local pretty
  const ms = Date.parse(`${yyyyMMdd}T00:00:00`);
  if (Number.isNaN(ms)) return yyyyMMdd;
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function clampPriority(n: number): 1 | 2 | 3 {
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

function priorityLabel(p: 1 | 2 | 3) {
  if (p === 1) return "Priority 1";
  if (p === 2) return "Priority 2";
  return "Priority 3";
}

function softDueText(target_date: string | null) {
  if (!target_date) return "No target date";
  const ms = Date.parse(`${target_date}T00:00:00`);
  if (Number.isNaN(ms)) return "Target date set";
  const now = new Date();
  const d = new Date(ms);
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const pretty = fmtDatePretty(target_date);

  if (diffDays < -1) return `Target was ${pretty}`;
  if (diffDays === -1) return `Target was yesterday (${pretty})`;
  if (diffDays === 0) return `Target is today (${pretty})`;
  if (diffDays === 1) return `Target is tomorrow (${pretty})`;
  if (diffDays <= 30) return `Target in ${diffDays} days (${pretty})`;
  return `Target ${pretty}`;
}

export default function GoalsPage() {
  const toastApi: any = useToast();
  const toast =
    toastApi?.showToast ??
    ((args: any) => {
      if (toastApi?.toast) {
        toastApi.toast({
          title: args?.title ?? "Done",
          description: args?.description ?? args?.message ?? "",
          variant: args?.variant,
          action: args?.action,
        });
      }
    });

  const [userId, setUserId] = useState<string | null>(null);
  const [auth, setAuth] = useState<"loading" | "signed_out" | "signed_in">("loading");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [filter, setFilter] = useState<"all" | "p1" | "p2" | "p3">("all");

  // “Editor” state (inline sheet-style card)
  const [editingId, setEditingId] = useState<string | null>(null); // null = new goal
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(""); // dollars string
  const [currency, setCurrency] = useState("AUD");
  const [targetDate, setTargetDate] = useState<string>(""); // yyyy-mm-dd
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [notes, setNotes] = useState("");

  const nameRef = useRef<HTMLInputElement | null>(null);

  // --- Auth ---
  useEffect(() => {
    let alive = true;
    (async () => {
      setAuth("loading");
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user) {
        setUserId(null);
        setAuth("signed_out");
        return;
      }

      setUserId(data.user.id);
      setAuth("signed_in");
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function load(uid: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("money_goals")
        .select("id,user_id,name,target_amount_cents,currency,target_date,priority,notes,created_at,updated_at")
        .eq("user_id", uid)
        .order("priority", { ascending: true })
        .order("target_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const rows = (data ?? []) as any[];
      setGoals(
        rows.map((r) => ({
          id: String(r.id),
          user_id: String(r.user_id),
          name: String(r.name ?? "Goal"),
          target_amount_cents: Number(r.target_amount_cents ?? 0) || 0,
          currency: String(r.currency ?? "AUD").toUpperCase(),
          target_date: typeof r.target_date === "string" ? r.target_date : null,
          priority: clampPriority(Number(r.priority ?? 2)),
          notes: typeof r.notes === "string" ? r.notes : null,
          created_at: r.created_at ?? null,
          updated_at: r.updated_at ?? null,
        }))
      );
    } catch (e: any) {
      toast({ title: "Couldn’t load goals", description: e?.message ?? "Try again." });
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }

  // load + realtime
  useEffect(() => {
    if (!userId || auth !== "signed_in") return;

    void load(userId);

    const channel = supabase
      .channel(`money_goals:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "money_goals", filter: `user_id=eq.${userId}` },
        () => {
          // refresh list (simple + reliable)
          void load(userId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, auth]);

  const filteredGoals = useMemo(() => {
    if (filter === "all") return goals;
    if (filter === "p1") return goals.filter((g) => g.priority === 1);
    if (filter === "p2") return goals.filter((g) => g.priority === 2);
    return goals.filter((g) => g.priority === 3);
  }, [goals, filter]);

  const totals = useMemo(() => {
    // Keep totals honest: grouped by currency (no fake single total)
    const byCur = filteredGoals.reduce<Record<string, number>>((acc, g) => {
      const cur = (g.currency || "AUD").toUpperCase();
      acc[cur] = (acc[cur] ?? 0) + (g.target_amount_cents || 0);
      return acc;
    }, {});
    const entries = Object.entries(byCur).sort((a, b) => a[0].localeCompare(b[0]));
    return entries.map(([cur, cents]) => ({ cur, cents }));
  }, [filteredGoals]);

  const openEditorForNew = () => {
    setEditingId(null);
    setName("");
    setAmount("");
    setCurrency("AUD");
    setTargetDate("");
    setPriority(2);
    setNotes("");
    window.setTimeout(() => nameRef.current?.focus(), 0);
  };

  const openEditorForEdit = (g: Goal) => {
    setEditingId(g.id);
    setName(g.name || "");
    setAmount(fromCents(g.target_amount_cents || 0));
    setCurrency((g.currency || "AUD").toUpperCase());
    setTargetDate(g.target_date || "");
    setPriority(clampPriority(g.priority));
    setNotes(g.notes || "");
    window.setTimeout(() => nameRef.current?.focus(), 0);
  };

  const closeEditor = () => {
    setEditingId(null);
    setName("");
    setAmount("");
    setCurrency("AUD");
    setTargetDate("");
    setPriority(2);
    setNotes("");
  };

  const saveGoal = async () => {
    if (!userId) return;
    const goalName = name.trim();
    if (!goalName) {
      toast({ title: "Name needed", description: "Give this goal a short name." });
      nameRef.current?.focus();
      return;
    }

    const cents = toCents(amount);
    const cur = (currency || "AUD").toUpperCase();
    const pr = clampPriority(priority);

    // allow blank date
    const dateVal = targetDate.trim() ? targetDate.trim() : null;

    setSaving(true);
    try {
      if (!editingId) {
        const { error } = await supabase.from("money_goals").insert({
          user_id: userId,
          name: goalName,
          target_amount_cents: cents,
          currency: cur,
          target_date: dateVal,
          priority: pr,
          notes: notes.trim() ? notes.trim() : null,
        } as any);
        if (error) throw error;

        toast({ title: "Saved", description: "Goal added." });
        closeEditor();
        return;
      }

      const { error } = await supabase
        .from("money_goals")
        .update({
          name: goalName,
          target_amount_cents: cents,
          currency: cur,
          target_date: dateVal,
          priority: pr,
          notes: notes.trim() ? notes.trim() : null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("user_id", userId)
        .eq("id", editingId);

      if (error) throw error;

      toast({ title: "Saved", description: "Goal updated." });
      closeEditor();
    } catch (e: any) {
      toast({ title: "Couldn’t save", description: e?.message ?? "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const deleteGoal = async (g: Goal) => {
    if (!userId) return;
    if (saving) return;

    const ok = window.confirm(`Delete this goal?\n\n${g.name}`);
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase.from("money_goals").delete().eq("user_id", userId).eq("id", g.id);
      if (error) throw error;

      toast({ title: "Deleted", description: "Goal removed." });
      if (editingId === g.id) closeEditor();
    } catch (e: any) {
      toast({ title: "Couldn’t delete", description: e?.message ?? "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const subtitle =
    "Goals make money answers meaningful. They don’t force decisions — they anchor trade-offs calmly.";

  const editorOpen = editingId !== null || name.trim() || amount.trim() || targetDate.trim() || notes.trim();

  return (
    <Page title="Goals" subtitle={subtitle} right={<div className="flex items-center gap-2"></div>}>
      <div className="mx-auto w-full max-w-[860px] space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {auth === "loading" || loading ? <Chip>Loading…</Chip> : <Chip>Ready</Chip>}
                {auth === "signed_in" ? <Badge>Signed in</Badge> : <Badge>Signed out</Badge>}
                <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">Money → Goals</Chip>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="secondary" onClick={() => setFilter("all")}>
                  All
                </Button>
                <Button variant="secondary" onClick={() => setFilter("p1")}>
                  P1
                </Button>
                <Button variant="secondary" onClick={() => setFilter("p2")}>
                  P2
                </Button>
                <Button variant="secondary" onClick={() => setFilter("p3")}>
                  P3
                </Button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-zinc-600">
                {filteredGoals.length} goal{filteredGoals.length === 1 ? "" : "s"} shown
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {totals.length === 0 ? (
                  <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">No totals yet</Chip>
                ) : (
                  totals.map((t) => (
                    <Chip key={t.cur} className="text-xs border-zinc-200 bg-white text-zinc-700" title="Sum of shown goals">
                      Total ({t.cur}): {fmtMoney(t.cents, t.cur)}
                    </Chip>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-zinc-900">{editingId ? "Edit goal" : "Add a goal"}</div>

              <div className="flex items-center gap-2">
                <Button onClick={openEditorForNew} disabled={auth !== "signed_in" || saving}>
                  New goal
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-12">
              <div className="md:col-span-6">
                <div className="text-xs text-zinc-600 mb-1">Name</div>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Emergency fund"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  disabled={auth !== "signed_in" || saving}
                />
              </div>

              <div className="md:col-span-3">
                <div className="text-xs text-zinc-600 mb-1">Target amount</div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  disabled={auth !== "signed_in" || saving}
                />
              </div>

              <div className="md:col-span-3">
                <div className="text-xs text-zinc-600 mb-1">Currency</div>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  disabled={auth !== "signed_in" || saving}
                >
                  <option value="AUD">AUD</option>
                  <option value="USD">USD</option>
                  <option value="NZD">NZD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>

              <div className="md:col-span-4">
                <div className="text-xs text-zinc-600 mb-1">Target date (optional)</div>
                <input
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  type="date"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  disabled={auth !== "signed_in" || saving}
                />
              </div>

              <div className="md:col-span-4">
                <div className="text-xs text-zinc-600 mb-1">Priority</div>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p as 1 | 2 | 3)}
                      className={[
                        "rounded-full border px-3 py-2 text-xs transition",
                        priority === p ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                      ].join(" ")}
                      disabled={auth !== "signed_in" || saving}
                      title={priorityLabel(p as 1 | 2 | 3)}
                    >
                      P{p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-12">
                <div className="text-xs text-zinc-600 mb-1">Notes (optional)</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything that helps future-you understand this goal (constraints, why it matters, what counts)."
                  className="w-full min-h-[84px] resize-y rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  disabled={auth !== "signed_in" || saving}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-zinc-600">
                {name.trim() ? (
                  <>
                    {priorityLabel(priority)} • {fmtMoney(toCents(amount), currency)} • {softDueText(targetDate.trim() ? targetDate.trim() : null)}
                  </>
                ) : (
                  <>Add a goal when you’re ready.</>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={saveGoal} disabled={auth !== "signed_in" || saving || !name.trim()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button variant="secondary" onClick={closeEditor} disabled={auth !== "signed_in" || saving || !editorOpen}>
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm font-semibold text-zinc-900">Your goals</div>
              <div className="text-xs text-zinc-500">Tap a goal to edit. Goals are calm anchors — not pressure.</div>
            </div>

            <div className="mt-3">
              {auth !== "signed_in" ? (
                <div className="text-sm text-zinc-700">Sign in to use Goals.</div>
              ) : loading ? (
                <div className="space-y-3" aria-hidden="true">
                  <div className="h-5 w-3/4 rounded bg-zinc-100" />
                  <div className="h-5 w-2/3 rounded bg-zinc-100" />
                  <div className="h-5 w-1/2 rounded bg-zinc-100" />
                </div>
              ) : filteredGoals.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">No goals yet</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Add one small goal first. Once you have goals, Keystone can answer “can we afford this?” with real context.
                  </div>
                  <div className="mt-3">
                    <Button onClick={openEditorForNew}>Add a goal</Button>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filteredGoals.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => openEditorForEdit(g)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50"
                        disabled={saving}
                        title="Edit"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="truncate text-sm font-semibold text-zinc-900">{g.name}</div>
                              <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">P{g.priority}</Chip>
                              {g.target_date ? (
                                <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">{fmtDatePretty(g.target_date)}</Chip>
                              ) : (
                                <Chip className="text-xs border-zinc-200 bg-white text-zinc-700">No date</Chip>
                              )}
                            </div>

                            {g.notes ? (
                              <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600">{g.notes}</div>
                            ) : (
                              <div className="mt-1 text-xs text-zinc-500">No notes</div>
                            )}
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold text-zinc-900">{fmtMoney(g.target_amount_cents, g.currency)}</div>
                            <div className="mt-1 text-xs text-zinc-500">{softDueText(g.target_date)}</div>
                          </div>
                        </div>
                      </button>

                      <div className="mt-2 flex items-center justify-end gap-2">
                        <Chip
                          onClick={() => openEditorForEdit(g)}
                          title="Edit"
                          className="text-xs border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        >
                          Edit
                        </Chip>
                        <Chip
                          onClick={() => void deleteGoal(g)}
                          title="Delete"
                          className="text-xs border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        >
                          Delete
                        </Chip>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
