// app/(app)/accounts/page.tsx
import { Suspense } from "react";
import AccountsPage from "./AccountsPage";

export const dynamic = "force-dynamic";

export default function AccountsRoutePage() {
  return (
    <Suspense
      fallback={<div className="mx-auto w-full max-w-[860px] p-6 text-sm text-zinc-600">Loading…</div>}
    >
      <AccountsPage />
    </Suspense>
  );
}