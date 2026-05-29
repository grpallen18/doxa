import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ExtractionJson } from "./types.ts";

function clampNum(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function parseDateOnly(s: unknown): string | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export async function deleteStoryEntities(supabase: SupabaseClient, storyId: string) {
  await supabase.from("story_claims").delete().eq("story_id", storyId);
  await supabase.from("story_evidence").delete().eq("story_id", storyId);
  await supabase.from("story_positions").delete().eq("story_id", storyId);
  await supabase.from("story_events").delete().eq("story_id", storyId);
}

export async function persistMergedExtraction(
  supabase: SupabaseClient,
  storyId: string,
  extraction: ExtractionJson,
  runId: string | null
) {
  const mergeClaims = Array.isArray(extraction.claims) ? extraction.claims : [];
  const mergeEvidence = Array.isArray(extraction.evidence) ? extraction.evidence : [];
  const mergeClaimEvidenceLinks = Array.isArray(extraction.claim_evidence_links)
    ? extraction.claim_evidence_links
    : [];
  const mergePositions = Array.isArray(extraction.positions) ? extraction.positions : [];
  const mergePositionClaimLinks = Array.isArray(extraction.position_claim_links)
    ? extraction.position_claim_links
    : [];
  const mergePositionEvidenceLinks = Array.isArray(extraction.position_evidence_links)
    ? extraction.position_evidence_links
    : [];
  const mergeEvents = Array.isArray(extraction.events) ? extraction.events : [];
  const mergeEventEvidenceLinks = Array.isArray(extraction.event_evidence_links)
    ? extraction.event_evidence_links
    : [];
  const mergeEventClaimLinks = Array.isArray(extraction.event_claim_links)
    ? extraction.event_claim_links
    : [];

  await deleteStoryEntities(supabase, storyId);

  const evidenceWithLinks = new Set([
    ...mergeClaimEvidenceLinks.map((l) => (l as { evidence_index: number }).evidence_index),
    ...mergeEventEvidenceLinks.map((l) => (l as { evidence_index: number }).evidence_index),
  ]);
  const evidenceToKeep = mergeEvidence.filter((_, i) => evidenceWithLinks.has(i));
  const claimIndices = new Set(mergeClaims.map((_, i) => i));
  const validLinks = mergeClaimEvidenceLinks.filter(
    (l) =>
      claimIndices.has((l as { claim_index: number }).claim_index) &&
      (l as { evidence_index: number }).evidence_index < mergeEvidence.length &&
      evidenceWithLinks.has((l as { evidence_index: number }).evidence_index)
  );

  const evidenceIndexMap = new Map<number, number>();
  mergeEvidence.forEach((_, oldIdx) => {
    if (evidenceWithLinks.has(oldIdx)) evidenceIndexMap.set(oldIdx, evidenceIndexMap.size);
  });

  const claimIds: string[] = [];
  for (const c of mergeClaims) {
    const row = c as Record<string, unknown>;
    const { data: ins } = await supabase
      .from("story_claims")
      .insert({
        story_id: storyId,
        raw_text: String(row.raw_text ?? "").trim() || "Unspecified",
        polarity: row.polarity ?? "uncertain",
        stance: row.stance && ["support", "oppose", "neutral"].includes(String(row.stance))
          ? row.stance
          : null,
        extraction_confidence: clampNum(row.extraction_confidence, 0, 1, 0.5),
        span_start: row.span_start ?? null,
        span_end: row.span_end ?? null,
        run_id: runId,
      })
      .select("story_claim_id")
      .single();
    if (ins?.story_claim_id) claimIds.push(ins.story_claim_id);
  }

  const evidenceIds: string[] = [];
  for (const e of evidenceToKeep) {
    const row = e as Record<string, unknown>;
    const { data: ins } = await supabase
      .from("story_evidence")
      .insert({
        story_id: storyId,
        evidence_type: row.evidence_type ?? "other",
        excerpt: String(row.excerpt ?? "").trim() || "Unspecified",
        attribution: row.attribution ?? null,
        source_ref: row.source_ref ?? null,
        extraction_confidence: clampNum(row.extraction_confidence, 0, 1, 0.5),
        run_id: runId,
      })
      .select("evidence_id")
      .single();
    if (ins?.evidence_id) evidenceIds.push(ins.evidence_id);
  }

  for (const link of validLinks) {
    const l = link as { claim_index: number; evidence_index: number; relation_type?: string; confidence?: number; rationale?: string | null };
    const newEvidenceIdx = evidenceIndexMap.get(l.evidence_index);
    if (newEvidenceIdx === undefined) continue;
    const scId = claimIds[l.claim_index];
    const evId = evidenceIds[newEvidenceIdx];
    if (!scId || !evId) continue;
    await supabase.from("story_claim_evidence_links").insert({
      story_claim_id: scId,
      evidence_id: evId,
      relation_type: l.relation_type ?? "contextual",
      confidence: clampNum(l.confidence, 0, 1, 0.5),
      rationale: l.rationale ?? null,
      run_id: runId,
    });
  }

  const positionIds: string[] = [];
  for (const p of mergePositions) {
    const row = p as Record<string, unknown>;
    const { data: ins } = await supabase
      .from("story_positions")
      .insert({
        story_id: storyId,
        raw_text: String(row.raw_text ?? "").trim() || "Unspecified",
        extraction_confidence: clampNum(row.extraction_confidence, 0, 1, 0.5),
        excerpt_text: String(row.excerpt_text ?? "").trim() || "",
        cue_phrases: Array.isArray(row.cue_phrases) ? row.cue_phrases : [],
        speaker_type: row.speaker_type ?? null,
        run_id: runId,
      })
      .select("story_position_id")
      .single();
    if (ins?.story_position_id) positionIds.push(ins.story_position_id);
  }

  for (const l of mergePositionClaimLinks) {
    const link = l as { position_index: number; claim_index: number };
    if (link.position_index >= positionIds.length || link.claim_index >= claimIds.length) continue;
    await supabase.from("story_position_claim_links").insert({
      story_position_id: positionIds[link.position_index],
      story_claim_id: claimIds[link.claim_index],
    });
  }

  for (const l of mergePositionEvidenceLinks) {
    const link = l as { position_index: number; evidence_index: number };
    const newEvIdx = evidenceIndexMap.get(link.evidence_index);
    if (newEvIdx === undefined || link.position_index >= positionIds.length) continue;
    await supabase.from("story_position_evidence_links").insert({
      story_position_id: positionIds[link.position_index],
      evidence_id: evidenceIds[newEvIdx],
    });
  }

  const eventIds: string[] = [];
  for (const ev of mergeEvents) {
    const row = ev as Record<string, unknown>;
    const { data: ins } = await supabase
      .from("story_events")
      .insert({
        story_id: storyId,
        event_summary: String(row.event_summary ?? "").trim() || "Unspecified",
        extraction_confidence: clampNum(row.extraction_confidence, 0, 1, 0.5),
        primary_actor: row.primary_actor ?? null,
        action: row.action ?? null,
        object: row.object ?? null,
        event_date: parseDateOnly(row.event_date),
        event_timeframe_start: parseDateOnly(row.event_timeframe_start),
        event_timeframe_end: parseDateOnly(row.event_timeframe_end),
        location: row.location ?? null,
        event_type: row.event_type ?? null,
        run_id: runId,
      })
      .select("story_event_id")
      .single();
    if (ins?.story_event_id) eventIds.push(ins.story_event_id);
  }

  for (const l of mergeEventEvidenceLinks) {
    const link = l as { event_index: number; evidence_index: number };
    const newEvIdx = evidenceIndexMap.get(link.evidence_index);
    if (newEvIdx === undefined || link.event_index >= eventIds.length) continue;
    await supabase.from("story_event_evidence_links").insert({
      story_event_id: eventIds[link.event_index],
      evidence_id: evidenceIds[newEvIdx],
    });
  }

  for (const l of mergeEventClaimLinks) {
    const link = l as { event_index: number; claim_index: number; relation_type?: string };
    if (link.event_index >= eventIds.length || link.claim_index >= claimIds.length) continue;
    await supabase.from("story_event_claim_links").insert({
      story_event_id: eventIds[link.event_index],
      story_claim_id: claimIds[link.claim_index],
      relation_type: link.relation_type ?? "about",
    });
  }
}
