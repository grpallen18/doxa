import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type StoryStepOutcome = "success" | "failure" | "looping" | "skipped" | "no_op";
export type StoryStepTrigger = "cron" | "admin" | "callback" | "internal";

export type RecordStoryStepRunInput = {
  storyId: string;
  stepId: string;
  deployName: string;
  outcome: StoryStepOutcome;
  trigger: StoryStepTrigger;
  pipelineRunId?: string | null;
  chunkIndex?: number | null;
  actorId?: string | null;
  meta?: Record<string, unknown>;
  error?: string | null;
  endedAt?: string | null;
};

export type BatchStoryStepSummary = {
  storyId: string;
  processed: number;
  chunkIndices: number[];
  /** Text chunks inserted for this story (chunk-story-bodies). */
  chunksCreated?: number;
  stepComplete?: boolean;
  blocked?: boolean;
  skipped?: boolean;
  error?: string | null;
  modelName?: string | null;
  modelNames?: string[];
};

export function resolveStoryStepTrigger(singleStoryId: string | null): StoryStepTrigger {
  return singleStoryId ? "admin" : "cron";
}

export function inferBatchStoryOutcome(summary: {
  processed: number;
  stepComplete?: boolean;
  blocked?: boolean;
  skipped?: boolean;
  error?: string | null;
}): StoryStepOutcome {
  if (summary.error) return "failure";
  if (summary.skipped) return "skipped";
  if (summary.processed === 0) return "no_op";
  if (summary.blocked) return "failure";
  if (summary.stepComplete) return "success";
  return "looping";
}

export async function recordStoryStepRun(
  supabase: SupabaseClient,
  input: RecordStoryStepRunInput
): Promise<string | null> {
  const { data, error } = await supabase.rpc("append_story_step_run", {
    p_story_id: input.storyId,
    p_step_id: input.stepId,
    p_deploy_name: input.deployName,
    p_outcome: input.outcome,
    p_trigger: input.trigger,
    p_pipeline_run_id: input.pipelineRunId ?? null,
    p_chunk_index: input.chunkIndex ?? null,
    p_actor_id: input.actorId ?? null,
    p_meta: input.meta ?? {},
    p_error: input.error ?? null,
    p_ended_at: input.endedAt ?? null,
  });

  if (error) {
    console.error(`[story-step-runs] append failed step=${input.stepId} story=${input.storyId}:`, error.message);
    return null;
  }

  return typeof data === "string" ? data : null;
}

export async function recordStoryStepRunsForBatch(
  supabase: SupabaseClient,
  base: Omit<RecordStoryStepRunInput, "storyId" | "outcome" | "meta" | "error" | "chunkIndex">,
  summaries: BatchStoryStepSummary[],
  chunkIndexParam: number | null = null
): Promise<void> {
  await Promise.all(
    summaries.map((summary) =>
      recordStoryStepRun(supabase, {
        ...base,
        storyId: summary.storyId,
        outcome: inferBatchStoryOutcome(summary),
        chunkIndex: chunkIndexParam != null && chunkIndexParam >= 0 ? chunkIndexParam : null,
        error: summary.error ?? null,
        meta: {
          processed: summary.processed,
          chunk_indices: summary.chunkIndices,
          ...(summary.chunksCreated != null ? { chunks_created: summary.chunksCreated } : {}),
          step_complete: summary.stepComplete ?? false,
          blocked: summary.blocked ?? false,
          skipped: summary.skipped ?? false,
          ...(summary.modelName ? { model_name: summary.modelName } : {}),
          ...(summary.modelNames?.length ? { model_names: summary.modelNames } : {}),
        },
      })
    )
  );
}

export function groupChunkResultsByStory<T extends { story_id: string; chunk_index: number }>(
  chunks: T[]
): Map<string, number[]> {
  const byStory = new Map<string, number[]>();
  for (const chunk of chunks) {
    const indices = byStory.get(chunk.story_id) ?? [];
    indices.push(chunk.chunk_index);
    byStory.set(chunk.story_id, indices);
  }
  return byStory;
}

type ChunkLane = "claims" | "positions";

export async function getChunkLaneCompletionHints(
  supabase: SupabaseClient,
  storyId: string,
  lane: ChunkLane
): Promise<{ total: number; withJson: number; blocked: boolean; terminalComplete: boolean }> {
  const jsonKey = lane === "claims" ? "extraction_json" : "positions_extraction_json";
  const statusKey = lane === "claims" ? "extraction_qa_status" : "positions_qa_status";

  const { data: chunks, error } = await supabase
    .from("story_chunks")
    .select(`${jsonKey}, ${statusKey}`)
    .eq("story_id", storyId);

  if (error || !chunks?.length) {
    return { total: 0, withJson: 0, blocked: false, terminalComplete: false };
  }

  const rows = chunks as Array<Record<string, unknown>>;
  const total = rows.length;
  const withJson = rows.filter((c) => c[jsonKey] != null).length;
  const blocked = rows.some((c) => c[statusKey] === "needs_human_review");
  const extracted = rows.filter((c) => c[jsonKey] != null);
  const terminalComplete =
    total > 0 &&
    withJson === total &&
    extracted.length > 0 &&
    extracted.every((c) => {
      const status = c[statusKey];
      if (lane === "claims") {
        return status === "passed" || status === "atoms_passed";
      }
      return status === "passed" || status === "atoms_passed";
    });

  return { total, withJson, blocked, terminalComplete };
}

export async function resolveSingleChunkStepOutcome(
  supabase: SupabaseClient,
  storyId: string,
  lane: ChunkLane,
  stepId: string,
  chunkIndex: number
): Promise<StoryStepOutcome> {
  const jsonKey = lane === "claims" ? "extraction_json" : "positions_extraction_json";
  const statusKey = lane === "claims" ? "extraction_qa_status" : "positions_qa_status";
  const refinementKey =
    lane === "claims" ? "extraction_qa_refinement_count" : "positions_qa_refinement_count";

  const { data: chunk, error } = await supabase
    .from("story_chunks")
    .select(`${jsonKey}, ${statusKey}, ${refinementKey}`)
    .eq("story_id", storyId)
    .eq("chunk_index", chunkIndex)
    .maybeSingle();

  if (error || !chunk) return "failure";

  const row = chunk as Record<string, unknown>;
  const status = row[statusKey] as string | null;
  const refinementCount = Number(row[refinementKey] ?? 0);

  if (stepId === "extract-story-claims" || stepId === "extract-story-positions") {
    return row[jsonKey] != null ? "success" : "failure";
  }

  if (stepId === "validate-chunk-claims" || stepId === "validate-chunk-positions") {
    if (status === "passed" || status === "atoms_passed") return "success";
    if (status === "needs_refinement" || status === "pending") return "success";
    if (status === "needs_human_review") return "success";
    return "looping";
  }

  if (stepId === "refine-chunk-claims" || stepId === "refine-chunk-positions") {
    if (status === "awaiting_approval") return "success";
    if (status === "needs_human_review") return "success";
    if (status === "pending" && refinementCount > 0) return "success";
    if (status === "needs_refinement") return "failure";
    return "success";
  }

  if (stepId === "approve-chunk-claims") {
    if (status === "passed" || status === "atoms_passed") return "success";
    if (status === "needs_refinement") return "success";
    if (status === "needs_human_review") return "success";
    if (status === "awaiting_approval") return "failure";
    return "success";
  }

  return "success";
}

export async function resolveChunkStepOutcome(
  supabase: SupabaseClient,
  storyId: string,
  lane: ChunkLane,
  stepId: string,
  processed: number
): Promise<StoryStepOutcome> {
  if (processed === 0) return "no_op";
  const hints = await getChunkLaneCompletionHints(supabase, storyId, lane);
  if (hints.blocked) return "failure";

  if (stepId === "extract-story-claims" || stepId === "extract-story-positions") {
    return hints.total > 0 && hints.withJson === hints.total ? "success" : "looping";
  }
  if (stepId === "validate-chunk-claims" || stepId === "validate-chunk-positions") {
    return hints.terminalComplete ? "success" : "looping";
  }
  if (stepId === "refine-chunk-claims" || stepId === "refine-chunk-positions") {
    const statusKey = lane === "claims" ? "extraction_qa_status" : "positions_qa_status";
    const { data: chunks } = await supabase
      .from("story_chunks")
      .select(statusKey)
      .eq("story_id", storyId)
      .not(lane === "claims" ? "extraction_json" : "positions_extraction_json", "is", null);
    const needsRefine = (chunks ?? []).some(
      (c) => (c as Record<string, unknown>)[statusKey] === "needs_refinement"
    );
    if (needsRefine) return "looping";
    return hints.terminalComplete ? "success" : "looping";
  }
  if (stepId === "approve-chunk-claims") {
    const { data: chunks } = await supabase
      .from("story_chunks")
      .select("extraction_qa_status")
      .eq("story_id", storyId)
      .not("extraction_json", "is", null);
    const awaiting = (chunks ?? []).some((c) => c.extraction_qa_status === "awaiting_approval");
    const needsRefine = (chunks ?? []).some((c) => c.extraction_qa_status === "needs_refinement");
    if (awaiting || needsRefine) return "looping";
    return hints.terminalComplete ? "success" : "looping";
  }
  return "looping";
}

export async function resolveMergeQaOutcome(
  supabase: SupabaseClient,
  storyId: string,
  stepId: string
): Promise<StoryStepOutcome> {
  const { data: story } = await supabase
    .from("stories")
    .select("merged_at, extraction_qa_status")
    .eq("story_id", storyId)
    .maybeSingle();

  if (!story?.merged_at) return "no_op";
  const qa = story.extraction_qa_status as string | null;
  if (qa === "needs_human_review") return "failure";
  if (stepId === "review-merged-extraction") {
    if (qa === "needs_refinement") return "looping";
    if (qa === "passed" || qa === "reviewed") return "success";
    return qa != null && qa !== "pending" ? "looping" : "looping";
  }
  if (stepId === "refine-merged-extraction") {
    if (qa === "needs_refinement") return "looping";
    return qa != null && qa !== "needs_refinement" ? "success" : "looping";
  }
  if (stepId === "validate-merged-extraction") {
    return qa === "passed" ? "success" : "looping";
  }
  return "looping";
}

export async function logBatchChunkStepRuns(
  supabase: SupabaseClient,
  params: {
    stepId: string;
    deployName: string;
    trigger: StoryStepTrigger;
    lane: ChunkLane;
    pipelineRunId?: string | null;
    chunkIndexParam?: number | null;
    processedChunks: Array<{ story_id: string; chunk_index: number }>;
    dryRun: boolean;
    modelName?: string | null;
    modelNames?: string[];
    debugTrace?: Record<string, unknown> | null;
  }
): Promise<void> {
  if (params.dryRun) return;

  const grouped = groupChunkResultsByStory(params.processedChunks);
  const storiesProcessed = [...grouped.keys()];

  for (const storyId of storiesProcessed) {
    const chunkIndices = grouped.get(storyId) ?? [];
    const processed = chunkIndices.length;
    const outcome =
      params.chunkIndexParam != null &&
      params.chunkIndexParam >= 0 &&
      processed === 1 &&
      chunkIndices[0] === params.chunkIndexParam
        ? await resolveSingleChunkStepOutcome(
            supabase,
            storyId,
            params.lane,
            params.stepId,
            params.chunkIndexParam
          )
        : await resolveChunkStepOutcome(
            supabase,
            storyId,
            params.lane,
            params.stepId,
            processed
          );
    await recordStoryStepRun(supabase, {
      storyId,
      stepId: params.stepId,
      deployName: params.deployName,
      outcome,
      trigger: params.trigger,
      pipelineRunId: params.pipelineRunId ?? null,
      chunkIndex:
        params.chunkIndexParam != null && params.chunkIndexParam >= 0
          ? params.chunkIndexParam
          : null,
      meta: {
        processed,
        chunk_indices: chunkIndices,
        ...(params.modelName ? { model_name: params.modelName } : {}),
        ...(params.modelNames?.length ? { model_names: params.modelNames } : {}),
        ...(params.debugTrace ? { debug_trace: params.debugTrace } : {}),
      },
    });
  }
}

export async function logMergeQaStoryRuns(
  supabase: SupabaseClient,
  params: {
    stepId: string;
    deployName: string;
    trigger: StoryStepTrigger;
    storyIds: string[];
    dryRun: boolean;
    modelName?: string | null;
    modelNames?: string[];
  }
): Promise<void> {
  if (params.dryRun) return;
  for (const storyId of params.storyIds) {
    const outcome = await resolveMergeQaOutcome(supabase, storyId, params.stepId);
    await recordStoryStepRun(supabase, {
      storyId,
      stepId: params.stepId,
      deployName: params.deployName,
      outcome,
      trigger: params.trigger,
      meta: {
        processed: 1,
        ...(params.modelName ? { model_name: params.modelName } : {}),
        ...(params.modelNames?.length ? { model_names: params.modelNames } : {}),
      },
    });
  }
}

type CanonicalEntityKind = "claims" | "events" | "positions";

export async function resolveCanonicalLinkOutcome(
  supabase: SupabaseClient,
  storyId: string,
  kind: CanonicalEntityKind
): Promise<StoryStepOutcome> {
  const config = {
    claims: { table: "story_claims", linkColumn: "claim_id" },
    events: { table: "story_events", linkColumn: "event_id" },
    positions: { table: "story_positions", linkColumn: "canonical_position_id" },
  }[kind];

  const { data, error } = await supabase
    .from(config.table)
    .select(config.linkColumn)
    .eq("story_id", storyId);

  if (error) return "failure";
  if (!data?.length) return "no_op";

  const unlinked = data.filter((row) => {
    const value = (row as Record<string, unknown>)[config.linkColumn];
    return value == null;
  });
  return unlinked.length === 0 ? "success" : "looping";
}

export async function resolveUpdateStancesOutcome(
  supabase: SupabaseClient,
  storyId: string
): Promise<StoryStepOutcome> {
  const { data, error } = await supabase.from("story_claims").select("stance").eq("story_id", storyId);
  if (error) return "failure";
  if (!data?.length) return "no_op";
  const missing = data.filter((row) => (row as { stance: string | null }).stance == null);
  return missing.length === 0 ? "success" : "looping";
}

export async function logCanonicalEntityStoryRuns(
  supabase: SupabaseClient,
  params: {
    stepId: string;
    deployName: string;
    trigger: StoryStepTrigger;
    kind: CanonicalEntityKind | "stances";
    storyIds: string[];
    processedByStory?: Map<string, number>;
    dryRun: boolean;
    modelName?: string | null;
    modelNames?: string[];
  }
): Promise<void> {
  if (params.dryRun) return;

  for (const storyId of params.storyIds) {
    const processed = params.processedByStory?.get(storyId) ?? 0;
    const outcome =
      params.kind === "stances"
        ? await resolveUpdateStancesOutcome(supabase, storyId)
        : await resolveCanonicalLinkOutcome(supabase, storyId, params.kind);

    await recordStoryStepRun(supabase, {
      storyId,
      stepId: params.stepId,
      deployName: params.deployName,
      outcome: processed === 0 ? "no_op" : outcome,
      trigger: params.trigger,
      meta: {
        processed,
        ...(params.modelName ? { model_name: params.modelName } : {}),
        ...(params.modelNames?.length ? { model_names: params.modelNames } : {}),
      },
    });
  }
}

export function buildBatchSummariesFromProcessedChunks(
  processedChunks: Array<{ story_id: string; chunk_index: number }>,
  options?: {
    stepCompleteByStory?: Map<string, boolean>;
    blockedByStory?: Map<string, boolean>;
    skippedByStory?: Set<string>;
    errorByStory?: Map<string, string>;
  }
): BatchStoryStepSummary[] {
  const grouped = groupChunkResultsByStory(processedChunks);
  const summaries: BatchStoryStepSummary[] = [];

  for (const [storyId, chunkIndices] of grouped) {
    summaries.push({
      storyId,
      processed: chunkIndices.length,
      chunkIndices,
      stepComplete: options?.stepCompleteByStory?.get(storyId),
      blocked: options?.blockedByStory?.get(storyId),
      skipped: options?.skippedByStory?.has(storyId),
      error: options?.errorByStory?.get(storyId) ?? null,
    });
  }

  return summaries;
}
