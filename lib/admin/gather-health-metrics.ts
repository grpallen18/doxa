import type { SupabaseClient } from '@supabase/supabase-js'
import type { ObservabilityPipelineCounts } from '@/lib/admin/observability-pipeline-counts'
import { gatherCachedAdminHealthSnapshot } from '@/lib/admin/gather-admin-health-snapshot'
import { gatherAdminRangeMetrics } from '@/lib/admin/gather-range-metrics'
import { mergeHealthSections } from '@/lib/admin/merge-health-sections'
import type { NeoPipelineCounts } from '@/lib/neo4j/queries/pipeline-counts'
import { type MetricRange } from '@/lib/admin/metric-range'

export type AdminHealthMetricId =
  | 'ingest.period'
  | 'ingest.keep'
  | 'ingest.drop'
  | 'ingest.pending'
  | 'ingest.pending_now'
  | 'pre.scrape_awaiting'
  | 'pre.clean_awaiting'
  | 'pre.scrape_succeeded'
  | 'pre.scrape_fails'
  | 'pre.scrape_rate'
  | 'gp.queued'
  | 'gp.completed'
  | 'gp.succeeded'
  | 'gp.failed'
  | 'gp.quarantined'
  | 'gp.rate'
  | 'gp.failed_now'
  | 'gp.quarantined_now'
  | 'neo.documents'
  | 'neo.utterances'
  | 'neo.propositions'
  | 'neo.arguments'
  | 'neo.agents'
  | 'neo.questions'
  | 'neo.controversies'
  | 'neo.viewpoints'
  | 'neo.disputes'
  | 'neo.evidence_checks'
  | 'neo.citations'
  | 'neo.assessments'
  | 'other.stuck'

export type AdminHealthMetric = {
  id: AdminHealthMetricId
  label: string
  value: string | number
  href?: string
  /** Point-in-time backlog; not filtered by the selected date range. */
  snapshot?: boolean
}

export type AdminHealthMetricSection = {
  id: string
  title: string
  metrics: AdminHealthMetric[]
}

export type AdminHealthMetricsPayload = {
  range: MetricRange
  windowDays: number
  sections: AdminHealthMetricSection[]
}

export type AdminHealthSnapshotPayload = {
  polledAt: string
  sections: AdminHealthMetricSection[]
}

export type RangeHealthAggregates = {
  periodIngest: number
  keepTotal: number
  dropTotal: number
  pendingTotal: number
  scrapeSuccess: number
  scrapeFailure: number
  graphsSucceeded: number
  graphsFailed: number
  graphsQuarantined: number
}

type ScrapeDayBucket = {
  success_count: number | string | null
  failure_count: number | string | null
}

type GatingDayBucket = {
  keep_count: number | string | null
  drop_count: number | string | null
  pending_count: number | string | null
}

type IngestDayBucket = {
  count: number | string | null
}

function sumRows<T>(
  rows: T[] | null | undefined,
  pick: (row: T) => number
): number {
  let total = 0
  for (const row of rows ?? []) {
    total += pick(row)
  }
  return total
}

export function formatSuccessRate(success: number, total: number): string {
  if (total <= 0) return '—'
  return `${Math.round((success / total) * 1000) / 10}%`
}

/** @deprecated Prefer formatSuccessRate(success, success + failure). */
export function formatScrapeSuccessRate(success: number, failure: number): string {
  return formatSuccessRate(success, success + failure)
}

function neoCount(configured: boolean, count: number): number | string {
  return configured ? count : '—'
}

type PipelineForSnapshot = Omit<ObservabilityPipelineCounts, 'neo'> & {
  neo: NeoPipelineCounts
}

/** Snapshot KPI tiles (poll every ~15s). */
export function buildSnapshotHealthSections(
  pipeline: PipelineForSnapshot
): AdminHealthMetricSection[] {
  const pendingNow =
    pipeline.relevance.pending + pipeline.relevance.unclassified
  const graphsQueued =
    pipeline.graphJobs.pending + pipeline.graphJobs.running

  return [
    {
      id: 'ingestion',
      title: 'Ingestion',
      metrics: [
        {
          id: 'ingest.pending_now',
          label: 'Stories pending',
          value: pendingNow,
          href: '/admin/stories',
          snapshot: true,
        },
      ],
    },
    {
      id: 'pre-processing',
      title: 'Pre-Processing',
      metrics: [
        {
          id: 'pre.scrape_awaiting',
          label: 'Scrapes pending',
          value: pipeline.scrape.awaiting,
          href: '/admin/stories',
          snapshot: true,
        },
        {
          id: 'pre.clean_awaiting',
          label: 'Cleaning queue',
          value: pipeline.clean.awaiting,
          href: '/admin/stories',
          snapshot: true,
        },
      ],
    },
    {
      id: 'graph-processing',
      title: 'Graph Processing',
      metrics: [
        {
          id: 'gp.queued',
          label: 'Graphs queued',
          value: graphsQueued,
          href: '/admin/stories',
          snapshot: true,
        },
        {
          id: 'gp.failed_now',
          label: 'Graphs failed',
          value: pipeline.graphJobs.failed,
          href: '/admin/observability',
          snapshot: true,
        },
        {
          id: 'gp.quarantined_now',
          label: 'Graphs quarantined',
          value: pipeline.graphJobs.quarantined,
          href: '/admin/observability',
          snapshot: true,
        },
      ],
    },
    {
      id: 'neo',
      title: 'Neo',
      metrics: [
        {
          id: 'neo.documents',
          label: 'Documents',
          value: neoCount(pipeline.neo.configured, pipeline.neo.documents),
          href: '/admin/neo',
          snapshot: true,
        },
        {
          id: 'neo.utterances',
          label: 'Utterances',
          value: neoCount(pipeline.neo.configured, pipeline.neo.utterances),
          href: '/admin/neo',
          snapshot: true,
        },
        {
          id: 'neo.propositions',
          label: 'Propositions',
          value: neoCount(pipeline.neo.configured, pipeline.neo.propositions),
          href: '/admin/neo',
          snapshot: true,
        },
        {
          id: 'neo.arguments',
          label: 'Arguments',
          value: neoCount(pipeline.neo.configured, pipeline.neo.arguments),
          href: '/admin/neo',
          snapshot: true,
        },
        {
          id: 'neo.agents',
          label: 'Agents',
          value: neoCount(pipeline.neo.configured, pipeline.neo.agents),
          href: '/admin/neo',
          snapshot: true,
        },
        {
          id: 'neo.questions',
          label: 'Questions',
          value: neoCount(pipeline.neo.configured, pipeline.neo.questions),
          href: '/admin/neo',
          snapshot: true,
        },
        {
          id: 'neo.controversies',
          label: 'Controversies',
          value: neoCount(pipeline.neo.configured, pipeline.neo.controversies),
          href: '/admin/graph-controversies',
          snapshot: true,
        },
        {
          id: 'neo.viewpoints',
          label: 'Viewpoints',
          value: neoCount(pipeline.neo.configured, pipeline.neo.viewpoints),
          href: '/admin/graph-controversies',
          snapshot: true,
        },
        {
          id: 'neo.disputes',
          label: 'Disputes',
          value: neoCount(pipeline.neo.configured, pipeline.neo.disputes),
          href: '/admin/neo',
          snapshot: true,
        },
        {
          id: 'neo.evidence_checks',
          label: 'Evidence checks',
          value: neoCount(pipeline.neo.configured, pipeline.neo.evidenceChecks),
          href: '/admin/neo',
          snapshot: true,
        },
        {
          id: 'neo.citations',
          label: 'Citations',
          value: neoCount(pipeline.neo.configured, pipeline.neo.citations),
          href: '/admin/neo',
          snapshot: true,
        },
        {
          id: 'neo.assessments',
          label: 'Assessments',
          value: neoCount(pipeline.neo.configured, pipeline.neo.assessments),
          href: '/admin/neo',
          snapshot: true,
        },
      ],
    },
    {
      id: 'other',
      title: 'Other',
      metrics: [
        {
          id: 'other.stuck',
          label: 'Stuck processing',
          value: pipeline.stuckProcessing,
          href: '/admin/observability',
          snapshot: true,
        },
      ],
    },
  ]
}

/** Range-filtered KPI tiles (fetch on range change only). */
export function buildRangeHealthSections(
  aggregates: RangeHealthAggregates
): AdminHealthMetricSection[] {
  const {
    periodIngest,
    keepTotal,
    dropTotal,
    pendingTotal,
    scrapeSuccess,
    scrapeFailure,
    graphsSucceeded,
    graphsFailed,
    graphsQuarantined,
  } = aggregates

  const graphsCompleted = graphsSucceeded + graphsFailed + graphsQuarantined

  return [
    {
      id: 'ingestion',
      title: 'Ingestion',
      metrics: [
        {
          id: 'ingest.period',
          label: 'Stories ingested',
          value: periodIngest,
          href: '/admin/stories',
        },
        {
          id: 'ingest.keep',
          label: 'Stories kept',
          value: keepTotal,
          href: '/admin/stories',
        },
        {
          id: 'ingest.drop',
          label: 'Stories dropped',
          value: dropTotal,
          href: '/admin/stories',
        },
        {
          id: 'ingest.pending',
          label: 'Stories pending',
          value: pendingTotal,
          href: '/admin/stories',
        },
      ],
    },
    {
      id: 'pre-processing',
      title: 'Pre-Processing',
      metrics: [
        {
          id: 'pre.scrape_succeeded',
          label: 'Scrapes succeeded',
          value: scrapeSuccess,
          href: '/admin/observability',
        },
        {
          id: 'pre.scrape_fails',
          label: 'Scrapes failed',
          value: scrapeFailure,
          href: '/admin/observability',
        },
        {
          id: 'pre.scrape_rate',
          label: 'Scrape rate',
          value: formatSuccessRate(scrapeSuccess, scrapeSuccess + scrapeFailure),
          href: '/admin/observability',
        },
      ],
    },
    {
      id: 'graph-processing',
      title: 'Graph Processing',
      metrics: [
        {
          id: 'gp.completed',
          label: 'Graphs completed',
          value: graphsCompleted,
          href: '/admin/stories',
        },
        {
          id: 'gp.succeeded',
          label: 'Graphs succeeded',
          value: graphsSucceeded,
          href: '/admin/stories',
        },
        {
          id: 'gp.failed',
          label: 'Graphs failed',
          value: graphsFailed,
          href: '/admin/observability',
        },
        {
          id: 'gp.quarantined',
          label: 'Graphs quarantined',
          value: graphsQuarantined,
          href: '/admin/observability',
        },
        {
          id: 'gp.rate',
          label: 'Graph rate',
          value: formatSuccessRate(graphsSucceeded, graphsCompleted),
          href: '/admin/stories',
        },
      ],
    },
  ]
}

export function aggregatesFromRpcRows(
  ingestRows: IngestDayBucket[] | null | undefined,
  gatingRows: GatingDayBucket[] | null | undefined,
  scrapeRows: ScrapeDayBucket[] | null | undefined,
  graphsSucceeded: number,
  graphsFailed: number,
  graphsQuarantined: number
): RangeHealthAggregates {
  return {
    periodIngest: sumRows(ingestRows, (row) => Number(row.count ?? 0)),
    keepTotal: sumRows(gatingRows, (row) => Number(row.keep_count ?? 0)),
    dropTotal: sumRows(gatingRows, (row) => Number(row.drop_count ?? 0)),
    pendingTotal: sumRows(gatingRows, (row) => Number(row.pending_count ?? 0)),
    scrapeSuccess: sumRows(scrapeRows, (row) => Number(row.success_count ?? 0)),
    scrapeFailure: sumRows(scrapeRows, (row) => Number(row.failure_count ?? 0)),
    graphsSucceeded,
    graphsFailed,
    graphsQuarantined,
  }
}

/** Zeroed Over Time sections — keeps layout stable before the first range fetch. */
export const PLACEHOLDER_RANGE_HEALTH_SECTIONS: AdminHealthMetricSection[] =
  buildRangeHealthSections({
    periodIngest: 0,
    keepTotal: 0,
    dropTotal: 0,
    pendingTotal: 0,
    scrapeSuccess: 0,
    scrapeFailure: 0,
    graphsSucceeded: 0,
    graphsFailed: 0,
    graphsQuarantined: 0,
  }).map((section) => ({
    ...section,
    metrics: section.metrics.map((metric) =>
      metric.id === 'pre.scrape_rate' || metric.id === 'gp.rate'
        ? { ...metric, value: '0%' }
        : metric
    ),
  }))

/** Zeroed As Of Now sections — keeps layout stable before the first snapshot poll. */
export const PLACEHOLDER_SNAPSHOT_HEALTH_SECTIONS: AdminHealthMetricSection[] =
  buildSnapshotHealthSections({
    ingest: { storiesTotal: 0 },
    relevance: { keep: 0, drop: 0, pending: 0, unclassified: 0 },
    scrape: { awaiting: 0, fails24h: 0, successRate24h: null },
    clean: { awaiting: 0 },
    graphJobs: {
      pending: 0,
      running: 0,
      failed: 0,
      quarantined: 0,
      succeeded: 0,
      cancelled: 0,
    },
    stuckProcessing: 0,
    neo: {
      configured: true,
      documents: 0,
      utterances: 0,
      propositions: 0,
      arguments: 0,
      agents: 0,
      questions: 0,
      questionsDeveloping: 0,
      questionsEstablished: 0,
      answersEdges: 0,
      answersDegree0: 0,
      answersDegree1: 0,
      answersDegree2Plus: 0,
      qualifyPoolMultiHq: 0,
      qualifyPoolOpposing: 0,
      controversiesWithSides: 0,
      controversiesZeroSides: 0,
      quarantinedQuestionMatch: 0,
      quarantinedQuestionAnswer: 0,
      controversies: 0,
      viewpoints: 0,
      disputes: 0,
      evidenceChecks: 0,
      citations: 0,
      assessments: 0,
      pendingEvidenceCheckCandidates: 0,
      graphNodes: 0,
      graphRels: 0,
      nodeCap: 200_000,
      relCap: 400_000,
    },
    projections: {
      controversiesOpen: 0,
      controversiesDeveloping: 0,
      controversiesClosed: 0,
      publishBlocked: {
        insufficient_sides: 0,
        no_sources: 0,
        no_viewpoints: 0,
      },
      viewpoints: 0,
      evidence: 0,
      excerpts: 0,
      assessments: 0,
      people: 0,
    },
  })

/** @deprecated Prefer split snapshot + range endpoints. */
export async function gatherAdminHealthMetrics(
  supabase: SupabaseClient,
  range: MetricRange
): Promise<AdminHealthMetricsPayload> {
  const [{ sections: snapshotSections }, rangePayload] = await Promise.all([
    gatherCachedAdminHealthSnapshot(supabase),
    gatherAdminRangeMetrics(supabase, range),
  ])

  return {
    range,
    windowDays: rangePayload.windowDays,
    sections: mergeHealthSections(rangePayload.sections, snapshotSections),
  }
}
