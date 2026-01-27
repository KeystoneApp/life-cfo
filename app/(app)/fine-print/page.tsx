"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

const CONSENT_VERSION = "v1-2026-01-27";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function FinePrintPage() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeStr(params?.get("next")) || "/home";

  const [statusLine, setStatusLine] = useState("Loading…");
  const [userId, setUserId] = useState<string | null>(null);

  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null);
  const [signedName, setSignedName] = useState<string>("");

  const [checked, setChecked] = useState(false);
  const [working, setWorking] = useState(false);

  const alreadyAccepted = useMemo(() => !!acceptedAt, [acceptedAt]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        setStatusLine("Not signed in.");
        return;
      }

      const uid = auth.user.id;
      setUserId(uid);

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("fine_print_accepted_at,fine_print_version,fine_print_signed_name")
        .eq("user_id", uid)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setStatusLine(`Couldn’t load: ${error.message}`);
        return;
      }

      setAcceptedAt(prof?.fine_print_accepted_at ?? null);
      setAcceptedVersion(prof?.fine_print_version ?? null);
      setSignedName(prof?.fine_print_signed_name ?? "");
      setStatusLine("Loaded.");
    })();

    return () => {
      alive = false;
    };
  }, []);

  const accept = async () => {
    if (working) return;

    if (!userId) {
      setStatusLine("Please sign in again.");
      router.push("/login");
      return;
    }

    const name = signedName.trim();
    if (!name) {
      setStatusLine("Please enter your name.");
      return;
    }
    if (!checked) {
      setStatusLine("Please tick the acknowledgement box.");
      return;
    }

    setWorking(true);
    setStatusLine("Saving…");

    try {
      const nowIso = new Date().toISOString();

      // upsert by user_id (since your PK is NOT user_id)
      const { error } = await supabase.from("profiles").upsert(
        {
          user_id: userId,
          fine_print_accepted_at: nowIso,
          fine_print_version: CONSENT_VERSION,
          fine_print_signed_name: name,
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;

      setAcceptedAt(nowIso);
      setAcceptedVersion(CONSENT_VERSION);
      setStatusLine("Accepted.");

      router.push(nextPath);
      router.refresh();
    } catch (e: any) {
      setStatusLine(e?.message ? String(e.message) : "Couldn’t save acceptance.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Page
      title="Fine print"
      subtitle="Plain-language boundaries. Clear trust."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/how-keystone-works")}>How it works</Chip>
          <Chip onClick={() => router.push("/settings")}>Settings</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <div className="text-xs text-zinc-500">{statusLine}</div>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">
                {alreadyAccepted ? "You’ve accepted this." : "Before you continue"}
              </div>

              <div className="text-sm text-zinc-700">
                Keystone is designed to reduce mental load, not create pressure. These boundaries keep it safe and trustworthy.
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="text-xs font-semibold text-zinc-700">Consent version</div>
                <div className="mt-1 text-sm text-zinc-800">{CONSENT_VERSION}</div>

                {alreadyAccepted ? (
                  <div className="mt-2 text-xs text-zinc-500">
                    Accepted: {acceptedAt ? new Date(acceptedAt).toLocaleString() : "—"}
                    {acceptedVersion ? ` • ${acceptedVersion}` : ""}
                    {signedName ? ` • ${signedName}` : ""}
                  </div>
                ) : null}
              </div>

              {!alreadyAccepted ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-700">Your name</div>
                    <input
                      value={signedName}
                      onChange={(e) => setSignedName(e.target.value)}
                      placeholder="Type your full name"
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                    />
                  </div>

                  <label className="flex items-start gap-3 text-sm text-zinc-700">
                    <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1" />
                    <span>I understand Keystone is not professional advice and I’m responsible for my decisions.</span>
                  </label>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button onClick={() => void accept()} disabled={working}>
                      {working ? "Saving…" : "Agree and continue"}
                    </Button>
                    <Chip onClick={() => router.push("/login")}>Cancel</Chip>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Chip onClick={() => router.push(nextPath)}>Continue</Chip>
                  <Chip onClick={() => router.push("/home")}>Home</Chip>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Fine print content can stay as you have it (or the improved version we wrote). */}
      </div>
    </Page>
  );
}
