// app/(app)/fine-print/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import FinePrintClient from "./FinePrintClient";

export const dynamic = "force-dynamic";

type Profile = {
  fine_print_accepted_at: string | null;
  fine_print_version: string | null;
  fine_print_signed_name: string | null;
};

function softDateTime(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}

export default function FinePrintPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextPath = useMemo(() => {
    const raw = sp.get("next");
    if (!raw) return "/home";
    // basic safety: keep it internal
    if (!raw.startsWith("/")) return "/home";
    return raw;
  }, [sp]);

  const [status, setStatus] = useState<"loading" | "signed_out" | "ready">("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setStatus("loading");
      setLoadError(null);

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (authErr || !auth?.user) {
        setStatus("signed_out");
        setProfile(null);
        return;
      }

      const uid = auth.user.id;

      const { data, error } = await supabase
        .from("profiles")
        .select("fine_print_accepted_at,fine_print_version,fine_print_signed_name")
        .eq("user_id", uid)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setLoadError(error.message);
        setProfile(null);
        setStatus("ready");
        return;
      }

      setProfile((data ?? null) as any);
      setStatus("ready");
    })();

    return () => {
      alive = false;
    };
  }, []);

  const acceptedAt = profile?.fine_print_accepted_at ?? null;
  const signedName = profile?.fine_print_signed_name ?? null;
  const signedVersion = profile?.fine_print_version ?? null;

  const isAccepted = !!acceptedAt;

  return (
    <Page
      title="Fine print"
      subtitle="Plain-language boundaries. Trust comes from clarity."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/how-keystone-works")}>How it works</Chip>
          <Chip onClick={() => router.push("/settings")}>Settings</Chip>
          <Chip onClick={() => router.push("/home")}>Home</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        {/* Status */}
        {status === "loading" ? <div className="text-xs text-zinc-500">Loading…</div> : null}
        {status === "signed_out" ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Sign in required</div>
                <div className="text-sm text-zinc-700">Please sign in to view and accept the fine print.</div>
                <div className="pt-1">
                  <Chip onClick={() => router.push("/login")}>Go to login</Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* ✅ Signature area:
            - If NOT accepted yet → show signature client
            - If accepted → show read-only “Signed” record (no signature box)
        */}
        {status === "ready" ? (
          isAccepted ? (
            <Card className="border-zinc-200 bg-white">
              <CardContent>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-zinc-900">Signed</div>
                    <div className="text-sm text-zinc-700">
                      {signedName ? (
                        <>
                          Name: <span className="font-medium text-zinc-900">{signedName}</span>
                        </>
                      ) : (
                        "Name: —"
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">Signed at: {acceptedAt ? softDateTime(acceptedAt) : "—"}</div>
                    <div className="text-xs text-zinc-500">Version: {signedVersion || "—"}</div>
                  </div>

                  {/* Optional: keep this calm; if you want re-sign later, do it from Settings */}
                  <div className="flex items-center gap-2">
                    <Chip onClick={() => router.push(nextPath)} title="Continue">
                      Continue
                    </Chip>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <FinePrintClient nextPath={nextPath} />
          )
        ) : null}

        {loadError ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="text-sm font-semibold text-zinc-900">Couldn’t load profile</div>
              <div className="mt-1 text-xs text-zinc-500">{loadError}</div>
              <div className="mt-2 text-sm text-zinc-700">
                You can still read the fine print below. If acceptance isn’t recognized, try refreshing.
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Content (always readable) */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">What Keystone is</div>
              <div className="text-sm text-zinc-700">
                Keystone is a calm place to hold decisions and inputs so you can see life more clearly and stop carrying mental loops.
              </div>
              <div className="text-sm text-zinc-700">It’s built for orientation and repeatable good decisions — not dashboards, not hustle.</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">What Keystone is not</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>Not financial, legal, medical, or tax advice.</li>
                <li>Not a forecast or guarantee.</li>
                <li>Not accounting software.</li>
                <li>Not a replacement for professional help when you need it.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Money pages: “picture”, not precision</div>
              <div className="text-sm text-zinc-700">
                Accounts, Bills, Income, Investments, Budget and Transactions are inputs that Keystone converts into a simple monthly picture.
                The goal is clarity — not perfect accuracy.
              </div>
              <div className="text-sm text-zinc-700">If something looks off, treat it as a prompt to check your inputs — not a truth statement.</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">AI boundaries (V1 posture)</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>Keystone should speak sparingly: to ground, reflect, and clarify.</li>
                <li>Chats do not auto-commit into durable memory without your explicit action.</li>
                <li>Summaries are user-invited: preview first, then explicitly attach to a decision if you choose.</li>
                <li>Automation stays background; no urgent or pressuring language.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Your control</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>You decide what gets saved.</li>
                <li>You decide what gets revisited.</li>
                <li>You can keep things rough and incomplete — it still helps.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Privacy & safety (simple statement)</div>
              <div className="text-sm text-zinc-700">
                Keystone is designed to minimize cognitive load and avoid manipulative patterns. If anything feels noisy, it’s a bug.
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="pt-1">
          <Chip onClick={() => router.push("/home")}>Done</Chip>
        </div>
      </div>
    </Page>
  );
}
