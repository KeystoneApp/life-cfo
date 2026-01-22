// app/(app)/thinking/page.tsx
"use client";

import { Suspense } from "react";
import ThinkingClient from "./ThinkingClient";

export const dynamic = "force-dynamic";

export default function ThinkingPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-[760px] p-6 text-sm text-zinc-600">Loading…</div>}>
      <ThinkingClient />
    </Suspense>
  );
}
