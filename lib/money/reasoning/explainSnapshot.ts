import { FinancialSnapshot } from "./buildFinancialSnapshot";
import { PressureSignals } from "./pressureSignals";

export type SnapshotExplanation = {
  headline: string;
  summary: string;
  insights: string[];
  pressure: {
    structural: string;
    discretionary: string;
    timing: string;
    stability: string;
  };
};

export function explainSnapshot(snapshot: FinancialSnapshot): SnapshotExplanation {
  const { pressure, income, commitments, liquidity, discretionary, connections } = snapshot;

  const headline = buildHeadline({
    structuralLevel: pressure.structural_pressure.level,
    incomeCents: income.recurringMonthlyCents,
    commitmentsCents: commitments.recurringMonthlyCents,
  });
  const summary = buildSummary({
    incomeCents: income.recurringMonthlyCents,
    commitmentsCents: commitments.recurringMonthlyCents,
    cashCents: liquidity.availableCashCents,
    discretionaryCents: discretionary.last30DayOutflowCents,
  });

  const insights = buildInsights({
    incomeCents: income.recurringMonthlyCents,
    commitmentsCents: commitments.recurringMonthlyCents,
    cashCents: liquidity.availableCashCents,
    discretionaryCents: discretionary.last30DayOutflowCents,
    connections,
  });

  return {
    headline,
    summary,
    insights,
    pressure: {
      structural: pressure.structural_pressure.summary,
      discretionary: pressure.discretionary_drift.summary,
      timing: pressure.timing_mismatch.summary,
      stability: pressure.stability_risk.summary,
    },
  };
}

function buildHeadline(params: {
  structuralLevel: PressureSignals["structural_pressure"]["level"];
  incomeCents: number;
  commitmentsCents: number;
}): string {
  const { structuralLevel, incomeCents, commitmentsCents } = params;
  const hasIncome = incomeCents > 0;
  const hasBills = commitmentsCents > 0;

  if (!hasIncome && !hasBills) {
    return "Recurring income and commitments are not set up yet.";
  }

  if (!hasIncome && hasBills) {
    return "Recurring bills are tracked but recurring income is missing.";
  }

  switch (structuralLevel) {
    case "high":
      return "Your commitments consume most of your recurring income.";
    case "medium":
      return "A significant share of income is already committed.";
    case "low":
    case "none":
    default:
      return "Recurring commitments leave meaningful flexibility.";
  }
}

function buildSummary(params: {
  incomeCents: number;
  commitmentsCents: number;
  cashCents: number;
  discretionaryCents: number;
}): string {
  const { incomeCents, commitmentsCents, cashCents, discretionaryCents } = params;
  const committedPct = pct(commitmentsCents, incomeCents);

  const parts: string[] = [];
  if (incomeCents > 0 && commitmentsCents > 0) {
    parts.push(`Committed spend is about ${committedPct}% of monthly income.`);
  } else if (incomeCents <= 0 && commitmentsCents > 0) {
    parts.push("Recurring bills are tracked but recurring income is missing.");
  } else if (incomeCents > 0 && commitmentsCents === 0) {
    parts.push("Recurring income is set; commitments are not mapped yet.");
  } else {
    parts.push("Recurring income and commitments are not set up yet.");
  }
  parts.push(`Available cash is ${formatCurrency(cashCents)}.`);
  parts.push(
    `Discretionary outflow over the last 30 days is ${formatCurrency(discretionaryCents)}.`
  );

  return parts.join(" ");
}

function buildInsights(params: {
  incomeCents: number;
  commitmentsCents: number;
  cashCents: number;
  discretionaryCents: number;
  connections: FinancialSnapshot["connections"];
}): string[] {
  const { incomeCents, commitmentsCents, cashCents, discretionaryCents, connections } = params;
  const committedPct = pct(commitmentsCents, incomeCents);
  const cashMonths =
    commitmentsCents > 0 ? (cashCents / commitmentsCents).toFixed(1) : null;

  const insights: string[] = [];

  if (incomeCents > 0 && commitmentsCents > 0) {
    insights.push(`About ${committedPct}% of income is already committed.`);
  } else if (incomeCents <= 0 && commitmentsCents > 0) {
    insights.push("Recurring bills are recorded but recurring income is missing.");
  } else if (incomeCents > 0 && commitmentsCents === 0) {
    insights.push("Recurring income exists; commitments are not mapped yet.");
  } else {
    insights.push("Recurring income and commitments have not been set up.");
  }

  if (cashMonths) {
    insights.push(`Cash covers roughly ${cashMonths} month(s) of commitments.`);
  } else {
    insights.push(`Cash buffer is ${formatCurrency(cashCents)}.`);
  }

  insights.push(
    `Recent discretionary outflow: ${formatCurrency(discretionaryCents)} (last 30 days).`
  );

  insights.push(
    connections.total === 0
      ? "No active money connections available."
      : connections.stale === 0
        ? `All ${connections.total} connections are recently synced.`
        : `${connections.stale} of ${connections.total} connections are stale; max age ${formatNumber(
            connections.maxAgeDays
          )} day(s).`
  );

  return insights.slice(0, 5);
}

function pct(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function formatCurrency(cents: number): string {
  const n = Number.isFinite(cents) ? cents : 0;
  const dollars = n / 100;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "unknown";
  return n.toFixed(1);
}
