import type { ExtractionJson } from "./types.ts";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

const STANCE_SIGNATURE_KEYS = [
  "stance_target",
  "stance_action",
  "stance_polarity",
  "scope",
  "jurisdiction",
  "timeframe",
  "modality",
] as const;

const OWNERSHIP_KEYS = [
  "is_source_position",
  "is_attributed_to_other_actor",
  "attributed_actor",
  "source_endorses_attributed_position",
] as const;

export function resolvePositionEntityIndex(
  extraction: ExtractionJson,
  entityIndex: number,
  positionId: unknown
): number {
  if (entityIndex >= 0) return entityIndex;
  const id = typeof positionId === "string" ? positionId.trim() : "";
  if (!id) return entityIndex;
  const positions = Array.isArray(extraction.positions) ? extraction.positions : [];
  for (let i = 0; i < positions.length; i++) {
    const row = asRecord(positions[i]);
    if (row?.position_id === id) return i;
  }
  return entityIndex;
}

/** Flatten stance/ownership patch fields into nested position shape before applyPatches merge. */
export function coalescePositionPatchValue(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...patch };

  const stancePatch: Record<string, unknown> = {};
  for (const key of STANCE_SIGNATURE_KEYS) {
    if (patch[key] !== undefined && patch[key] !== null) {
      stancePatch[key] = patch[key];
      delete out[key];
    }
  }
  if (Object.keys(stancePatch).length > 0) {
    out.stance_signature = {
      ...(asRecord(existing.stance_signature) ?? {}),
      ...stancePatch,
    };
  }

  const ownershipPatch: Record<string, unknown> = {};
  for (const key of OWNERSHIP_KEYS) {
    if (patch[key] !== undefined) {
      ownershipPatch[key] = patch[key];
      delete out[key];
    }
  }
  if (Object.keys(ownershipPatch).length > 0) {
    out.source_ownership = {
      ...(asRecord(existing.source_ownership) ?? {}),
      ...ownershipPatch,
    };
  }

  if (patch.provenance !== undefined && typeof patch.provenance === "object" && patch.provenance !== null) {
    out.provenance = {
      ...(asRecord(existing.provenance) ?? {}),
      ...(patch.provenance as Record<string, unknown>),
    };
  }

  if (Array.isArray(patch.supporting_spans)) {
    const provenance = asRecord(out.provenance) ?? asRecord(existing.provenance) ?? {};
    out.provenance = { ...provenance, supporting_spans: patch.supporting_spans };
    delete out.supporting_spans;
  }

  if (typeof patch.inference_rationale === "string") {
    const provenance = asRecord(out.provenance) ?? asRecord(existing.provenance) ?? {};
    out.provenance = { ...provenance, inference_rationale: patch.inference_rationale };
    delete out.inference_rationale;
  }

  return out;
}
