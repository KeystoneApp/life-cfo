// app/(app)/capture/page.tsx
import { Suspense } from "react";
import CaptureClient from "./CaptureClient";

export const dynamic = "force-dynamic";

export default function CapturePage() {
  return (
    <Suspense fallback={null}>
      <CaptureClient />
    </Suspense>
  );
}
