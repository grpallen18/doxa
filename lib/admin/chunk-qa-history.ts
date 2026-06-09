import type { SupabaseClient } from '@supabase/supabase-js'
import { claimRowKey, ensureStableClaimIds } from '@/lib/admin/chunk-claim-ids'

const CLAIMS_QA_STAGES = [
  'chunk_review_claims',
  'chunk_refine_claims',
  'chunk_review',
  'chunk_refine',
] as const

export type ClaimSnapshot = {
  claim_id: string
  index: number
  raw_text: string
  polarity: string | null
  stance: string | null
}

export type ClaimDiffEntry = {
  claim_id: string
  index: number | null
  change: 'added' | 'removed' | 'updated'
  before: ClaimSnapshot | null
  after: ClaimSnapshot | null
}

export type ClaimVersionCell = {
  version: number
  label: string
  raw_text: string | null
  polarity: string | null
  stance: string | null
  changed: boolean
}

export type ClaimVersionRow = {
  row_key: string
  label: string
  versions: ClaimVersionCell[]
}

export type ChunkQaHistoryEvent = {
  id: string
  kind: 'review' | 'refine'
  stage: string
  created_at: string
  run_id: string | null
  prompt_version_number: number | null
  prompt_step_id: string | null
  model_name: string | null
  cycle_number: number | null
  review_summary: string | null
  review_passes: boolean | null
  claims_before: ClaimSnapshot[]
  claims_after: ClaimSnapshot[]
  claim_diffs: ClaimDiffEntry[]
  report: unknown
}

export type ChunkQaHistoryPayload = {
  events: ChunkQaHistoryEvent[]
  claim_version_matrix: ClaimVersionRow[]
  version_labels: string[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

type SnapshotContext = {
  storyId: string
  chunkIndex: number
}

export function extractClaimsFromSnapshot(
  snapshot: unknown,
  context?: SnapshotContext
): ClaimSnapshot[] {
  const blob = asRecord(snapshot)
  if (!blob) return []

  const rawClaims = asArray(blob.claims)
    .map((row) => (asRecord(row) ? { ...(asRecord(row) as Record<string, unknown>) } : null))
    .filter((row): row is Record<string, unknown> => row != null)

  const withIds =
    context != null
      ? ensureStableClaimIds(rawClaims, context.storyId, context.chunkIndex, { backfill: true })
      : rawClaims

  return withIds
    .map((row, index) => {
      const raw_text = str(row.raw_text)?.trim() ?? ''
      if (!raw_text) return null
      const claim_id = str(row.claim_id) ?? claimRowKey({ claim_id: null, index })
      return {
        claim_id,
        index,
        raw_text,
        polarity: str(row.polarity),
        stance: str(row.stance),
      }
    })
    .filter((c): c is ClaimSnapshot => c != null)
}

function claimSnapshotsById(claims: ClaimSnapshot[]): Map<string, ClaimSnapshot> {
  return new Map(claims.map((claim) => [claim.claim_id, claim]))
}

export function diffClaimSnapshots(before: ClaimSnapshot[], after: ClaimSnapshot[]): ClaimDiffEntry[] {
  const beforeMap = claimSnapshotsById(before)
  const afterMap = claimSnapshotsById(after)
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()])
  const diffs: ClaimDiffEntry[] = []

  for (const claimId of allIds) {
    const b = beforeMap.get(claimId) ?? null
    const a = afterMap.get(claimId) ?? null
    if (b && a) {
      if (b.raw_text === a.raw_text && b.polarity === a.polarity && b.stance === a.stance) continue
      diffs.push({
        claim_id: claimId,
        index: a.index,
        change: 'updated',
        before: b,
        after: a,
      })
    } else if (b && !a) {
      diffs.push({
        claim_id: claimId,
        index: b.index,
        change: 'removed',
        before: b,
        after: null,
      })
    } else if (!b && a) {
      diffs.push({
        claim_id: claimId,
        index: a.index,
        change: 'added',
        before: null,
        after: a,
      })
    }
  }

  return diffs.sort((left, right) => {
    const leftIndex = left.index ?? left.before?.index ?? left.after?.index ?? 0
    const rightIndex = right.index ?? right.before?.index ?? right.after?.index ?? 0
    return leftIndex - rightIndex
  })
}

function isReviewStage(stage: string): boolean {
  return stage === 'chunk_review_claims' || stage === 'chunk_review'
}

function isRefineStage(stage: string): boolean {
  return stage === 'chunk_refine_claims' || stage === 'chunk_refine'
}

function cycleFromReport(kind: 'review' | 'refine', report: unknown): number | null {
  const r = asRecord(report)
  if (!r) return null
  if (kind === 'refine') {
    const cycle = r.refinement_cycle
    return typeof cycle === 'number' && Number.isFinite(cycle) ? cycle : null
  }
  const attempt = r.attempt_number
  return typeof attempt === 'number' && Number.isFinite(attempt) ? attempt : null
}

function reviewMetaFromReport(report: unknown): { summary: string | null; passes: boolean | null } {
  const r = asRecord(report)
  if (!r) return { summary: null, passes: null }
  return {
    summary: str(r.summary),
    passes: typeof r.passes_review === 'boolean' ? r.passes_review : null,
  }
}

export function buildClaimVersionMatrix(
  events: ChunkQaHistoryEvent[]
): { rows: ClaimVersionRow[]; version_labels: string[] } {
  const refineEvents = events.filter((e) => e.kind === 'refine')
  const firstReview = events.find((e) => e.kind === 'review')

  const baseline =
    firstReview?.claims_after ??
    refineEvents[0]?.claims_before ??
    []

  const versionColumns: ClaimSnapshot[][] = [baseline]
  for (const event of refineEvents) {
    versionColumns.push(event.claims_after)
  }

  if (versionColumns.every((col) => col.length === 0)) {
    return { rows: [], version_labels: [] }
  }

  const version_labels = versionColumns.map((_, i) => {
    if (i === 0) return firstReview ? 'At first review' : 'Before first refine'
    return `After refine ${i}`
  })

  const claimOrder: string[] = []
  const seen = new Set<string>()
  for (const col of versionColumns) {
    for (const claim of col) {
      if (seen.has(claim.claim_id)) continue
      seen.add(claim.claim_id)
      claimOrder.push(claim.claim_id)
    }
  }

  const rows: ClaimVersionRow[] = claimOrder.map((claimId) => {
    const versions: ClaimVersionCell[] = versionColumns.map((col, versionIndex) => {
      const cell = col.find((claim) => claim.claim_id === claimId) ?? null
      const prevCell =
        versionIndex > 0
          ? versionColumns[versionIndex - 1].find((claim) => claim.claim_id === claimId) ?? null
          : null
      const changed =
        versionIndex > 0 &&
        (cell == null ||
          prevCell == null ||
          prevCell.raw_text !== cell.raw_text ||
          prevCell.polarity !== cell.polarity ||
          prevCell.stance !== cell.stance)
      return {
        version: versionIndex,
        label: version_labels[versionIndex] ?? `v${versionIndex}`,
        raw_text: cell?.raw_text ?? null,
        polarity: cell?.polarity ?? null,
        stance: cell?.stance ?? null,
        changed,
      }
    })

    const labelClaim =
      versions.find((cell) => cell.raw_text)?.raw_text ??
      claimId

    return {
      row_key: claimId,
      label: labelClaim.slice(0, 80),
      versions,
    }
  })

  return { rows, version_labels }
}

function mapArtifactToEvent(
  row: {
    id: string
    stage: string
    input_snapshot: unknown
    output_snapshot: unknown
    report: unknown
    run_id: string | null
    created_at: string
    pipeline_runs?: {
      model_name: string | null
      prompt_version_id: string | null
      agent_prompt_versions?: {
        version_number: number | null
        step_id: string | null
      } | null
    } | null
  },
  context: SnapshotContext
): ChunkQaHistoryEvent | null {
  const stage = row.stage
  if (!isReviewStage(stage) && !isRefineStage(stage)) return null

  const kind = isReviewStage(stage) ? 'review' : 'refine'
  const run = row.pipeline_runs
  const prompt = run?.agent_prompt_versions

  if (kind === 'review') {
    const claims = extractClaimsFromSnapshot(row.input_snapshot, context)
    const { summary, passes } = reviewMetaFromReport(row.report)
    return {
      id: row.id,
      kind,
      stage,
      created_at: row.created_at,
      run_id: row.run_id,
      prompt_version_number: prompt?.version_number ?? null,
      prompt_step_id: prompt?.step_id ?? null,
      model_name: run?.model_name ?? null,
      cycle_number: cycleFromReport(kind, row.report),
      review_summary: summary,
      review_passes: passes,
      claims_before: claims,
      claims_after: claims,
      claim_diffs: [],
      report: row.report,
    }
  }

  const before = extractClaimsFromSnapshot(row.input_snapshot, context)
  const after = extractClaimsFromSnapshot(row.output_snapshot, context)
  return {
    id: row.id,
    kind,
    stage,
    created_at: row.created_at,
    run_id: row.run_id,
    prompt_version_number: prompt?.version_number ?? null,
    prompt_step_id: prompt?.step_id ?? null,
    model_name: run?.model_name ?? null,
    cycle_number: cycleFromReport(kind, row.report),
    review_summary: null,
    review_passes: null,
    claims_before: before,
    claims_after: after,
    claim_diffs: diffClaimSnapshots(before, after),
    report: row.report,
  }
}

export async function fetchChunkQaHistory(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number
): Promise<ChunkQaHistoryPayload> {
  const { data, error } = await supabase
    .from('story_extraction_qa_artifacts')
    .select(
      `
      id,
      stage,
      chunk_index,
      input_snapshot,
      output_snapshot,
      report,
      run_id,
      created_at,
      pipeline_runs (
        model_name,
        prompt_version_id,
        agent_prompt_versions (
          version_number,
          step_id
        )
      )
    `
    )
    .eq('story_id', storyId)
    .eq('chunk_index', chunkIndex)
    .in('stage', [...CLAIMS_QA_STAGES])
    .order('created_at', { ascending: true })

  if (error) throw error

  const events = (data ?? [])
    .map((raw) => {
      const row = raw as Record<string, unknown>
      const runRaw = row.pipeline_runs
      const runRecord = Array.isArray(runRaw) ? runRaw[0] : runRaw
      const run = asRecord(runRecord)
      const promptRaw = run?.agent_prompt_versions
      const promptRecord = Array.isArray(promptRaw) ? promptRaw[0] : promptRaw
      const prompt = asRecord(promptRecord)

      return mapArtifactToEvent(
        {
          id: String(row.id),
          stage: String(row.stage),
          input_snapshot: row.input_snapshot,
          output_snapshot: row.output_snapshot,
          report: row.report,
          run_id: typeof row.run_id === 'string' ? row.run_id : null,
          created_at: String(row.created_at),
          pipeline_runs: run
            ? {
                model_name: str(run.model_name),
                prompt_version_id: str(run.prompt_version_id),
                agent_prompt_versions: prompt
                  ? {
                      version_number:
                        typeof prompt.version_number === 'number' ? prompt.version_number : null,
                      step_id: str(prompt.step_id),
                    }
                  : null,
              }
            : null,
        },
        { storyId, chunkIndex }
      )
    })
    .filter((e): e is ChunkQaHistoryEvent => e != null)

  const { rows, version_labels } = buildClaimVersionMatrix(events)

  return {
    events,
    claim_version_matrix: rows,
    version_labels,
  }
}
