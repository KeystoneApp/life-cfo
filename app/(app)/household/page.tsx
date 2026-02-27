// app/(app)/household/page.tsx
"use client";

import HouseholdClient from "./HouseholdClient";

export const dynamic = "force-dynamic";

export default function HouseholdPage() {
  return <HouseholdClient />;
}