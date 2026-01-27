import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

const REQUIRED_FINE_PRINT_VERSION = "v1-2026-01-27";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Skip public / system routes early
  if (
    path.startsWith("/api") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico" ||
    path === "/robots.txt" ||
    path === "/sitemap.xml"
  ) {
    return NextResponse.next();
  }

  const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const anon = envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // Prepare response so Supabase can attach cookies if needed
  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // Get signed-in user
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  // If not signed in, do not gate here
  if (!user) return res;

  // Pages allowed without fine-print acceptance
  const allowWithoutConsent = new Set([
    "/fine-print",
    "/how-keystone-works",
    "/settings",
    "/settings/delete",
  ]);

  if (allowWithoutConsent.has(path)) return res;

  // Check fine-print acceptance
  const { data: prof } = await supabase
    .from("profiles")
    .select("fine_print_accepted_at,fine_print_version")
    .eq("user_id", user.id)
    .maybeSingle();

  const accepted =
    !!prof?.fine_print_accepted_at &&
    prof?.fine_print_version === REQUIRED_FINE_PRINT_VERSION;

  if (!accepted) {
    const next = encodeURIComponent(path);
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/fine-print";
    redirectUrl.search = `?next=${next}`;
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: [
    // Run middleware on all app routes except static assets
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
