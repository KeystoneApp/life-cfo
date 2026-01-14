"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    const run = async () => {
      try {
        // Supabase magic link / OAuth callbacks often include ?code=
        const code = params.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // If already signed in (or after exchange), send them to the app
        router.replace("/inbox");
      } catch (e: any) {
        setMsg(e?.message ?? "Sign-in failed. Please try again.");
      }
    };

    run();
  }, [params, router]);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Auth Callback</h1>
      <p style={{ marginTop: 12 }}>{msg}</p>
    </main>
  );
}
