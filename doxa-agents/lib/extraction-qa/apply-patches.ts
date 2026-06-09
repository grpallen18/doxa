import { coalescePositionPatchValue } from "./position-refine-patches.ts";
import type { ExtractionJson, RefinementPatchOp } from "./types.ts";

const ENTITY_KEYS: Record<string, keyof ExtractionJson> = {
  claim: "claims",
  claims: "claims",
  evidence: "evidence",
  position: "positions",
  positions: "positions",
  event: "events",
  events: "events",
};

const LINK_KEYS: Record<string, keyof ExtractionJson> = {
  claim_evidence_links: "claim_evidence_links",
  claim_evidence_link: "claim_evidence_links",
  position_claim_links: "position_claim_links",
  position_claim_link: "position_claim_links",
  position_evidence_links: "position_evidence_links",
  position_evidence_link: "position_evidence_links",
  event_claim_links: "event_claim_links",
  event_claim_link: "event_claim_links",
  event_evidence_links: "event_evidence_links",
  event_evidence_link: "event_evidence_links",
};

function arr(extraction: ExtractionJson, key: keyof ExtractionJson): unknown[] {
  const v = extraction[key];
  return Array.isArray(v) ? [...v] : [];
}

function setArr(extraction: ExtractionJson, key: keyof ExtractionJson, value: unknown[]) {
  (extraction as Record<string, unknown>)[key] = value;
}

function remapLinks(extraction: ExtractionJson, entityType: string, removedIndex: number) {
  const linkMaps: Array<{ key: keyof ExtractionJson; indexField: string }> = [
    { key: "claim_evidence_links", indexField: "claim_index" },
    { key: "position_claim_links", indexField: "position_index" },
    { key: "position_claim_links", indexField: "claim_index" },
    { key: "position_evidence_links", indexField: "position_index" },
    { key: "position_evidence_links", indexField: "evidence_index" },
    { key: "event_claim_links", indexField: "event_index" },
    { key: "event_claim_links", indexField: "claim_index" },
    { key: "event_evidence_links", indexField: "event_index" },
    { key: "event_evidence_links", indexField: "evidence_index" },
  ];

  const entityIndexFields: Record<string, string[]> = {
    claims: ["claim_index"],
    evidence: ["evidence_index"],
    positions: ["position_index"],
    events: ["event_index"],
  };

  const fields = entityIndexFields[entityType] ?? [];
  if (fields.length === 0) return;

  for (const { key, indexField } of linkMaps) {
    if (!fields.includes(indexField)) continue;
    const links = arr(extraction, key);
    const next = links
      .filter((l) => {
        if (l === null || typeof l !== "object") return false;
        const idx = (l as Record<string, number>)[indexField];
        return idx !== removedIndex;
      })
      .map((l) => {
        const copy = { ...(l as Record<string, unknown>) };
        const idx = copy[indexField] as number;
        if (idx > removedIndex) copy[indexField] = idx - 1;
        return copy;
      });
    setArr(extraction, key, next);
  }
}

function applyLinkPatch(extraction: ExtractionJson, patch: RefinementPatchOp) {
  const linkKey = LINK_KEYS[patch.entity_type];
  if (!linkKey || !patch.value) return;
  const links = arr(extraction, linkKey);
  links.push(patch.value);
  setArr(extraction, linkKey, links);
}

function applyUnlinkPatch(extraction: ExtractionJson, patch: RefinementPatchOp) {
  const linkKey = LINK_KEYS[patch.entity_type];
  if (!linkKey) return;
  const links = arr(extraction, linkKey);
  const filterObj = patch.value ?? {};

  if (typeof patch.entity_index === "number" && patch.entity_index >= 0 && patch.entity_index < links.length) {
    links.splice(patch.entity_index, 1);
    setArr(extraction, linkKey, links);
    return;
  }

  const next = links.filter((l) => {
    if (l === null || typeof l !== "object") return false;
    const lo = l as Record<string, unknown>;
    for (const [k, v] of Object.entries(filterObj)) {
      if (lo[k] !== v) return true;
    }
    return false;
  });
  setArr(extraction, linkKey, next);
}

export function applyPatches(extraction: ExtractionJson, patches: RefinementPatchOp[]): ExtractionJson {
  const out: ExtractionJson = JSON.parse(JSON.stringify(extraction));

  for (const patch of patches) {
    if (patch.op === "link") {
      applyLinkPatch(out, patch);
      continue;
    }
    if (patch.op === "unlink") {
      applyUnlinkPatch(out, patch);
      continue;
    }

    const key = ENTITY_KEYS[patch.entity_type];
    if (!key) continue;

    if (patch.op === "add") {
      const list = arr(out, key);
      const value = { ...(patch.value ?? {}) } as Record<string, unknown>;
      if (key === "claims") delete value.claim_id;
      list.push(value);
      setArr(out, key, list);
    } else if (patch.op === "remove") {
      const list = arr(out, key);
      if (patch.entity_index < 0 || patch.entity_index >= list.length) continue;
      list.splice(patch.entity_index, 1);
      setArr(out, key, list);
      remapLinks(out, key, patch.entity_index);
    } else if (patch.op === "update") {
      const list = arr(out, key);
      if (patch.entity_index < 0 || patch.entity_index >= list.length) continue;
      const existing = { ...(list[patch.entity_index] as Record<string, unknown>) };
      let patchValue = { ...(patch.value ?? {}) } as Record<string, unknown>;
      if (key === "claims") delete patchValue.claim_id;
      if (key === "positions") {
        patchValue = coalescePositionPatchValue(existing, patchValue);
      }
      list[patch.entity_index] = { ...existing, ...patchValue };
      setArr(out, key, list);
    }
  }

  return out;
}
