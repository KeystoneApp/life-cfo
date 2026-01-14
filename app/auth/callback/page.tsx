"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const run = async () => {
      try {
        const code = searchParams.get("code");

        // For PKCE code flow
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        router.replace("/inbox");
      } catch (err: any) {
        console.error(err);
        setMessage("Login failed. Redirecting…");
        setTimeout(() => router.replace("/auth/login"), 1200);
      }
    };

    run();
  }, [router, searchParams]);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Auth Callback
      </h1>
      <p>{message}</p>
    </main>
  );
}
