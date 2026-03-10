"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

type MoneyRow = {
  currency: string;
  cents: number;
};

type AccountRow = {
  id: string;
  name: string | null;
  type: string | null;
  currency: string | null;
  current_balance_cents: number | null;
};

type GoalRow = {
  id: string;
  title: string | null;
  currency: string | null;
  current_cents: number | null;
  target_cents: number | null;
  status: string | null;
  is_primary?: boolean | null;
};

type SavedResponse = {
  ok: boolean;
  household_id: string | null;
  saved_flow: {
    saved_total_by_currency: MoneyRow[];
    positive_balance_accounts: AccountRow[];
    goals_count: number;
    goals_preview: GoalRow[];
    investment_accounts_count: number;
  };
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function moneyFromCents(cents: number, currency: string) {
  const amt = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amt);
  } catch {
    return `${currency} ${amt.toFixed(2)}`;
  }
}

function renderMoneyRows(rows: MoneyRow[]) {
  if (!rows.length) return "—";
  return rows
    .map((r) => moneyFromCents(r.cents, safeStr(r.currency) || "AUD"))
    .join(" • ");
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function SavedClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SavedResponse | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);

    try {
      const saved = await fetchJson<SavedResponse>("/api/money/overview");
      setData(saved);
    } catch (e: any) {
      if (!silent) {
        showToast({ message: e?.message ?? "Couldn’t load Saved view." }, 2500);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  useEffect(() => {
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const saved = data?.saved_flow;

  const primaryGoal = useMemo(() => {
    const goals = saved?.goals_preview ?? [];
    return goals.find((g) => g.is_primary) ?? goals[0] ?? null;
  }, [saved]);

  const right = (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip onClick={() => void load(false)}>Refresh</Chip>
      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page
      title="Saved"
      subtitle="Money already set aside."
      right={right}
    >
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6 space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-zinc-500">Saved total</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : renderMoneyRows(saved?.saved_total_by_currency ?? [])}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Goals</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : saved?.goals_count ?? 0}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Investment accounts</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : saved?.investment_accounts_count ?? 0}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Accounts holding savings</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  Positive-balance household accounts.
                </div>
              </div>
              <Link href="/accounts">
                <Chip>Accounts</Chip>
              </Link>
            </div>

            <div className="mt-4 divide-y divide-zinc-100">
              {!loading && (saved?.positive_balance_accounts?.length ?? 0) === 0 ? (
                <div className="py-3 text-sm text-zinc-500">No positive-balance accounts yet.</div>
              ) : null}

              {(saved?.positive_balance_accounts ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {safeStr(a.name) || "Account"}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {safeStr(a.type) || "Account"}
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-zinc-900">
                    {moneyFromCents(
                      Number(a.current_balance_cents || 0),
                      safeStr(a.currency) || "AUD"
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Goals</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  Money being intentionally set aside.
                </div>
              </div>
              <Link href="/money/goals">
                <Chip>Goals</Chip>
              </Link>
            </div>

            {primaryGoal ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs text-zinc-500">Primary focus</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {safeStr(primaryGoal.title) || "Goal"}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {moneyFromCents(
                    Number(primaryGoal.current_cents || 0),
                    safeStr(primaryGoal.currency) || "AUD"
                  )}
                  {" of "}
                  {moneyFromCents(
                    Number(primaryGoal.target_cents || 0),
                    safeStr(primaryGoal.currency) || "AUD"
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {!loading && (saved?.goals_preview?.length ?? 0) === 0 ? (
                <div className="text-sm text-zinc-500">No savings goals set yet.</div>
              ) : null}

              {(saved?.goals_preview ?? []).map((g) => {
                const current = Number(g.current_cents || 0);
                const target = Number(g.target_cents || 0);
                const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm text-zinc-900">
                        {safeStr(g.title) || "Goal"}
                      </div>
                      <div className="shrink-0 text-xs text-zinc-500">
                        {percent}%
                      </div>
                    </div>

                    <div className="mt-2 h-2 w-full rounded-full bg-zinc-200">
                      <div
                        className="h-2 rounded-full bg-zinc-900"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="mt-1 text-xs text-zinc-500">
                      {moneyFromCents(current, safeStr(g.currency) || "AUD")}
                      {" of "}
                      {moneyFromCents(target, safeStr(g.currency) || "AUD")}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-1 text-xs text-zinc-500">
              <div>
                Saved is the household’s set-aside layer: what already exists for safety, goals, or future use.
              </div>
              <div>
                This becomes much stronger as goals, linked accounts, and investment balances are filled out.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}