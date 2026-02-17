// app/(app)/decisions/page.tsx
"use client";

import { Suspense } from "react";
import ThinkingClient from "@/app/(app)/thinking/ThinkingClient";

export const dynamic = "force-dynamic";

export default function DecisionsPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto w-full max-w-[760px] p-6 text-sm text-zinc-600">Loading…</div>}
    >
      <ThinkingClient surface="decisions" />
    </Suspense>
  );
}
