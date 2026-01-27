// app/(app)/fine-print/FinePrintClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

// Bump this whenever you materially change the fine print.
const FINE_PRINT_VERSION = "2026-01-27";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function FinePrintClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const toastApi: any = useToast();

  const showToast =
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

  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);

  const canAccept = useMemo(() => name.trim().length >= 2, [name]);

  const accept = async () => {
    if (working) return;
    if (!canAccept) {
      showToast({ title: "Add your name", description: "Please type your name to sign once." });
      return;
    }

    setWorking(true);
    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !auth?.user) {
        showToast({ title: "Not signed in", description: "Please sign in again." });
        router.push("/login");
        return;
      }

      const uid = auth.user.id;

      // Ensure a profiles row exists, then update acceptance fields.
      const { data: existing, error: selErr } = await supabase
        .from("profiles")
        .select("id,user_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (selErr) throw selErr;

      const payload = {
        user_id: uid,
        fine_print_accepted_at: new Date().toISOString(),
        fine_print_version: FINE_PRINT_VERSION,
        fine_print_signed_name: name.trim(),
      };

      if (existing?.id) {
        const { error: updErr } = await supabase.from("profiles").update(payload).eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("profiles").insert(payload);
        if (insErr) throw insErr;
      }

      showToast({ title: "Signed", description: "Thanks — you’re good to go." });
      router.push(nextPath || "/home");
      router.refresh();
    } catch (e: any) {
      showToast({ title: "Couldn’t save", description: e?.message ?? "Something went wrong." });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-zinc-900">One-time signature</div>
              <div className="text-sm text-zinc-700">
                Type your name to confirm you understand these boundaries.
              </div>
              <div className="text-xs text-zinc-500">Version: {FINE_PRINT_VERSION}</div>
            </div>
            <div className="flex items-center gap-2">
              <Chip onClick={() => router.push("/how-keystone-works")}>How it works</Chip>
            </div>
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
          />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={() => void accept()} disabled={working || !canAccept}>
              {working ? "Saving…" : "I understand — continue"}
            </Button>
            <Chip onClick={() => router.push("/settings")}>Settings</Chip>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
