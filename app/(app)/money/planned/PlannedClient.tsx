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

type UpcomingBillRow = {
  id: string;
  name: string | null;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_due_at: string | null;
  autopay: boolean | null;
  notes?: string | null;
};

type PlannedOverview = {
  ok: boolean;
  household_id: string | null;
  planned_flow: {
    upcoming_bills_count: number;
    upcoming_bills: UpcomingBillRow[];
    liabilities_count: number;
    liabilities_total_by_currency: MoneyRow[];
    budget_items_count: number;
  };
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function moneyFromCents(cents: number, currency: string) {
  const amt = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amt);
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

function softDate(isoOrDate: string | null | undefined) {
  if (!isoOrDate) return "";
  const ms = Date.parse(isoOrDate);
  if (!Number.isFinite(ms)) {
    const ms2 = Date.parse(isoOrDate + "T00:00:00Z");
    if (!Number.isFinite(ms2)) return "";
    return new Date(ms2).toLocaleDateString();
  }
  return new Date(ms).toLocaleDateString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function PlannedClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlannedOverview | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);

    try {
      const overview = await fetchJson<PlannedOverview>("/api/money/overview");
      setData(overview);
    } catch (e: any) {
      if (!silent) {
        showToast({ message: e?.message ?? "Couldn’t load planned view." }, 2500);
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

  const planned = data?.planned_flow;
  const upcomingBills = planned?.upcoming_bills ?? [];

  const autopayCount = useMemo(() => {
    return upcomingBills.filter((b) => b.autopay === true).length;
  }, [upcomingBills]);

  const nonAutopayCount = useMemo(() => {
    return upcomingBills.filter((b) => b.autopay !== true).length;
  }, [upcomingBills]);

  const right = (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip onClick={() => void load(false)}>Refresh</Chip>
      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page
      title="Planned"
      subtitle="Future commitments, upcoming bills, and known pressure."
      right={right}
    >
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6 space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-zinc-500">Upcoming bills</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : planned?.upcoming_bills_count ?? 0}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Liabilities</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : planned?.liabilities_count ?? 0}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Budget items</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : planned?.budget_items_count ?? 0}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-zinc-500">Liabilities total</div>
              <div className="mt-1 text-sm font-medium text-zinc-900">
                {loading ? "Loading…" : renderMoneyRows(planned?.liabilities_total_by_currency ?? [])}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Upcoming bills</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  What is scheduled in the next 30 days.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href="/connections">
                  <Chip>Connections</Chip>
                </Link>
                <Link href="/money">
                  <Chip>Money</Chip>
                </Link>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Autopay</div>
                <div className="mt-1 text-sm font-medium text-zinc-900">
                  {loading ? "—" : autopayCount}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Manual</div>
                <div className="mt-1 text-sm font-medium text-zinc-900">
                  {loading ? "—" : nonAutopayCount}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Visible next 30 days</div>
                <div className="mt-1 text-sm font-medium text-zinc-900">
                  {loading ? "—" : upcomingBills.length}
                </div>
              </div>
            </div>

            <div className="mt-4 divide-y divide-zinc-100">
              {!loading && upcomingBills.length === 0 ? (
                <div className="py-3 text-sm text-zinc-500">
                  No upcoming bills added yet.
                </div>
              ) : null}

              {upcomingBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {safeStr(bill.name) || "Bill"}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {[
                        bill.next_due_at ? `Due ${softDate(bill.next_due_at)}` : null,
                        safeStr(bill.cadence) || null,
                        bill.autopay ? "Autopay" : "Manual",
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-zinc-900">
                    {moneyFromCents(
                      Number(bill.amount_cents || 0),
                      safeStr(bill.currency) || "AUD"
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-1 text-xs text-zinc-500">
              <div>
                Planned is the household’s forward-pressure layer: what is already committed or expected.
              </div>
              <div>
                It becomes much stronger as recurring bills, liabilities, and future commitments are added.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}