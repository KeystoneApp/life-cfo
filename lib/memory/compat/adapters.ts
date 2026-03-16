import type {
  AskConversationLegacyRow,
  AskMessageLegacyRow,
  DecisionConversationLegacyRow,
  DecisionInboxLegacyRow,
  DecisionLegacyRow,
  DecisionSummaryLegacyRow,
  DurableDecisionDTO,
  EphemeralMessageDTO,
  EphemeralThreadDTO,
  HomeStatusLatestLegacyRow,
  HomeStatusRunLegacyRow,
  LegacyInsightLikeDTO,
  RevisitSignalLikeDTO,
} from "@/lib/memory/compat/types";

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRole(value: unknown): "user" | "assistant" | "system" {
  if (value === "user" || value === "assistant" || value === "system") return value;
  return "assistant";
}

function firstLine(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) return "";
  const [line] = cleaned.split(/\r?\n/, 1);
  return line.trim();
}

function statusToDecisionCommitment(status: string | null): string {
  const safe = (status || "").toLowerCase().trim();
  if (safe === "open" || safe === "draft") return "open";
  if (safe === "chapter" || safe === "closed" || safe === "done") return "closed";
  if (safe) return safe;
  return "open";
}

export function mapAskConversationToEphemeralThread(row: AskConversationLegacyRow): EphemeralThreadDTO {
  return {
    kind: "ephemeral_thread",
    source: "ask_conversations",
    id: row.id,
    household_id: row.household_id,
    user_id: row.user_id,
    scope: row.scope,
    path: row.path,
    created_at: asNullableString(row.created_at),
    last_active_at: asNullableString(row.updated_at),
    metadata: null,
  };
}

export function mapAskConversationsToEphemeralThreads(rows: AskConversationLegacyRow[]): EphemeralThreadDTO[] {
  return rows.map(mapAskConversationToEphemeralThread);
}

export function mapAskMessageToEphemeralMessage(row: AskMessageLegacyRow): EphemeralMessageDTO {
  return {
    kind: "ephemeral_message",
    source: "ask_messages",
    id: row.id,
    thread_id: row.conversation_id,
    role: asRole(row.role),
    content: row.content || "",
    created_at: asNullableString(row.created_at),
    metadata: {
      tone: asNullableString(row.tone),
      verdict: asNullableString(row.verdict),
      action_href: asNullableString(row.action_href),
      user_id: row.user_id,
      household_id: row.household_id,
    },
  };
}

export function mapAskMessagesToEphemeralMessages(rows: AskMessageLegacyRow[]): EphemeralMessageDTO[] {
  return rows.map(mapAskMessageToEphemeralMessage);
}

export function mapDecisionConversationToEphemeralThread(row: DecisionConversationLegacyRow): EphemeralThreadDTO {
  const newestMessageAt =
    row.messages?.reduce<string | null>((latest, message) => {
      const next = asNullableString(message.at);
      if (!next) return latest;
      if (!latest) return next;
      return next > latest ? next : latest;
    }, null) ?? null;

  return {
    kind: "ephemeral_thread",
    source: "decision_conversations",
    id: `decision_thread:${row.decision_id}:${row.user_id}`,
    household_id: null,
    user_id: row.user_id,
    scope: "decisions",
    path: "/decisions",
    created_at: null,
    last_active_at: newestMessageAt,
    metadata: {
      decision_id: row.decision_id,
      source_table: "decision_conversations",
    },
  };
}

export function mapDecisionConversationToEphemeralMessages(row: DecisionConversationLegacyRow): EphemeralMessageDTO[] {
  const threadId = `decision_thread:${row.decision_id}:${row.user_id}`;
  return (row.messages ?? [])
    .filter((message): message is { role: string; content: string; at?: string | null } => {
      return !!message && typeof message.content === "string" && message.content.trim().length > 0;
    })
    .map((message, index) => ({
      kind: "ephemeral_message",
      source: "decision_conversations",
      id: `decision_message:${row.decision_id}:${row.user_id}:${index}`,
      thread_id: threadId,
      role: asRole(message.role),
      content: message.content,
      created_at: asNullableString(message.at),
      metadata: {
        decision_id: row.decision_id,
        index,
      },
    }));
}

export function mapDecisionConversationRowsToEphemeralThreads(
  rows: DecisionConversationLegacyRow[]
): EphemeralThreadDTO[] {
  return rows.map(mapDecisionConversationToEphemeralThread);
}

export function mapDecisionConversationRowsToEphemeralMessages(
  rows: DecisionConversationLegacyRow[]
): EphemeralMessageDTO[] {
  return rows.flatMap(mapDecisionConversationToEphemeralMessages);
}

export function mapDecisionRowToDurableDecision(row: DecisionLegacyRow): DurableDecisionDTO {
  return {
    kind: "durable_decision",
    source: "decisions",
    id: row.id,
    household_id: row.household_id ?? null,
    user_id: row.user_id ?? null,
    title: asNullableString(row.title) ?? "Untitled decision",
    rationale: asNullableString(row.context),
    status: statusToDecisionCommitment(asNullableString(row.status)),
    committed_at: asNullableString(row.decided_at),
    review_at: asNullableString(row.review_at),
    reviewed_at: asNullableString(row.reviewed_at),
    chaptered_at: asNullableString(row.chaptered_at),
    created_at: asNullableString(row.created_at),
    updated_at: asNullableString(row.updated_at),
    metadata: null,
  };
}

export function mapDecisionRowsToDurableDecisions(rows: DecisionLegacyRow[]): DurableDecisionDTO[] {
  return rows.map(mapDecisionRowToDurableDecision);
}

export function mapDecisionSummaryToLegacyInsightLike(row: DecisionSummaryLegacyRow): LegacyInsightLikeDTO {
  const content = row.summary_text || "";
  return {
    kind: "legacy_insight_like",
    source: "decision_summaries",
    insight_kind: "decision_summary",
    id: row.id,
    household_id: null,
    user_id: row.user_id,
    decision_id: row.decision_id,
    title: firstLine(content) || "Decision summary",
    summary: firstLine(content) || "Decision summary",
    content,
    created_at: asNullableString(row.created_at),
    metadata: null,
  };
}

export function mapDecisionSummariesToLegacyInsightLike(rows: DecisionSummaryLegacyRow[]): LegacyInsightLikeDTO[] {
  return rows.map(mapDecisionSummaryToLegacyInsightLike);
}

export function mapDecisionInboxToRevisitSignalLike(row: DecisionInboxLegacyRow): RevisitSignalLikeDTO {
  const title = asNullableString(row.title) ?? "Inbox signal";
  return {
    kind: "revisit_signal_like",
    source: "decision_inbox",
    signal_kind: "inbox_signal",
    id: row.id,
    household_id: row.household_id ?? null,
    user_id: row.user_id ?? null,
    decision_id: row.decision_id ?? null,
    status: asNullableString(row.status),
    title,
    summary: asNullableString(row.body),
    signal_at: asNullableString(row.updated_at) ?? asNullableString(row.created_at),
    severity: typeof row.severity === "number" ? row.severity : null,
    metadata: {
      type: asNullableString(row.type),
      dedupe_key: asNullableString(row.dedupe_key),
    },
  };
}

export function mapDecisionInboxRowsToRevisitSignalLike(rows: DecisionInboxLegacyRow[]): RevisitSignalLikeDTO[] {
  return rows.map(mapDecisionInboxToRevisitSignalLike);
}

export function mapHomeStatusRunToRevisitSignalLike(row: HomeStatusRunLegacyRow): RevisitSignalLikeDTO {
  return {
    kind: "revisit_signal_like",
    source: "home_status_runs",
    signal_kind: "home_status_snapshot",
    id: row.id,
    household_id: row.household_id ?? null,
    user_id: row.user_id,
    decision_id: null,
    status: asNullableString(row.status),
    title: "Home status run",
    summary: asNullableString(row.memo_text),
    signal_at: asNullableString(row.checked_at) ?? asNullableString(row.created_at),
    severity: null,
    metadata: {
      reasons: row.reasons,
      facts_snapshot: row.facts_snapshot,
    },
  };
}

export function mapHomeStatusRunsToRevisitSignalLike(rows: HomeStatusRunLegacyRow[]): RevisitSignalLikeDTO[] {
  return rows.map(mapHomeStatusRunToRevisitSignalLike);
}

export function mapHomeStatusLatestToRevisitSignalLike(row: HomeStatusLatestLegacyRow): RevisitSignalLikeDTO {
  return {
    kind: "revisit_signal_like",
    source: "home_status_latest",
    signal_kind: "home_status_snapshot",
    id: row.id,
    household_id: row.household_id ?? null,
    user_id: row.user_id,
    decision_id: null,
    status: asNullableString(row.status),
    title: "Home status latest",
    summary: asNullableString(row.memo_text),
    signal_at: asNullableString(row.checked_at),
    severity: null,
    metadata: null,
  };
}

export function mapDecisionRowsToReviewSignals(rows: DecisionLegacyRow[]): RevisitSignalLikeDTO[] {
  return rows
    .filter((row) => asNullableString(row.review_at) !== null)
    .map((row) => ({
      kind: "revisit_signal_like",
      source: "decisions",
      signal_kind: "decision_review_due",
      id: `decision_review:${row.id}`,
      household_id: row.household_id ?? null,
      user_id: row.user_id ?? null,
      decision_id: row.id,
      status: asNullableString(row.status),
      title: asNullableString(row.title) ?? "Decision review",
      summary: null,
      signal_at: asNullableString(row.review_at),
      severity: null,
      metadata: {
        reviewed_at: asNullableString(row.reviewed_at),
      },
    }));
}
