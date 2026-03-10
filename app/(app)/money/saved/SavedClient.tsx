"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

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
};

type SavedOverview = {
  saved_flow: {
    saved_total_by_currency: MoneyRow[];
    positive_balance_accounts: AccountRow[];
    goals_count: number;
    goals_preview: GoalRow[];
    investment_accounts_count: number;
  };
};

function money(cents: number, currency: string) {
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

export default function SavedClient() {
  const [data, setData] = useState<SavedOverview | null>(null);

  useEffect(() => {
    fetch("/api/money/overview")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const saved = data?.saved_flow;

  return (
    <Page
      title="Saved"
      subtitle="Money already set aside."
      right={
        <div className="flex gap-2">
          <Link href="/money">
            <Chip>Back to Money</Chip>
          </Link>
        </div>
      }
    >
      <div className="mx-auto max-w-[860px] space-y-4 px-4 sm:px-6">

        <Card>
          <CardContent>
            <div className="text-xs text-zinc-500">Saved total</div>

            <div className="mt-1 text-lg font-semibold">
              {saved?.saved_total_by_currency
                ?.map((r) => money(r.cents, r.currency))
                .join(" • ") || "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">
                  Accounts with savings
                </div>

                <div className="text-xs text-zinc-500">
                  Positive balances across household accounts
                </div>
              </div>
            </div>

            <div className="mt-4 divide-y">

              {saved?.positive_balance_accounts?.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {a.name || "Account"}
                    </div>

                    <div className="text-xs text-zinc-500">
                      {a.type || "Account"}
                    </div>
                  </div>

                  <div className="text-sm font-semibold">
                    {money(
                      Number(a.current_balance_cents || 0),
                      a.currency || "AUD"
                    )}
                  </div>
                </div>
              ))}

            </div>

          </CardContent>
        </Card>

        <Card>
          <CardContent>

            <div className="text-sm font-semibold">Goals</div>

            <div className="mt-3 space-y-3">

              {saved?.goals_preview?.map((g) => {
                const progress =
                  (Number(g.current_cents || 0) /
                    Number(g.target_cents || 1)) *
                  100;

                return (
                  <div key={g.id}>

                    <div className="flex items-center justify-between">
                      <div className="text-sm">{g.title}</div>

                      <div className="text-xs text-zinc-500">
                        {Math.round(progress)}%
                      </div>
                    </div>

                    <div className="mt-1 h-2 w-full rounded bg-zinc-200">
                      <div
                        className="h-2 rounded bg-zinc-900"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                  </div>
                );
              })}

            </div>

          </CardContent>
        </Card>

      </div>
    </Page>
  );
}