'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircleIcon } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ObservabilityPipelineCounts } from '@/lib/admin/observability-pipeline-counts'

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US')
}

type Stage = {
  id: string
  label: string
  value: string
  detail?: string
  warn?: boolean
  href?: string
}

function StageList({ title, stages }: { title: string; stages: Stage[] }) {
  if (stages.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead className="w-28 text-right">Count</TableHead>
            <TableHead>Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stages.map((stage) => (
            <TableRow key={stage.id}>
              <TableCell className="font-medium">
                {stage.href ? (
                  <Link
                    href={stage.href}
                    className="text-accent-primary hover:underline"
                  >
                    {stage.label}
                  </Link>
                ) : (
                  stage.label
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {stage.warn ? (
                  <Badge variant="secondary">{stage.value}</Badge>
                ) : (
                  stage.value
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {stage.detail ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function buildIngestStages(data: ObservabilityPipelineCounts): Stage[] {
  const { relevance, scrape, clean, graphJobs, stuckProcessing, ingest } = data
  const graphBacklog =
    graphJobs.pending + graphJobs.running + graphJobs.failed + graphJobs.quarantined
  return [
    {
      id: 'stories',
      label: 'Stories',
      value: formatCount(ingest.storiesTotal),
      href: '/admin/stories',
    },
    {
      id: 'relevance',
      label: 'Relevance (KEEP)',
      value: formatCount(relevance.keep),
      detail: `DROP ${formatCount(relevance.drop)} · PENDING ${formatCount(relevance.pending)} · unclassified ${formatCount(relevance.unclassified)}`,
      warn: relevance.pending > 0 || relevance.unclassified > 0,
    },
    {
      id: 'scrape',
      label: 'Awaiting scrape',
      value: formatCount(scrape.awaiting),
      detail:
        scrape.successRate24h != null
          ? `${scrape.successRate24h}% ok · ${formatCount(scrape.fails24h)} fails (24h)`
          : `${formatCount(scrape.fails24h)} fails (24h)`,
      warn: scrape.awaiting > 0 || scrape.fails24h > 0,
    },
    {
      id: 'clean',
      label: 'Awaiting clean',
      value: formatCount(clean.awaiting),
      detail:
        graphJobs.succeeded > 0
          ? `${formatCount(graphJobs.succeeded)} graph jobs succeeded (total)`
          : undefined,
      warn: clean.awaiting > 0,
    },
    {
      id: 'graph-jobs',
      label: 'Graph queue',
      value: formatCount(graphBacklog),
      detail: `pending ${formatCount(graphJobs.pending)} · running ${formatCount(graphJobs.running)} · failed ${formatCount(graphJobs.failed)} · quarantined ${formatCount(graphJobs.quarantined)}`,
      warn:
        graphJobs.failed > 0 ||
        graphJobs.quarantined > 0 ||
        graphJobs.pending > 0,
    },
    {
      id: 'stuck',
      label: 'Stuck processing',
      value: formatCount(stuckProcessing),
      warn: stuckProcessing > 0,
    },
  ]
}

function buildSubstrateStages(data: ObservabilityPipelineCounts): Stage[] {
  const { neo } = data
  if (!neo.configured) {
    return [
      {
        id: 'neo-off',
        label: 'Neo4j',
        value: '—',
        detail: neo.error ?? 'Not configured',
        warn: true,
      },
    ]
  }
  const nodeHeadroom = Math.max(0, neo.nodeCap - neo.graphNodes)
  const atCap = neo.graphNodes >= neo.nodeCap
  return [
    {
      id: 'graph-size',
      label: 'Graph size (nodes)',
      value: formatCount(neo.graphNodes),
      detail: `cap ${formatCount(neo.nodeCap)} · headroom ${formatCount(nodeHeadroom)} · rels ${formatCount(neo.graphRels)}/${formatCount(neo.relCap)}`,
      warn: atCap || nodeHeadroom < 10_000,
      href: '/admin/neo',
    },
    {
      id: 'documents',
      label: 'Documents',
      value: formatCount(neo.documents),
    },
    {
      id: 'utterances',
      label: 'Utterances',
      value: formatCount(neo.utterances),
    },
    {
      id: 'propositions',
      label: 'Propositions',
      value: formatCount(neo.propositions),
    },
    {
      id: 'arguments',
      label: 'Arguments',
      value: formatCount(neo.argumentCount),
    },
    {
      id: 'agents',
      label: 'Agents',
      value: formatCount(neo.agents),
    },
  ]
}

function buildDebateFunnelStages(data: ObservabilityPipelineCounts): Stage[] {
  const { neo } = data
  if (!neo.configured) return []
  if (neo.error) return []

  return [
    {
      id: 'questions',
      label: 'Questions',
      value: formatCount(neo.questions),
      detail: `developing ${formatCount(neo.questionsDeveloping)} · established ${formatCount(neo.questionsEstablished)}`,
    },
    {
      id: 'answers',
      label: 'ANSWERS edges',
      value: formatCount(neo.answersEdges),
      detail: `degree q0 ${formatCount(neo.answersDegree0)} · q1 ${formatCount(neo.answersDegree1)} · q2+ ${formatCount(neo.answersDegree2Plus)}`,
      warn: neo.answersDegree2Plus < 10,
    },
    {
      id: 'qualify-pool',
      label: 'Qualify pool (opposing)',
      value: formatCount(neo.qualifyPoolOpposing),
      detail: `multi HQ ${formatCount(neo.qualifyPoolMultiHq)} · opposing ${formatCount(neo.qualifyPoolOpposing)}`,
      warn: neo.qualifyPoolOpposing < 5,
    },
    {
      id: 'controversies-established',
      label: 'Controversies established',
      value: formatCount(neo.controversiesEstablished),
      detail: `total ${formatCount(neo.controversiesTotal)} · viewpoints≥2 ${formatCount(neo.controversiesWithViewpoints)} · zero viewpoints ${formatCount(neo.controversiesZeroViewpoints)}`,
      warn: neo.controversiesZeroViewpoints > 0,
    },
    {
      id: 'viewpoints-neo',
      label: 'Viewpoints (Neo)',
      value: formatCount(neo.viewpoints),
    },
    {
      id: 'decisions-quarantine',
      label: 'L3 decisions quarantined',
      value: formatCount(
        neo.decisionsQuarantinedMatch + neo.decisionsQuarantinedAnswer
      ),
      detail: `match ${formatCount(neo.decisionsQuarantinedMatch)} · answer ${formatCount(neo.decisionsQuarantinedAnswer)}`,
      warn:
        neo.decisionsQuarantinedMatch + neo.decisionsQuarantinedAnswer > 0,
    },
  ]
}

function buildDebateProjectionStages(data: ObservabilityPipelineCounts): Stage[] {
  const { projections } = data
  const blocked =
    projections.publishBlocked.insufficient_sides +
    projections.publishBlocked.no_sources +
    projections.publishBlocked.no_viewpoints

  return [
    {
      id: 'pg-open',
      label: 'Controversies open',
      value: formatCount(projections.controversiesOpen),
      detail: `developing ${formatCount(projections.controversiesDeveloping)} · closed ${formatCount(projections.controversiesClosed)}`,
      href: '/admin/graph-controversies',
    },
    {
      id: 'pg-viewpoints',
      label: 'Viewpoints (Postgres)',
      value: formatCount(projections.viewpoints),
    },
    {
      id: 'pg-blocked',
      label: 'Publish blocked',
      value: formatCount(blocked),
      detail: `insufficient sides ${formatCount(projections.publishBlocked.insufficient_sides)} · no sources ${formatCount(projections.publishBlocked.no_sources)} · no viewpoints ${formatCount(projections.publishBlocked.no_viewpoints)}`,
      warn: blocked > 0,
      href: '/admin/graph-controversies',
    },
  ]
}

function buildAnalysisStages(data: ObservabilityPipelineCounts): Stage[] {
  const { neo, projections } = data
  if (!neo.configured || neo.error) {
    return [
      {
        id: 'pg-assessments',
        label: 'Assessments (Postgres)',
        value: formatCount(projections.assessments),
      },
      {
        id: 'pg-evidence',
        label: 'Evidence rows',
        value: formatCount(projections.evidence),
        detail: `excerpts ${formatCount(projections.excerpts)} · people ${formatCount(projections.people)}`,
      },
    ]
  }

  const stages: Stage[] = []

  if (neo.pendingEvidenceCheckCandidates > 0) {
    stages.push({
      id: 'ev-pending',
      label: 'Evidence check backlog',
      value: formatCount(neo.pendingEvidenceCheckCandidates),
      warn: true,
    })
  }

  stages.push(
    {
      id: 'evidence-checks',
      label: 'EvidenceChecks (Neo)',
      value: formatCount(neo.evidenceChecks),
    },
    {
      id: 'citations',
      label: 'Citations (Neo)',
      value: formatCount(neo.citations),
    },
    {
      id: 'assessments',
      label: 'Assessments',
      value: formatCount(neo.assessments),
      detail: `PG ${formatCount(projections.assessments)}`,
    },
    {
      id: 'evidence-rows',
      label: 'Evidence rows (Postgres)',
      value: formatCount(projections.evidence),
      detail: `excerpts ${formatCount(projections.excerpts)} · people ${formatCount(projections.people)}`,
    }
  )

  if (neo.disputes > 0) {
    stages.push({
      id: 'disputes',
      label: 'Disputes (Neo)',
      value: formatCount(neo.disputes),
    })
  }

  return stages
}

function FunnelLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-28 w-full" />
    </div>
  )
}

export function PipelineFunnelPanel() {
  const [data, setData] = useState<ObservabilityPipelineCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/admin/observability/pipeline-counts')
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(json?.error?.message || 'Failed to load pipeline counts')
        }
        return json?.data as ObservabilityPipelineCounts
      })
      .then((payload) => {
        if (cancelled || !payload) return
        setData(payload)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load pipeline counts')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const neoError = data?.neo.configured && data.neo.error ? data.neo.error : null

  return (
    <Panel variant="soft" interactive={false} className="overflow-hidden">
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Pipeline funnel</h2>
          <p className="text-sm text-muted-foreground">
            Live inventory and L3 funnel (Neo) plus Postgres projections. Ingestion
            backlogs are point-in-time.
          </p>
        </div>

        {loading ? (
          <FunnelLoading />
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Could not load pipeline counts</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : data ? (
          <div className="flex flex-col gap-5">
            {neoError ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Neo4j snapshot failed</AlertTitle>
                <AlertDescription>{neoError}</AlertDescription>
              </Alert>
            ) : null}
            <StageList title="Ingestion & queues" stages={buildIngestStages(data)} />
            <Separator />
            <StageList title="Graph substrate (L0–L2)" stages={buildSubstrateStages(data)} />
            <Separator />
            <StageList title="Debate funnel (L3 · Neo)" stages={buildDebateFunnelStages(data)} />
            <Separator />
            <StageList
              title="Debate projections (Postgres)"
              stages={buildDebateProjectionStages(data)}
            />
            <Separator />
            <StageList title="Analysis (L4)" stages={buildAnalysisStages(data)} />
          </div>
        ) : (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No pipeline data</AlertTitle>
            <AlertDescription>No pipeline data available.</AlertDescription>
          </Alert>
        )}
      </div>
    </Panel>
  )
}
