// app/(app)/framing/page.tsx
import { Suspense } from "react";
import FramingClient from "./FramingClient";

export const dynamic = "force-dynamic";

export default function FramingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[760px] p-6">
          <div className="text-sm text-zinc-600">Loading…</div>
        </div>
      }
    >
      <FramingClient />
    </Suspense>
  );
}
