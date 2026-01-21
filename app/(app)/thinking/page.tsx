// app/(app)/thinking/page.tsx
"use client";

import ThinkingClient from "./ThinkingClient";

export const dynamic = "force-dynamic";

export default function ThinkingPage() {
  return <ThinkingClient />;
}
