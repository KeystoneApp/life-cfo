"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type AskActionHref = string | null;
type AskStatus = "idle" | "loading" | "done" | "error";

export type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  tone?: string | null;
  verdict?: string | null;
  actionHref?: AskActionHref;
};

type AskState = {
  open: boolean;
  status: AskStatus;
  draft: string;
  messages: AskMessage[];
  errorMessage: string | null;
  currentPath: string;
  currentScope: string | null;
};

type AskContextValue = AskState & {
  setDraft: (value: string) => void;
  openAsk: () => void;
  closeAsk: () => void;
  toggleAsk: () => void;
  clearAsk: () => void;
  submitAsk: (question?: string) => Promise<void>;
  retryLast: () => Promise<void>;
};

const AskContext = createContext<AskContextValue | null>(null);

function makeId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {}
  return `ask_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function scopeFromPath(pathname: string): string | null {
  if (!pathname) return null;
  if (pathname.startsWith("/money")) return "money";
  if (pathname.startsWith("/accounts")) return "accounts";
  if (pathname.startsWith("/transactions")) return "transactions";
  if (pathname.startsWith("/connections")) return "connections";
  if (pathname.startsWith("/decisions")) return "decisions";
  if (pathname.startsWith("/thinking")) return "thinking";
  if (pathname.startsWith("/capture")) return "capture";
  if (pathname.startsWith("/bills")) return "bills";
  if (pathname.startsWith("/family")) return "family";
  if (pathname.startsWith("/household")) return "household";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/home") || pathname.startsWith("/lifecfo-home")) return "home";
  return null;
}

async function getSignedInUserId(): Promise<string | null> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

export function AskProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AskStatus>("idle");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lastQuestionRef = useRef<string>("");

  const openAsk = useCallback(() => setOpen(true), []);
  const closeAsk = useCallback(() => setOpen(false), []);
  const toggleAsk = useCallback(() => setOpen((v) => !v), []);

  const clearAsk = useCallback(() => {
    setDraft("");
    setStatus("idle");
    setMessages([]);
    setErrorMessage(null);
    lastQuestionRef.current = "";
  }, []);

  const runQuestion = useCallback(
    async (rawQuestion?: string) => {
      const question = (rawQuestion ?? draft).trim();
      if (!question) return;

      const questionMessage: AskMessage = {
        id: makeId(),
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
      };

      setOpen(true);
      setStatus("loading");
      setErrorMessage(null);
      lastQuestionRef.current = question;

      setMessages((prev) => [...prev, questionMessage]);
      setDraft("");

      try {
        const userId = await getSignedInUserId();
        if (!userId) {
          setStatus("error");
          setErrorMessage("Sign in to ask Life CFO.");
          return;
        }

        const res = await fetch("/api/home/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, question }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setStatus("error");
          setErrorMessage(
            typeof json?.error === "string"
              ? json.error
              : "I couldn’t answer that right now."
          );
          return;
        }

        const actionMap: Record<string, string | null> = {
          open_bills: "/bills",
          open_money: "/money",
          open_decisions: "/decisions?tab=active",
          open_review: "/revisit",
          open_chapters: "/chapters",
          none: null,
        };

        const assistantMessage: AskMessage = {
          id: makeId(),
          role: "assistant",
          content: typeof json?.answer === "string" ? json.answer : "",
          createdAt: new Date().toISOString(),
          tone: typeof json?.tone === "string" ? json.tone : null,
          verdict: typeof json?.verdict === "string" ? json.verdict : null,
          actionHref: actionMap[String(json?.action ?? "none")] ?? null,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setStatus("done");
        setErrorMessage(null);
      } catch {
        setStatus("error");
        setErrorMessage("I couldn’t answer that right now.");
      }
    },
    [draft]
  );

  const submitAsk = useCallback(
    async (question?: string) => {
      await runQuestion(question);
    },
    [runQuestion]
  );

  const retryLast = useCallback(async () => {
    const q = lastQuestionRef.current.trim();
    if (!q) return;
    await runQuestion(q);
  }, [runQuestion]);

  const value = useMemo<AskContextValue>(
    () => ({
      open,
      status,
      draft,
      messages,
      errorMessage,
      currentPath: pathname || "",
      currentScope: scopeFromPath(pathname || ""),
      setDraft,
      openAsk,
      closeAsk,
      toggleAsk,
      clearAsk,
      submitAsk,
      retryLast,
    }),
    [
      open,
      status,
      draft,
      messages,
      errorMessage,
      pathname,
      openAsk,
      closeAsk,
      toggleAsk,
      clearAsk,
      submitAsk,
      retryLast,
    ]
  );

  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

export function useAsk() {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used inside AskProvider");
  return ctx;
}