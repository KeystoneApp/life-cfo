// app/(app)/chapters/page.tsx
import ChaptersClient from "./ChaptersClient";

export const dynamic = "force-dynamic";

export default function ChaptersPage() {
  return <ChaptersClient />;
}
