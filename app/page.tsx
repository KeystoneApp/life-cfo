import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const cookieStore = await cookies();

  const hasSession =
    cookieStore.get("sb-access-token") ||
    cookieStore.get("sb-refresh-token");

  if (hasSession) {
    redirect("/home");
  }

  redirect("/login?next=%2Fhome");
}