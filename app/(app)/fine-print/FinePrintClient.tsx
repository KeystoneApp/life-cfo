// app/(app)/fine-print/FinePrintClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type FinePrintClientProps = {
  nextPath: string;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function FinePrintClient({ nextPath }: FinePrintClientProps) {
  const router = useRouter();
  const toastApi: any = useToast();

  // Be compatible with both toast shapes used across the codebase
  const showToast = (args: { title?: string; description?: string; message?: string; variant?: any; action?: any }) => {
    const title = args.title ?? "";
    const description = args.description ?? args.message ?? "";
    const combined = [title, description].filter(Boolean).join(" — ");

    if (toastApi?.showToast) {
      // many of our pages pass { message }
      toastApi.showToast({ message: combined || "Done." });
      return;
    }

    if (toastApi?.toast) {
      toastApi.toast({
        title: title || "Done",
        description,
        variant: args.variant,
        action: args.action,
      });
    }
  };

  const VERSION = "v1";

  const [name, setName] = useState("");
  const [working, setWorking] = useState(false);
  const [statusLine, setStatusLine] = useState<string>("");

  const canSave = useMemo(() => name.trim().length >= 2 && !working, [name, working]);

  const save = async () => {
    if (!canSave) {
      setStatusLine("Please type your name to continue.");
      showToast({ title: "Add your name", description: "Please type your name to continue." });
      return;
    }

    setWorking(true);
    setStatusLine("Saving…");

    try {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr || !auth?.user) {
        setStatusLine("Not signed in.");
        router.push("/login");
        return;
      }

      // ✅ IMPORTANT: profiles row is keyed by `id` (auth uid)
      // ✅ ALSO IMPORTANT: do NOT include columns that don’t exist (e.g. updated_at)
      const payload = {
        id: auth.user.id,
        fine_print_accepted_at: new Date().toISOString(),
        fine_print_version: VERSION,
        fine_print_signed_name: name.trim(),
      };

      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
      if (error) throw error;

      setStatusLine("Saved ✅ Redirecting…");
      showToast({ title: "Saved", description: "Thank you. You’re all set." });

      router.push(nextPath || "/home");
      router.refresh();
    } catch (e: any) {
      const msg = safeStr(e?.message) || "Something went wrong.";
      setStatusLine(`Couldn’t save: ${msg}`);
      showToast({ title: "Couldn’t save", description: msg });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
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
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
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
            <div className="text-sm font-semibold text-zinc-900">AI boundaries</div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
              <li>AI helps when you ask.</li>
              <li>No auto-decisions. No auto-saving.</li>
              <li>Summaries are preview-first, then explicitly attached by you.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Signature</div>
            <div className="text-sm text-zinc-700">Type your name once to confirm you understand these boundaries.</div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={() => void save()} disabled={!canSave}>
                {working ? "Saving…" : "Save and continue"}
              </Button>
              <Chip onClick={() => router.push("/login")} className="text-zinc-500">
                Cancel
              </Chip>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500">Version: {VERSION}</div>
              {statusLine ? <div className="text-xs text-zinc-500">{statusLine}</div> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
