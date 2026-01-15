"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginClient({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  // If auth callback sends us back with an error, show it nicely
  useEffect(() => {
    const err = searchParams?.get("err") || searchParams?.get("error_description");
    if (err) setStatus(decodeURIComponent(err));
  }, [searchParams]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Signing in...");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(`Login failed: ${error.message}`);
      return;
    }

    setStatus(`Signed in ✅ ${data.user?.email ?? ""}`);

    router.replace(nextPath || "/inbox");
    router.refresh();
  };

  const sendReset = async () => {
    if (!email.trim()) {
      setStatus("Type your email first, then click Reset.");
      return;
    }

    setStatus("Sending reset email...");

    // Keep this as the stable, working reset path:
    const redirectTo = `${window.location.origin}/auth/reset`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      setStatus(`Reset failed: ${error.message}`);
      return;
    }

    setStatus("Reset email sent ✅ Check your inbox.");
  };

  return (
    <main className="min-h-[calc(100vh-0px)] bg-neutral-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-2xl bg-black/90 flex items-center justify-center text-white font-semibold">
            K
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Sign in to access your Keystone workspace.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-6">
          <form onSubmit={signIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-400"
                placeholder="you@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800">
                Password
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-400"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-black text-white py-2.5 font-medium hover:bg-black/90 transition"
            >
              Sign in
            </button>

            <button
              type="button"
              onClick={sendReset}
              className="w-full rounded-xl border border-neutral-300 bg-white py-2.5 font-medium text-neutral-900 hover:bg-neutral-50 transition"
            >
              Forgot password (send reset email)
            </button>

            {status && (
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 text-sm text-neutral-800">
                {status}
              </div>
            )}
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Keystone • values-first decisions and money OS
        </p>
      </div>
    </main>
  );
}
