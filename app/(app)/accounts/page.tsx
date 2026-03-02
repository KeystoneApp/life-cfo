"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";

type AccountRow = {
  id: string;
  name: string | null;
  provider: string | null;
  type: string | null;
  status: string | null;
  archived: boolean | null;
  currency: string | null;
  current_balance_cents: number | null;
  updated_at: string | null;
  created_at: string | null;
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
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function AccountsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [q, setQ] = useState("");

  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const open = sp?.get("open");
    if (open) setOpenId(open);
  }, [sp]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = showArchived ? accounts : accounts.filter((a) => !a.archived);

    if (!query) return base;

    return base.filter((a) => {
      const hay = [safeStr(a.name), safeStr(a.provider), safeStr(a.type), safeStr(a.status), safeStr(a.currency)].join(" ").toLowerCase();
      return hay.includes(query);
    });
  }, [accounts, q, showArchived]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const data = await fetchJson<{ ok: boolean; accounts: AccountRow[] }>("/api/money/accounts");

        if (!alive) return;
        setAccounts(data.accounts ?? []);
      } catch (e: any) {
        if (!alive) return;
        showToast({ message: e?.message ?? "Couldn’t load accounts." }, 2500);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [showToast]);

  const cardClass = "border-zinc-200 bg-white";

  return (
    <Page title="Accounts" subtitle="Your accounts, kept simple.">
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/money">
              <Chip>Back to Money</Chip>
            </Link>
            <Chip onClick={() => setShowArchived((v) => !v)} title="Toggle archived">
              {showArchived ? "Showing archived" : "Active only"}
            </Chip>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/connections">
              <Chip>Manage connections</Chip>
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {/* Quick find (deep-link via AssistedSearch) */}
          <Card className={cardClass}>
            <CardContent className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Find an account</div>
              <div className="text-xs text-zinc-500">Search-first. Tap to open.</div>
              <AssistedSearch scope="accounts" placeholder="e.g. ‘Savings’, ‘Everyday’, ‘Bills Buffer’…" />
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">Accounts</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {loading ? "Loading…" : accounts.length ? (showArchived ? "All accounts" : "Active accounts") : "No accounts yet."}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search within this list…"
                  className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />
                {q.trim() ? <Chip onClick={() => setQ("")}>Clear</Chip> : null}
              </div>

              <div className="mt-3 divide-y divide-zinc-100">
                {filtered.map((a) => {
                  const cur = safeStr(a.currency) || "AUD";
                  const cents = typeof a.current_balance_cents === "number" ? a.current_balance_cents : 0;
                  const isOpen = openId === a.id;

                  const subtitle = [
                    safeStr(a.provider) || "Manual",
                    safeStr(a.type) || null,
                    a.archived ? "Archived" : null,
                    a.updated_at ? `Updated ${softDate(a.updated_at)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" • ");

                  return (
                    <div key={a.id} className="py-3">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 text-left"
                        onClick={() => {
                          const next = isOpen ? null : a.id;
                          setOpenId(next);

                          const u = new URL(window.location.href);
                          if (next) u.searchParams.set("open", next);
                          else u.searchParams.delete("open");
                          router.replace(u.pathname + (u.search ? u.search : ""));
                        }}
                        aria-expanded={isOpen}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">{safeStr(a.name) || "Untitled account"}</div>
                          <div className="truncate text-xs text-zinc-500">{subtitle || "—"}</div>
                        </div>

                        <div className="shrink-0 text-sm font-semibold text-zinc-900">{moneyFromCents(cents, cur)}</div>
                      </button>

                      {isOpen ? (
                        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
                          <div className="flex flex-wrap gap-2">
                            <Chip title="Provider">{safeStr(a.provider) || "manual"}</Chip>
                            {a.type ? <Chip title="Type">{safeStr(a.type)}</Chip> : null}
                            {a.status ? <Chip title="Status">{safeStr(a.status)}</Chip> : null}
                            <Chip title="Currency">{cur}</Chip>
                            {a.created_at ? <Chip title="Created">{softDate(a.created_at)}</Chip> : null}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Chip
                              onClick={() => {
                                setOpenId(null);
                                const u = new URL(window.location.href);
                                u.searchParams.delete("open");
                                router.replace(u.pathname + (u.search ? u.search : ""));
                              }}
                            >
                              Done
                            </Chip>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {!loading && filtered.length === 0 ? <div className="py-3 text-sm text-zinc-500">No matches.</div> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}