import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ClaimVersionSource = "extractor" | "refiner";

export type ClaimVersionReviewOutcome = "passed" | "needs_refinement" | "needs_human_review";

export type ChunkClaimVersionRow = {
  id: string;
  story_id: string;
  chunk_index: number;
  version_number: number;
  source: ClaimVersionSource;
  parent_version_id: string | null;
  created_from_review_artifact_id: string | null;
  claims_json: Record<string, unknown>;
  review_outcome: ClaimVersionReviewOutcome | null;
  run_id: string | null;
  created_at: string;
};

type ClaimsJson = { claims?: unknown[] };

function asClaimsJson(value: unknown): ClaimsJson {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ClaimsJson;
  }
  return { claims: [] };
}

export async function deleteClaimVersionById(
  supabase: SupabaseClient,
  versionId: string
): Promise<void> {
  for (const column of [
    "claim_version_id",
    "input_claim_version_id",
    "output_claim_version_id",
  ] as const) {
    const { error } = await supabase
      .from("story_extraction_qa_artifacts")
      .update({ [column]: null })
      .eq(column, versionId);
    if (error) throw new Error(error.message);
  }

  const { error: deleteErr } = await supabase
    .from("chunk_claim_versions")
    .delete()
    .eq("id", versionId)
    .eq("source", "refiner");

  if (deleteErr) throw new Error(deleteErr.message);
}

export async function deleteClaimVersionsForChunk(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number
): Promise<void> {
  const { error: clearErr } = await supabase
    .from("story_chunks")
    .update({ active_claim_version_id: null })
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex);

  if (clearErr) throw new Error(clearErr.message);

  const { error: deleteErr } = await supabase
    .from("chunk_claim_versions")
    .delete()
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex);

  if (deleteErr) throw new Error(deleteErr.message);
}

export async function insertClaimVersion(
  supabase: SupabaseClient,
  params: {
    storyId: string;
    chunkIndex: number;
    versionNumber: number;
    source: ClaimVersionSource;
    claimsJson: unknown;
    parentVersionId?: string | null;
    createdFromReviewArtifactId?: string | null;
    runId?: string | null;
    reviewOutcome?: ClaimVersionReviewOutcome | null;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from("chunk_claim_versions")
    .insert({
      story_id: params.storyId,
      chunk_index: params.chunkIndex,
      version_number: params.versionNumber,
      source: params.source,
      parent_version_id: params.parentVersionId ?? null,
      created_from_review_artifact_id: params.createdFromReviewArtifactId ?? null,
      claims_json: asClaimsJson(params.claimsJson),
      run_id: params.runId ?? null,
      review_outcome: params.reviewOutcome ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("insertClaimVersion: no id returned");
  return data.id as string;
}

export async function setActiveClaimVersion(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number,
  versionId: string,
  claimsJson: unknown
): Promise<void> {
  const projection = asClaimsJson(claimsJson);
  const { error } = await supabase
    .from("story_chunks")
    .update({
      active_claim_version_id: versionId,
      extraction_json: projection,
    })
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex);

  if (error) throw new Error(error.message);
}

export async function getActiveClaimVersion(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number
): Promise<ChunkClaimVersionRow | null> {
  const { data: chunk, error: chunkErr } = await supabase
    .from("story_chunks")
    .select("active_claim_version_id")
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex)
    .single();

  if (chunkErr) throw new Error(chunkErr.message);
  const versionId = chunk?.active_claim_version_id as string | null;
  if (!versionId) return null;

  const { data, error } = await supabase
    .from("chunk_claim_versions")
    .select(
      "id, story_id, chunk_index, version_number, source, parent_version_id, created_from_review_artifact_id, claims_json, review_outcome, run_id, created_at"
    )
    .eq("id", versionId)
    .single();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as ChunkClaimVersionRow;
}

export async function updateClaimVersionClaims(
  supabase: SupabaseClient,
  versionId: string,
  claimsJson: unknown
): Promise<void> {
  const { error } = await supabase
    .from("chunk_claim_versions")
    .update({ claims_json: asClaimsJson(claimsJson) })
    .eq("id", versionId);

  if (error) throw new Error(error.message);
}

export async function setClaimVersionReviewOutcome(
  supabase: SupabaseClient,
  versionId: string,
  outcome: ClaimVersionReviewOutcome | null
): Promise<void> {
  const { error } = await supabase
    .from("chunk_claim_versions")
    .update({ review_outcome: outcome })
    .eq("id", versionId);

  if (error) throw new Error(error.message);
}

export async function getNextClaimVersionNumber(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number
): Promise<number> {
  const { data, error } = await supabase
    .from("chunk_claim_versions")
    .select("version_number")
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return 0;
  return (data.version_number as number) + 1;
}

export async function getReviewArtifactForClaimVersion(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number,
  claimVersionId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("story_extraction_qa_artifacts")
    .select("id")
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex)
    .eq("stage", "chunk_review_claims")
    .eq("claim_version_id", claimVersionId)
    .is("reverted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) return null;
  return { id: data.id as string };
}

export async function getLatestReviewArtifactForChunk(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number
): Promise<{ id: string; report: Record<string, unknown> } | null> {
  const { data, error } = await supabase
    .from("story_extraction_qa_artifacts")
    .select("id, report")
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex)
    .eq("stage", "chunk_review_claims")
    .is("reverted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) return null;
  const report =
    data.report && typeof data.report === "object" && !Array.isArray(data.report)
      ? (data.report as Record<string, unknown>)
      : {};
  return { id: data.id as string, report };
}
