import type { ISODateTimeString, UUID } from "@/lib/memory/contracts";

export type MemoryLegacySource =
  | "ask_conversations"
  | "ask_messages"
  | "decision_conversations"
  | "decision_summaries"
  | "decisions"
  | "decision_inbox"
  | "home_status_runs"
  | "home_status_latest";

export type LegacyInsightLikeKind = "decision_summary" | "decision_note_like";
export type RevisitSignalLikeKind = "decision_review_due" | "inbox_signal" | "home_status_snapshot";

export interface EphemeralThreadDTO {
  kind: "ephemeral_thread";
  source: MemoryLegacySource;
  id: UUID;
  household_id: UUID | null;
  user_id: UUID | null;
  scope: string | null;
  path: string | null;
  created_at: ISODateTimeString | null;
  last_active_at: ISODateTimeString | null;
  metadata: Record<string, unknown> | null;
}

export interface EphemeralMessageDTO {
  kind: "ephemeral_message";
  source: MemoryLegacySource;
  id: UUID;
  thread_id: UUID;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: ISODateTimeString | null;
  metadata: Record<string, unknown> | null;
}

export interface DurableDecisionDTO {
  kind: "durable_decision";
  source: "decisions";
  id: UUID;
  household_id: UUID | null;
  user_id: UUID | null;
  title: string;
  rationale: string | null;
  status: string;
  committed_at: ISODateTimeString | null;
  review_at: ISODateTimeString | null;
  reviewed_at: ISODateTimeString | null;
  chaptered_at: ISODateTimeString | null;
  created_at: ISODateTimeString | null;
  updated_at: ISODateTimeString | null;
  metadata: Record<string, unknown> | null;
}

export interface LegacyInsightLikeDTO {
  kind: "legacy_insight_like";
  source: "decision_summaries";
  insight_kind: LegacyInsightLikeKind;
  id: UUID;
  household_id: UUID | null;
  user_id: UUID | null;
  decision_id: UUID | null;
  title: string;
  summary: string;
  content: string;
  created_at: ISODateTimeString | null;
  metadata: Record<string, unknown> | null;
}

export interface RevisitSignalLikeDTO {
  kind: "revisit_signal_like";
  source: "decision_inbox" | "home_status_runs" | "home_status_latest" | "decisions";
  signal_kind: RevisitSignalLikeKind;
  id: UUID;
  household_id: UUID | null;
  user_id: UUID | null;
  decision_id: UUID | null;
  status: string | null;
  title: string;
  summary: string | null;
  signal_at: ISODateTimeString | null;
  severity: number | null;
  metadata: Record<string, unknown> | null;
}

export interface AskConversationLegacyRow {
  id: string;
  user_id: string;
  household_id: string;
  path: string | null;
  scope: string | null;
  created_at: string;
  updated_at: string;
}

export interface AskMessageLegacyRow {
  id: string;
  conversation_id: string;
  user_id: string;
  household_id: string;
  role: string;
  content: string;
  tone: string | null;
  verdict: string | null;
  action_href: string | null;
  created_at: string;
}

export interface DecisionConversationLegacyRow {
  decision_id: string;
  user_id: string;
  messages: Array<{
    role: string;
    content: string;
    at?: string | null;
  }> | null;
}

export interface DecisionSummaryLegacyRow {
  id: string;
  user_id: string;
  decision_id: string;
  summary_text: string;
  created_at: string;
}

export interface DecisionLegacyRow {
  id: string;
  user_id: string | null;
  household_id?: string | null;
  title: string | null;
  context: string | null;
  status: string | null;
  decided_at: string | null;
  review_at: string | null;
  reviewed_at?: string | null;
  chaptered_at?: string | null;
  created_at: string | null;
  updated_at?: string | null;
}

export interface DecisionInboxLegacyRow {
  id: string;
  user_id: string | null;
  household_id?: string | null;
  decision_id?: string | null;
  type: string | null;
  title: string | null;
  body: string | null;
  status: string | null;
  severity: number | null;
  dedupe_key?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HomeStatusRunLegacyRow {
  id: string;
  user_id: string;
  household_id?: string | null;
  status: string | null;
  memo_text: string | null;
  reasons: unknown;
  facts_snapshot: unknown;
  checked_at: string | null;
  created_at?: string | null;
}

export interface HomeStatusLatestLegacyRow {
  id: string;
  user_id: string;
  household_id?: string | null;
  status: string | null;
  memo_text: string | null;
  checked_at: string | null;
}
