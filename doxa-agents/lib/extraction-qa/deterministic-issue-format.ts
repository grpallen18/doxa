function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function truncateForIssue(value: string, max = 240): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function entityIdField(label: string): string | null {
  if (label === "position") return "position_id";
  if (label === "claim") return "claim_id";
  return null;
}

export type AtomDeterministicIssueInput = {
  code: string;
  label: string;
  index: number;
  row: unknown;
  field_path?: string;
  bad_value?: string | null;
  recommended_value?: string | null;
  summary?: string;
};

/** Structured deterministic issue (JSON string) for humans and refine agents. */
export function formatAtomDeterministicIssue(input: AtomDeterministicIssueInput): string {
  const row = asRecord(input.row);
  const displayNumber = input.index + 1;
  const idField = entityIdField(input.label);
  const entityId =
    idField && row && typeof row[idField] === "string" ? (row[idField] as string) : null;

  const payload: Record<string, unknown> = {
    code: input.code,
    entity_type: input.label,
    [`${input.label}_index`]: input.index,
    [`${input.label}_number`]: displayNumber,
    field_path: input.field_path ?? null,
    bad_value: input.bad_value != null ? truncateForIssue(input.bad_value) : null,
    recommended_value:
      input.recommended_value != null ? truncateForIssue(input.recommended_value) : null,
    summary:
      input.summary ??
      `${input.code}: ${input.label} #${displayNumber}${entityId ? ` (${entityId})` : ""}`,
  };

  if (entityId && idField) payload[idField] = entityId;

  return JSON.stringify(payload);
}
