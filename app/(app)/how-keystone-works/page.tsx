"use client";

import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

export const dynamic = "force-dynamic";

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <div className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-700">
          {n}
        </div>
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
      </div>
      <div className="mt-2 text-sm leading-relaxed text-zinc-700">{body}</div>
    </div>
  );
}

function Diagram() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="text-xs font-semibold text-zinc-600">Diagram</div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Home</div>
          <div className="mt-1 text-sm text-zinc-700">Unload → (later) Orientation signals</div>
        </div>

        <div className="text-center text-xs text-zinc-400">↓</div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Decision flow</div>
          <div className="mt-1 text-sm text-zinc-700">Capture → Framing → Thinking → Decisions → Revisit → Chapters</div>
        </div>

        <div className="text-center text-xs text-zinc-400">↓</div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Money inputs</div>
          <div className="mt-1 text-sm text-zinc-700">Accounts / Bills / Income / Investments / Budget / Transactions</div>
        </div>

        <div className="text-center text-xs text-zinc-400">↓</div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold text-zinc-700">Outcome</div>
          <div className="mt-1 text-sm text-zinc-700">You feel lighter because the right things are safely held.</div>
        </div>
      </div>
    </div>
  );
}

export default function HowKeystoneWorksPage() {
  const router = useRouter();

  return (
    <Page
      title="How it works"
      subtitle="A clear map of what Keystone does (and doesn’t do)."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Home</Chip>
          <Chip onClick={() => router.push("/fine-print")}>Fine print</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">The point</div>
              <div className="text-sm leading-relaxed text-zinc-700">
                Keystone helps you stop carrying mental loops by holding decisions and inputs safely — then resurfacing only what matters,
                when it matters.
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800">
                Keystone’s job is to help you close the app feeling <span className="font-semibold">lighter</span>.
              </div>
            </div>
          </CardContent>
        </Card>

        <Diagram />

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">How to use it</div>

              <div className="grid gap-3">
                <Step
                  n="1"
                  title="Unload on Home"
                  body="Write what’s on your mind. Keystone helps you make it clear. (Later: Home also shows calm orientation signals.)"
                />
                <Step
                  n="2"
                  title="Move it through the decision flow"
                  body="Capture holds raw inputs. Framing turns it into a clear decision. Thinking explores options. Decisions stores the commitment. Revisit resurfaces only what’s due. Chapters honours and closes."
                />
                <Step
                  n="3"
                  title="Use Money pages as inputs"
                  body="Money pages are not spreadsheets — they’re structured inputs that Keystone can later turn into simple, calm orientation."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Rules you can rely on</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>No auto-decisions. You stay in control.</li>
                <li>No saving without your action.</li>
                <li>Revisit is WIP-limited: Keystone avoids backlogs and noise.</li>
                <li>AI is assistive (only helps when asked) and never “commits” on its own.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 pt-1">
          <Chip onClick={() => router.push("/home")}>Done</Chip>
          <Chip onClick={() => router.push("/settings")}>Settings</Chip>
        </div>
      </div>
    </Page>
  );
}
