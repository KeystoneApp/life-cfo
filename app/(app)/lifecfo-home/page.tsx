// app/(app)/lifecfo-home/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type AskState = "idle" | "asking" | "answered" | "error";

type AskApiResponse = {
  answer?: string;
  action?: "open_bills" | "open_money" | "open_decisions" | "open_review" | "open_chapters" | "none";
  suggested_next?: "none" | "create_capture" | "open_thinking";
  capture_seed?: { title: string; prompt: string; notes: string[] } | null;
  error?: string;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function actionToHref(action: AskApiResponse["action"]): string | null {
  switch (action) {
    case "open_money":
      return "/money";
    case "open_bills":
      return "/bills";
    case "open_decisions":
      return "/decisions";
    case "open_review":
      return "/revisit";
    case "open_chapters":
      return "/chapters";
    default:
      return null;
  }
}

export default function LifeCFOHomePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [userId, setUserId] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [state, setState] = useState<AskState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [resp, setResp] = useState<AskApiResponse | null>(null);
  const lastAskedRef = useRef<string>("");

  // minimal auth: userId only
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user?.id) {
        setUserId(null);
        setAuthStatus("signed_out");
        return;
      }

      setUserId(data.user.id);
      setAuthStatus("signed_in");
    })();

    return () => {
      alive = false;
    };
  }, []);

  const canSubmit = useMemo(() => {
    return authStatus === "signed_in" && !!userId && text.trim().length > 0 && state !== "asking";
  }, [authStatus, userId, text, state]);

  const actionHref = useMemo(() => actionToHref(resp?.action), [resp?.action]);

  async function ask() {
    const q = text.trim();
    if (!q) return;

    if (authStatus !== "signed_in" || !userId) {
      setState("error");
      setErrorMsg("Please sign in to ask Life CFO.");
      return;
    }

    setState("asking");
    setErrorMsg(null);
    setResp(null);
    lastAskedRef.current = q;

    try {
      const res = await fetch("/api/home/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, question: q }),
      });

      const json = (await res.json().catch(() => ({}))) as AskApiResponse;

      if (!res.ok) {
        setState("error");
        setErrorMsg(json?.error ? String(json.error) : "I couldn’t answer that right now.");
        return;
      }

      setResp(json);
      setState("answered");
    } catch (e: any) {
      setState("error");
      setErrorMsg(e?.message ? String(e.message) : "I couldn’t answer that right now.");
    }
  }

  async function copyToClipboard(v: string) {
    const s = v.trim();
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s);
      toast({ title: "Copied", description: "Paste it anywhere you like." });
    } catch {
      toast({ title: "Couldn’t copy", description: "Your browser blocked clipboard access." });
    }
  }

  function clear() {
    setText("");
    setResp(null);
    setErrorMsg(null);
    setState("idle");
    lastAskedRef.current = "";
  }

  return (
    <Page
      title="Life CFO"
      subtitle={<span className="text-sm">Ask anything. I’ll answer first. Saving is always optional.</span>}
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/lifecfo-home-v2")} className="text-xs" title="Open v2 route">
            v2 route
          </Chip>
          <Chip onClick={() => router.push("/home")} className="text-xs" title="Keystone Home">
            Keystone
          </Chip>
        </div>
      }
    >
      <div className="mx-auto max-w-[760px] space-y-4">
        {/* 🔴 BUILD STAMP: if you don't see this, you're not running this file */}
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-600">
          BUILD STAMP: LIFECFO_HOME_ANSWER_FIRST__2026-02-06__A
        </div>

        <Card>
          <CardContent className="space-y-2">
            <div className="text-sm font-medium">Status</div>
            {authStatus === "loading" ? (
              <div className="text-sm opacity-80">Checking sign-in…</div>
            ) : authStatus === "signed_out" ? (
              <div className="text-sm opacity-80">You’re signed out. Sign in to ask questions.</div>
            ) : (
              <div className="text-sm opacity-80">You’re signed in.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">What’s on your mind?</div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. ‘Husband and I need to know how to best manage our accounts…’"
                className="min-h-[120px] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                disabled={authStatus !== "signed_in"}
                onKeyDown={(e) => {
                  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                  if (cmdOrCtrl && e.key === "Enter") {
                    e.preventDefault();
                    void ask();
                    return;
                  }

                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask();
                  }
                }}
              />
              <div className="text-xs opacity-70">Enter to ask • Shift+Enter for a new line • Cmd/Ctrl+Enter also works</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={ask} disabled={!canSubmit}>
                {state === "asking" ? "Asking…" : "Ask"}
              </Button>

              <Button variant="ghost" onClick={() => copyToClipboard(text)} disabled={text.trim().length === 0}>
                Copy
              </Button>

              <Button variant="ghost" onClick={clear} disabled={state === "asking"}>
                Clear
              </Button>

              <div className="ml-auto text-xs opacity-70">
                {state === "idle" && "Ready"}
                {state === "asking" && "Thinking…"}
                {state === "answered" && "Answered"}
                {state === "error" && "Couldn’t answer"}
              </div>
            </div>
          </CardContent>
        </Card>

        {state === "error" ? (
          <Card>
            <CardContent className="space-y-2">
              <div className="text-sm font-medium">Couldn’t answer</div>
              <div className="text-sm opacity-80">{errorMsg || "Unknown error."}</div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Chip className="text-xs" title="Try again" onClick={() => void ask()}>
                  Try again
                </Chip>
                <Chip className="text-xs" title="Clear" onClick={clear}>
                  Clear
                </Chip>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {state === "answered" && resp ? (
          <Card>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Life CFO</div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed opacity-90">{safeStr(resp.answer) || "—"}</div>
                <div className="text-xs opacity-70">
                  <span className="font-medium">You asked:</span> {lastAskedRef.current}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {actionHref ? (
                  <Chip className="text-xs" title="Open suggested page" onClick={() => router.push(actionHref)}>
                    Open
                  </Chip>
                ) : null}

                <Chip className="text-xs" title="Copy answer" onClick={() => copyToClipboard(safeStr(resp.answer))}>
                  Copy answer
                </Chip>
              </div>

              <div className="pt-2">
                <div className="mb-2 text-xs font-medium opacity-70">Optional next step</div>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    className="text-xs"
                    title="Create a Capture (you’ll paste it)"
                    onClick={async () => {
                      await copyToClipboard(lastAskedRef.current);
                      router.push("/capture");
                    }}
                  >
                    Create a capture →
                  </Chip>

                  <Chip
                    className="text-xs"
                    title="Save as a Decision (you’ll paste it)"
                    onClick={async () => {
                      await copyToClipboard(lastAskedRef.current);
                      router.push("/framing");
                    }}
                  >
                    Save as a decision →
                  </Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Page>
  );
}
