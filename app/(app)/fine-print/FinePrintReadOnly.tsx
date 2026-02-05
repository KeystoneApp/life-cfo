// app/(app)/fine-print/FinePrintReadOnly.tsx
"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, Chip } from "@/components/ui";

function formatWhen(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function FinePrintReadOnly({
  signedName,
  signedAt,
  version,
}: {
  signedName: string;
  signedAt: string;
  version: string;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">
                Fine print accepted
              </div>
              <div className="text-sm text-zinc-700">
                You’ve already reviewed and accepted Keystone’s boundaries.
              </div>
            </div>

            <div className="grid gap-2 text-sm text-zinc-700">
              <div>
                <span className="font-medium text-zinc-900">Signed by:</span>{" "}
                {signedName || "—"}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Date:</span>{" "}
                {formatWhen(signedAt)}
              </div>
              <div>
                <span className="font-medium text-zinc-900">Version:</span>{" "}
                {version || "—"}
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-2">
              <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
              <Chip onClick={() => router.push("/settings")}>Settings</Chip>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                What Keystone is
              </div>
              <div className="text-sm text-zinc-700">
                Keystone is a calm decision system.
              </div>
              <div className="text-sm text-zinc-700">
                It brings together your information — decisions, money, notes,
                and timing — with AI that helps you understand what’s going on,
                answer questions about your life, and make informed choices.
              </div>
              <div className="text-sm text-zinc-700">
                Keystone’s job is not to push you to act. It’s to make sure the
                right information is available, connected, and understandable,
                so decisions feel clearer and lighter.
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                What Keystone is not
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
                <li>Not financial, legal, medical, or tax advice.</li>
                <li>Not a forecast or guarantee.</li>
                <li>Not accounting software.</li>
                <li>Not a replacement for professional help when you need it.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                AI boundaries
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
                <li>AI helps when you ask.</li>
                <li>No auto-decisions. No auto-saving.</li>
                <li>
                  Summaries are preview-first, then explicitly attached by you.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
