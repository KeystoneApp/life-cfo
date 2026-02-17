"use client";

import { Suspense } from "react";
import DecisionsClient from "./DecisionsClient";

export const dynamic = "force-dynamic";

export default function DecisionsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[760px] p-6 text-sm text-zinc-600">
          Loading…
        </div>
      }
    >
      <DecisionsClient />
    </Suspense>
  );
}
