// app/(app)/accounts/page.tsx
"use client";

import { Suspense } from "react";
import AccountsPage from "./AccountsPage";

// Ensure the route never tries to pre-render statically
export const dynamic = "force-dynamic";

export default function AccountsRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6 py-6 text-sm text-zinc-600">
          Loading…
        </div>
      }
    >
      <AccountsPage />
    </Suspense>
  );
}