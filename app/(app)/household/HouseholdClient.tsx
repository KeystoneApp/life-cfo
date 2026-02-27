// app/(app)/household/HouseholdClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

type HouseholdItem = { id: string; name: string; role: string };

type MemberRow = {
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
};

export const dynamic = "force-dynamic";

function canEditMembers(role: string | null) {
  return role?.toLowerCase() === "owner";
}

function canRename(role: string | null) {
  const r = role?.toLowerCase();
  return r === "owner" || r === "editor";
}

export default function HouseholdClient() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [statusLine, setStatusLine] = useState("Loading…");

  const [households, setHouseholds] = useState<HouseholdItem[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const active = useMemo(() => {
    if (!activeHouseholdId) return null;
    return households.find((h) => h.id === activeHouseholdId) ?? null;
  }, [households, activeHouseholdId]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/households");
        const json = await res.json();
        if (!json?.ok) return;

        setHouseholds(json.households ?? []);
        setActiveHouseholdId(json.active_household_id ?? null);
        setStatusLine("Updated.");
      } catch {
        setStatusLine("Couldn’t load.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!activeHouseholdId) return;

    const loadMembers = async () => {
      setMembersLoading(true);
      try {
        const res = await fetch(
          `/api/households/members?household_id=${activeHouseholdId}`
        );
        const json = await res.json();
        setMembers(json?.members ?? []);
      } catch {
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    };

    loadMembers();
  }, [activeHouseholdId]);

  const myRole = active?.role ?? null;
  const allowMemberEdits = canEditMembers(myRole);

  return (
    <Page title="Household" subtitle="Where membership and permissions live.">
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="text-xs text-zinc-500">
          {loading ? "Loading…" : statusLine}
        </div>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">
              Household details
            </div>

            {active && (
              <>
                <div className="text-sm text-zinc-900">{active.name}</div>
                <div className="text-xs text-zinc-500">
                  Your role: {active.role}
                </div>
                <div className="text-xs text-zinc-500">
                  <button
                    onClick={() => navigator.clipboard.writeText(active.id)}
                    className="underline underline-offset-2"
                  >
                    Copy Household ID
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">
              Members
            </div>

            {membersLoading ? (
              <div className="text-sm text-zinc-600">Loading…</div>
            ) : members.length === 0 ? (
              <div className="text-sm text-zinc-600">
                No members found.
              </div>
            ) : (
              members.map((m) => (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium text-zinc-900">
                      {m.email ?? m.user_id}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {m.role}
                    </div>
                  </div>

                  {allowMemberEdits && (
                    <Chip>Owner</Chip>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}