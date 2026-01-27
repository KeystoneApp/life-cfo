// app/(app)/fine-print/page.tsx
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import FinePrintClient from "./FinePrintClient";

export const dynamic = "force-dynamic";

export default function FinePrintPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath =
    typeof searchParams?.next === "string" && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/home";

  return (
    <Page
      title="Fine print"
      subtitle="Plain-language boundaries. Trust comes from clarity."
      right={
        <div className="flex items-center gap-2">
          <Link href="/how-keystone-works" className="no-underline">
            <Chip>How it works</Chip>
          </Link>
          <Link href="/settings" className="no-underline">
            <Chip>Settings</Chip>
          </Link>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        {/* Acceptance + signature (client) */}
        <FinePrintClient nextPath={nextPath} />

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">What Keystone is</div>
              <div className="text-sm text-zinc-700">
                Keystone is a calm place to hold decisions and inputs so you can see life more clearly and stop carrying mental loops.
              </div>
              <div className="text-sm text-zinc-700">
                It’s built for orientation and repeatable good decisions — not dashboards, not hustle.
              </div>
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
              <div className="text-sm font-semibold text-zinc-900">Money pages: picture, not precision</div>
              <div className="text-sm text-zinc-700">
                Accounts, Bills, Income, Investments, Budget and Transactions are inputs that Keystone converts into a simple monthly picture.
                The goal is clarity — not perfect accuracy.
              </div>
              <div className="text-sm text-zinc-700">
                If something looks off, treat it as a prompt to check your inputs — not a truth statement.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">AI boundaries</div>
              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                <li>AI helps when you ask. It doesn’t act on your behalf.</li>
                <li>Nothing is auto-saved as durable memory without your explicit action.</li>
                <li>No urgency language, no pressure, no manipulative patterns.</li>
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
                <li>You can keep things rough — it still helps.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="pt-1">
          <Link href={nextPath} className="no-underline">
            <Chip>Done</Chip>
          </Link>
        </div>
      </div>
    </Page>
  );
}
