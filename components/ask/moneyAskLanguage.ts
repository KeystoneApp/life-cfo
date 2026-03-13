export function cleanLines(values: Array<string | null | undefined>) {
  return values
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

export function section(title: string, items: Array<string | null | undefined>) {
  const cleaned = cleanLines(items);
  if (!cleaned.length) return null;
  return `${title}\n- ${cleaned.join("\n- ")}`;
}

export function paragraph(...parts: Array<string | null | undefined>) {
  return cleanLines(parts).join(" ");
}

export function composeMessage(sections: Array<string | null | undefined>) {
  return cleanLines(sections).join("\n\n");
}

type StableGroundMode =
  | "snapshot"
  | "diagnosis"
  | "planning"
  | "affordability"
  | "scenario"
  | "search";

type StableGroundParams = {
  mode: StableGroundMode;
  hasCaveat?: boolean;
  hasEvidence?: boolean;
};

export function stableGroundLine(params: StableGroundParams) {
  const { mode, hasCaveat = false, hasEvidence = true } = params;

  if (mode === "search") {
    return hasEvidence
      ? "This gives you a clear place to start before we narrow it further."
      : "There is not much matching data yet, which still helps narrow the next question.";
  }

  if (hasCaveat) {
    return "This is still useful for direction, even if a little more detail would make it sharper.";
  }

  switch (mode) {
    case "snapshot":
      return "Even if money feels a bit tight, there is enough here to see what is going on.";
    case "diagnosis":
      return "The good news is this does not look random.";
    case "planning":
      return "There is enough mapped out here to plan ahead with a bit more confidence.";
    case "affordability":
      return "This gives you a solid starting point before getting more specific.";
    case "scenario":
      return "You can treat this as the before picture, then layer the change on top.";
    default:
      return null;
  }
}
