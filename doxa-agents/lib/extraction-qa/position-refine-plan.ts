import { resolvePositionEntityIndex } from "./position-refine-patches.ts";
import type {
  ExtractionJson,
  PositionsReviewPatch,
  PositionsReviewReport,
  RefinementPatchOp,
} from "./types.ts";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function parseStructuredDeterministicIssue(issue: string): Record<string, unknown> | null {
  const trimmed = issue.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function fieldPathToPatchValue(
  fieldPath: string,
  recommendedValue: string
): Record<string, unknown> | null {
  const path = fieldPath.trim();
  const value = recommendedValue.trim();
  if (!path || !value) return null;

  if (path === "holder") return { holder: value };
  if (path === "raw_text") return { raw_text: value };
  if (path === "source_excerpt") return { source_excerpt: value };
  if (path === "signal_type") return { signal_type: value };
  if (path === "attributed_actor") return { attributed_actor: value };
  if (path === "source_endorses_attributed_position") {
    return { source_endorses_attributed_position: value };
  }
  if (path.startsWith("source_ownership.")) {
    const key = path.slice("source_ownership.".length);
    if (key === "source_endorses_attributed_position") {
      return { source_endorses_attributed_position: value };
    }
    if (key === "attributed_actor") return { attributed_actor: value };
    if (key === "is_source_position") return { is_source_position: value === "true" };
    if (key === "is_attributed_to_other_actor") {
      return { is_attributed_to_other_actor: value === "true" };
    }
  }
  if (path.startsWith("stance_signature.")) {
    const key = path.slice("stance_signature.".length);
    return { [key]: value };
  }
  return null;
}

export function deterministicIssuesToRefinementPatches(
  issues: string[],
  extraction: ExtractionJson
): RefinementPatchOp[] {
  const patches: RefinementPatchOp[] = [];

  for (const issue of issues) {
    const parsed = parseStructuredDeterministicIssue(issue);
    if (!parsed) continue;

    const fieldPath = String(parsed.field_path ?? "").trim();
    const recommended = parsed.recommended_value;
    if (typeof recommended !== "string" || !recommended.trim()) continue;

    const positionId = typeof parsed.position_id === "string" ? parsed.position_id : undefined;
    const entityIndex = resolvePositionEntityIndex(
      extraction,
      typeof parsed.position_index === "number" ? parsed.position_index : -1,
      positionId
    );
    if (entityIndex < 0) continue;

    const value = fieldPathToPatchValue(fieldPath, recommended);
    if (!value) continue;

    patches.push({
      op: "update",
      entity_type: "position",
      entity_index: entityIndex,
      value: {
        ...(positionId ? { position_id: positionId } : {}),
        ...value,
      },
    });
  }

  return patches;
}

function resolveReviewPatchIndex(
  extraction: ExtractionJson,
  patch: PositionsReviewPatch
): number {
  if (patch.position_indexes.length > 0) {
    return patch.position_indexes[0] ?? -1;
  }
  const positionId = patch.position_ids.find((id) => typeof id === "string" && id.trim());
  if (!positionId) return -1;
  return resolvePositionEntityIndex(extraction, -1, positionId);
}

export function reviewReportPatchesToRefinementOps(
  report: PositionsReviewReport,
  extraction: ExtractionJson
): RefinementPatchOp[] {
  const ops: RefinementPatchOp[] = [];

  for (const patch of report.patches ?? []) {
    if (patch.entity_type !== "position") continue;

    if (patch.action === "remove") {
      const indexes = new Set<number>();
      for (const idx of patch.position_indexes) {
        if (idx >= 0) indexes.add(idx);
      }
      for (const positionId of patch.position_ids) {
        const idx = resolvePositionEntityIndex(extraction, -1, positionId);
        if (idx >= 0) indexes.add(idx);
      }
      for (const idx of [...indexes].sort((a, b) => b - a)) {
        ops.push({ op: "remove", entity_type: "position", entity_index: idx });
      }
      continue;
    }

    if (patch.action === "add") {
      const rawText = String(patch.recommended_raw_text ?? "").trim();
      if (!rawText) continue;
      ops.push({
        op: "add",
        entity_type: "position",
        entity_index: 0,
        value: {
          raw_text: rawText,
          source_excerpt: patch.source_grounding?.trim() || rawText,
        },
      });
      continue;
    }

    if (patch.action === "update") {
      const entityIndex = resolveReviewPatchIndex(extraction, patch);
      if (entityIndex < 0) continue;
      const value: Record<string, unknown> = {};
      const positionId = patch.position_ids.find((id) => typeof id === "string" && id.trim());
      if (positionId) value.position_id = positionId;
      const rawText = String(patch.recommended_raw_text ?? "").trim();
      if (rawText) {
        value.raw_text = rawText;
        if (patch.source_grounding?.trim()) {
          value.source_excerpt = patch.source_grounding.trim();
        }
      }
      if (Object.keys(value).length === 0) continue;
      ops.push({
        op: "update",
        entity_type: "position",
        entity_index: entityIndex,
        value,
      });
    }
  }

  return ops;
}

export function buildPositionsReviewPlanPatches(
  report: PositionsReviewReport,
  extraction: ExtractionJson
): RefinementPatchOp[] {
  const deterministic = deterministicIssuesToRefinementPatches(
    report.deterministic_issues ?? [],
    extraction
  );
  const review = reviewReportPatchesToRefinementOps(report, extraction);
  return [...deterministic, ...review];
}

export function buildPositionsRefineUserPayload(
  base: Record<string, unknown>,
  extraction: ExtractionJson,
  reviewReport: PositionsReviewReport,
  validationReport: unknown
) {
  return {
    ...base,
    positions_extraction_json: extraction,
    review_report: reviewReport,
    validation_report: validationReport ?? null,
    deterministic_issues: reviewReport.deterministic_issues ?? [],
  };
}

const ATTRIBUTED_ACTOR_HOLDERS = new Set(["quoted_actor", "reported_actor"]);

export function isAttributedActorPosition(row: Record<string, unknown>): boolean {
  const holder = String(row.holder ?? "").trim();
  if (ATTRIBUTED_ACTOR_HOLDERS.has(holder)) return true;

  const speakerType = String(row.speaker_type ?? "").trim().toLowerCase();
  if (speakerType === "quoted") return true;

  const ownership = asRecord(row.source_ownership);
  if (ownership?.is_attributed_to_other_actor === true && ownership?.is_source_position !== true) {
    return true;
  }
  return false;
}

export function collectExplicitEndorsementPositionIds(
  patches: RefinementPatchOp[],
  extraction: ExtractionJson
): Set<string> {
  const ids = new Set<string>();
  const positions = Array.isArray(extraction.positions) ? extraction.positions : [];

  for (const patch of patches) {
    if (patch.op !== "update" && patch.op !== "add") continue;
    const value = asRecord(patch.value);
    if (!value) continue;

    const endorsement = value.source_endorses_attributed_position;
    if (endorsement !== "yes" && endorsement !== "no") continue;

    const patchId = typeof value.position_id === "string" ? value.position_id.trim() : "";
    if (patchId) {
      ids.add(patchId);
      continue;
    }

    if (patch.entity_index >= 0 && patch.entity_index < positions.length) {
      const row = asRecord(positions[patch.entity_index]);
      const rowId = typeof row?.position_id === "string" ? row.position_id.trim() : "";
      if (rowId) ids.add(rowId);
    }
  }

  return ids;
}

export function enforceAttributedEndorsementDefaults(
  positions: Array<Record<string, unknown>>,
  explicitEndorsementPositionIds: Set<string>
): Array<Record<string, unknown>> {
  return positions.map((row) => {
    if (!isAttributedActorPosition(row)) return row;

    const positionId = typeof row.position_id === "string" ? row.position_id.trim() : "";
    const ownership = { ...(asRecord(row.source_ownership) ?? {}) };
    const current = String(
      ownership.source_endorses_attributed_position ??
        row.source_endorses_attributed_position ??
        ""
    ).trim();

    const explicitlyProven = positionId.length > 0 && explicitEndorsementPositionIds.has(positionId);
    if (!explicitlyProven && current !== "unclear") {
      ownership.is_attributed_to_other_actor = true;
      ownership.is_source_position = false;
      ownership.source_endorses_attributed_position = "unclear";
    }

    return {
      ...row,
      source_ownership: ownership,
      source_endorses_attributed_position: ownership.source_endorses_attributed_position,
    };
  });
}
