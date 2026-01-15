"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [status, setStatus] = useState<string>("Checking session...");
  const [ready, setReady] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        // This usually means no active session
        setStatus("No active reset session found. Please click the reset link from your email again.");
        setReady(false);
        return;
      }

      if (!data?.user) {
        setStatus("No active reset session found. Please click the reset link from your email again.");
        setReady(false);
        return;
      }

      setStatus("Ready ✅ Enter a new password.");
      setReady(true);
    };

    run();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pw.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setStatus("Passwords do not match.");
      return;
    }

    setStatus("Updating password...");
    const { error } = await supabase.auth.updateUser({ password: pw });

    if (error) {
      setStatus(`Password update failed: ${error.message}`);
      return;
    }

    setStatus("Password updated ✅ Redirecting to Inbox...");
    // Optional: you can sign out if you prefer forcing a fresh login:
    // await supabase.auth.signOut();

    setTimeout(() => {
      router.replace("/inbox");
      router.refresh();
    }, 800);
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h1>Reset password</h1>
      <p>{status}</p>

      {ready && (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <label>
            New password
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              autoFocus
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
            />
          </label>

          <button type="submit" style={{ padding: 10 }}>
            Set new password
          </button>
        </form>
      )}
    </main>
  );
}
