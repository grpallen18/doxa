import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ExtractionJson } from "./types.ts";

export async function loadMergedExtractionJson(
  supabase: SupabaseClient,
  storyId: string
): Promise<{ articleText: string; extraction: ExtractionJson }> {
  const [bodyRes, claimsRes, evidenceRes, positionsRes, eventsRes] = await Promise.all([
    supabase.from("story_bodies").select("content_clean").eq("story_id", storyId).maybeSingle(),
    supabase.from("story_claims").select("story_claim_id, raw_text, polarity, stance, extraction_confidence, span_start, span_end").eq("story_id", storyId).order("created_at"),
    supabase.from("story_evidence").select("evidence_id, evidence_type, excerpt, attribution, source_ref, extraction_confidence").eq("story_id", storyId).order("created_at"),
    supabase.from("story_positions").select("story_position_id, raw_text, extraction_confidence, excerpt_text, cue_phrases, speaker_type").eq("story_id", storyId).order("created_at"),
    supabase.from("story_events").select("story_event_id, event_summary, primary_actor, action, object, event_date, event_timeframe_start, event_timeframe_end, location, event_type, extraction_confidence").eq("story_id", storyId).order("created_at"),
  ]);

  const storyRes = await supabase.from("stories").select("content_full, content_snippet").eq("story_id", storyId).maybeSingle();
  const articleText =
    bodyRes.data?.content_clean ??
    storyRes.data?.content_full ??
    storyRes.data?.content_snippet ??
    "";

  const claims = (claimsRes.data ?? []).map((c) => ({
    raw_text: c.raw_text,
    polarity: c.polarity,
    stance: c.stance,
    extraction_confidence: c.extraction_confidence,
    span_start: c.span_start,
    span_end: c.span_end,
    _id: c.story_claim_id,
  }));

  const evidence = (evidenceRes.data ?? []).map((e) => ({
    evidence_type: e.evidence_type,
    excerpt: e.excerpt,
    attribution: e.attribution,
    source_ref: e.source_ref,
    extraction_confidence: e.extraction_confidence,
    _id: e.evidence_id,
  }));

  const positions = (positionsRes.data ?? []).map((p) => ({
    raw_text: p.raw_text,
    extraction_confidence: p.extraction_confidence,
    excerpt_text: p.excerpt_text,
    cue_phrases: p.cue_phrases,
    speaker_type: p.speaker_type,
    _id: p.story_position_id,
  }));

  const events = (eventsRes.data ?? []).map((ev) => ({
    event_summary: ev.event_summary,
    primary_actor: ev.primary_actor,
    action: ev.action,
    object: ev.object,
    event_date: ev.event_date,
    event_timeframe_start: ev.event_timeframe_start,
    event_timeframe_end: ev.event_timeframe_end,
    location: ev.location,
    event_type: ev.event_type,
    extraction_confidence: ev.extraction_confidence,
    _id: ev.story_event_id,
  }));

  const claimIdToIndex = new Map<string, number>();
  const evidenceIdToIndex = new Map<string, number>();
  const positionIdToIndex = new Map<string, number>();
  const eventIdToIndex = new Map<string, number>();

  claims.forEach((c, i) => claimIdToIndex.set(String(c._id), i));
  evidence.forEach((e, i) => evidenceIdToIndex.set(String(e._id), i));
  positions.forEach((p, i) => positionIdToIndex.set(String(p._id), i));
  events.forEach((ev, i) => eventIdToIndex.set(String(ev._id), i));

  const claimIds = new Set(claims.map((c) => String(c._id)));
  const evidenceIds = new Set(evidence.map((e) => String(e._id)));
  const positionIds = new Set(positions.map((p) => String(p._id)));
  const eventIds = new Set(events.map((ev) => String(ev._id)));

  const [ceLinksAll, pcLinksAll, peLinksAll, ecLinksAll, eeLinksAll] = await Promise.all([
    supabase.from("story_claim_evidence_links").select("story_claim_id, evidence_id, relation_type, confidence"),
    supabase.from("story_position_claim_links").select("story_position_id, story_claim_id"),
    supabase.from("story_position_evidence_links").select("story_position_id, evidence_id"),
    supabase.from("story_event_claim_links").select("story_event_id, story_claim_id, relation_type"),
    supabase.from("story_event_evidence_links").select("story_event_id, evidence_id"),
  ]);

  const ceLinks = (ceLinksAll.data ?? []).filter(
    (l) => claimIds.has(String(l.story_claim_id)) && evidenceIds.has(String(l.evidence_id))
  );
  const pcLinks = (pcLinksAll.data ?? []).filter(
    (l) => positionIds.has(String(l.story_position_id)) && claimIds.has(String(l.story_claim_id))
  );
  const peLinks = (peLinksAll.data ?? []).filter(
    (l) => positionIds.has(String(l.story_position_id)) && evidenceIds.has(String(l.evidence_id))
  );
  const ecLinks = (ecLinksAll.data ?? []).filter(
    (l) => eventIds.has(String(l.story_event_id)) && claimIds.has(String(l.story_claim_id))
  );
  const eeLinks = (eeLinksAll.data ?? []).filter(
    (l) => eventIds.has(String(l.story_event_id)) && evidenceIds.has(String(l.evidence_id))
  );

  const extraction: ExtractionJson = {
    claims: claims.map(({ _id: _, ...rest }) => rest),
    evidence: evidence.map(({ _id: _, ...rest }) => rest),
    positions: positions.map(({ _id: _, ...rest }) => rest),
    events: events.map(({ _id: _, ...rest }) => rest),
    claim_evidence_links: ceLinks.map((l) => ({
      claim_index: claimIdToIndex.get(String(l.story_claim_id)) ?? 0,
      evidence_index: evidenceIdToIndex.get(String(l.evidence_id)) ?? 0,
      relation_type: l.relation_type,
      confidence: l.confidence,
      rationale: null,
    })),
    position_claim_links: pcLinks.map((l) => ({
      position_index: positionIdToIndex.get(String(l.story_position_id)) ?? 0,
      claim_index: claimIdToIndex.get(String(l.story_claim_id)) ?? 0,
    })),
    position_evidence_links: peLinks.map((l) => ({
      position_index: positionIdToIndex.get(String(l.story_position_id)) ?? 0,
      evidence_index: evidenceIdToIndex.get(String(l.evidence_id)) ?? 0,
    })),
    event_claim_links: ecLinks.map((l) => ({
      event_index: eventIdToIndex.get(String(l.story_event_id)) ?? 0,
      claim_index: claimIdToIndex.get(String(l.story_claim_id)) ?? 0,
      relation_type: l.relation_type,
    })),
    event_evidence_links: eeLinks.map((l) => ({
      event_index: eventIdToIndex.get(String(l.story_event_id)) ?? 0,
      evidence_index: evidenceIdToIndex.get(String(l.evidence_id)) ?? 0,
    })),
  };

  return { articleText, extraction };
}

export async function loadChunkBlobsUnion(
  supabase: SupabaseClient,
  storyId: string
): Promise<ExtractionJson> {
  const { data } = await supabase
    .from("story_chunks")
    .select("extraction_json")
    .eq("story_id", storyId)
    .order("chunk_index");

  const merged: ExtractionJson = {
    claims: [],
    evidence: [],
    positions: [],
    events: [],
  };

  for (const row of data ?? []) {
    const blob = row.extraction_json as ExtractionJson | null;
    if (!blob) continue;
    if (Array.isArray(blob.claims)) merged.claims!.push(...blob.claims);
    if (Array.isArray(blob.evidence)) merged.evidence!.push(...blob.evidence);
    if (Array.isArray(blob.positions)) merged.positions!.push(...blob.positions);
    if (Array.isArray(blob.events)) merged.events!.push(...blob.events);
  }

  return merged;
}
