import type { Verdict } from "./verdict";

export type LifeCFOAnswerPayload = {
  // Canonical outcome (deterministic, server-owned)
  verdict: Verdict;

  // Optional override; if absent, derive from verdictSentence(verdict)
  verdict_sentence?: string;

  // Structured rationale (calm, bounded)
  key_points?: string[]; // max 3
  details?: string;

  assumptions?: string[];        // max 3
  what_changes_this?: string[];  // max 3

  // Existing routing contract
  action?: "open_bills" | "open_money" | "open_decisions" | "open_review" | "open_chapters" | "none";
  suggested_next?: "none" | "create_capture" | "open_thinking";

  // Fallback (legacy / emergency only)
  answer?: string;
};
