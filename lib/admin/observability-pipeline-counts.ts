import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getNeoPipelineCounts,
  type NeoPipelineCounts,
} from '@/lib/neo4j/queries/pipeline-counts'

export type ObservabilityPipelineCounts = {
  ingest: { storiesTotal: number }
  relevance: {
    keep: number
    drop: number
    pending: number
    unclassified: number
  }
  scrape: {
    awaiting: number
    fails24h: number
    successRate24h: number | null
  }
  clean: { awaiting: number }
  graphJobs: {
    pending: number
    running: number
    failed: number
    quarantined: number
    succeeded: number
    cancelled: number
  }
  stuckProcessing: number
  neo: NeoPipelineCounts
  projections: {
    controversiesOpen: number
    controversiesDeveloping: number
    controversiesClosed: number
    publishBlocked: {
      insufficient_sides: number
      no_sources: number
      no_viewpoints: number
    }
    viewpoints: number
    evidence: number
    excerpts: number
    assessments: number
    people: number
  }
  l3: {
    queuePending: number
    queueLeased: number
    proposalsSubmitted: number
    proposalsApplied: number
    proposalsRejected: number
    goldNegatives: number
    questionsProjected: number
    q1: number
    q2plus: number
  }
}

async function countEq(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string | boolean | null
): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true })
  if (value === null) {
    query = query.is(column, null)
  } else {
    query = query.eq(column, value)
  }
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

async function countAll(
  supabase: SupabaseClient,
  table: string
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

type HealthReportRow = {
  awaiting_scrape?: number | string | null
  awaiting_cleaning?: number | string | null
  stuck_processing?: number | string | null
  scrape_successes_24h?: number | string | null
  scrape_failures_24h?: number | string | null
  scrape_total_24h?: number | string | null
}

function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

type PostgresPipelineCounts = Omit<ObservabilityPipelineCounts, 'neo'>

/** Postgres-only pipeline snapshot (no Neo round trip). */
export async function gatherPostgresPipelineCounts(
  supabase: SupabaseClient
): Promise<PostgresPipelineCounts> {
  const [
    storiesTotal,
    relevanceKeep,
    relevanceDrop,
    relevancePending,
    relevanceUnclassified,
    healthRes,
    graphPending,
    graphRunning,
    graphFailed,
    graphQuarantined,
    graphSucceeded,
    graphCancelled,
    controversiesOpen,
    controversiesDeveloping,
    controversiesClosed,
    blockSides,
    blockSources,
    blockViewpoints,
    viewpointsPg,
    evidencePg,
    excerptsPg,
    assessmentsPg,
    peoplePg,
    l3QueuePending,
    l3QueueLeased,
    l3Submitted,
    l3Applied,
    l3Rejected,
    l3Gold,
    l3Questions,
    l3Q1rows,
  ] = await Promise.all([
    countAll(supabase, 'stories'),
    countEq(supabase, 'stories', 'relevance_status', 'KEEP'),
    countEq(supabase, 'stories', 'relevance_status', 'DROP'),
    countEq(supabase, 'stories', 'relevance_status', 'PENDING'),
    countEq(supabase, 'stories', 'relevance_status', null),
    supabase.rpc('get_daily_health_report').single(),
    countEq(supabase, 'graph_processing_jobs', 'status', 'pending'),
    countEq(supabase, 'graph_processing_jobs', 'status', 'running'),
    countEq(supabase, 'graph_processing_jobs', 'status', 'failed'),
    countEq(supabase, 'graph_processing_jobs', 'status', 'quarantined'),
    countEq(supabase, 'graph_processing_jobs', 'status', 'succeeded'),
    countEq(supabase, 'graph_processing_jobs', 'status', 'cancelled'),
    countEq(supabase, 'graph_controversies', 'status', 'open'),
    countEq(supabase, 'graph_controversies', 'status', 'developing'),
    countEq(supabase, 'graph_controversies', 'status', 'closed'),
    countEq(supabase, 'graph_controversies', 'publish_block_reason', 'insufficient_sides'),
    countEq(supabase, 'graph_controversies', 'publish_block_reason', 'no_sources'),
    countEq(supabase, 'graph_controversies', 'publish_block_reason', 'no_viewpoints'),
    countAll(supabase, 'graph_viewpoints'),
    countAll(supabase, 'graph_controversy_evidence'),
    countAll(supabase, 'graph_evidence_excerpts'),
    countAll(supabase, 'graph_assessments'),
    countAll(supabase, 'graph_people'),
    countEq(supabase, 'l3_review_queue', 'state', 'pending'),
    countEq(supabase, 'l3_review_queue', 'state', 'leased'),
    countEq(supabase, 'l3_proposals', 'status', 'submitted'),
    countEq(supabase, 'l3_proposals', 'status', 'applied'),
    countEq(supabase, 'l3_proposals', 'status', 'rejected'),
    countAll(supabase, 'l3_gold_negatives'),
    countAll(supabase, 'graph_questions'),
    supabase.from('graph_questions').select('uid', { count: 'exact', head: true }).eq('member_count', 1),
  ])

  if (healthRes.error) throw healthRes.error
  const health = (healthRes.data ?? {}) as HealthReportRow

  const scrapeTotal24h = num(health.scrape_total_24h)
  const scrapeSuccesses24h = num(health.scrape_successes_24h)
  const scrapeFails24h = num(health.scrape_failures_24h)
  const successRate24h =
    scrapeTotal24h > 0
      ? Math.round((scrapeSuccesses24h / scrapeTotal24h) * 1000) / 10
      : null

  return {
    ingest: { storiesTotal },
    relevance: {
      keep: relevanceKeep,
      drop: relevanceDrop,
      pending: relevancePending,
      unclassified: relevanceUnclassified,
    },
    scrape: {
      awaiting: num(health.awaiting_scrape),
      fails24h: scrapeFails24h,
      successRate24h,
    },
    clean: { awaiting: num(health.awaiting_cleaning) },
    graphJobs: {
      pending: graphPending,
      running: graphRunning,
      failed: graphFailed,
      quarantined: graphQuarantined,
      succeeded: graphSucceeded,
      cancelled: graphCancelled,
    },
    stuckProcessing: num(health.stuck_processing),
    projections: {
      controversiesOpen,
      controversiesDeveloping,
      controversiesClosed,
      publishBlocked: {
        insufficient_sides: blockSides,
        no_sources: blockSources,
        no_viewpoints: blockViewpoints,
      },
      viewpoints: viewpointsPg,
      evidence: evidencePg,
      excerpts: excerptsPg,
      assessments: assessmentsPg,
      people: peoplePg,
    },
    l3: {
      queuePending: l3QueuePending,
      queueLeased: l3QueueLeased,
      proposalsSubmitted: l3Submitted,
      proposalsApplied: l3Applied,
      proposalsRejected: l3Rejected,
      goldNegatives: l3Gold,
      questionsProjected: l3Questions,
      q1: l3Q1rows.count ?? 0,
      q2plus: Math.max(0, l3Questions - (l3Q1rows.count ?? 0)),
    },
  }
}

/** Gather Postgres + Neo snapshot for Observability pipeline funnel. */
export async function gatherObservabilityPipelineCounts(
  supabase: SupabaseClient
): Promise<ObservabilityPipelineCounts> {
  const [postgres, neo] = await Promise.all([
    gatherPostgresPipelineCounts(supabase),
    getNeoPipelineCounts(),
  ])
  return { ...postgres, neo }
}
