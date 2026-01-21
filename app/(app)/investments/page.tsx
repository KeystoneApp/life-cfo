// app/(app)/investments/page.tsx
"use client";

import { Page } from "@/components/Page";

export const dynamic = "force-dynamic";

export default function InvestmentsPage() {
  return (
    <Page title="Investments" subtitle="Inputs only. This will feed Home orientation later.">
      <div className="mx-auto w-full max-w-[760px]" />
    </Page>
  );
}
