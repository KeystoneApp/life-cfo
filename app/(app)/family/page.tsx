// app/(app)/family/page.tsx
"use client";

import FamilyClient from "./FamilyClient";

export const dynamic = "force-dynamic";

export default function FamilyPage() {
  return <FamilyClient />;
}
