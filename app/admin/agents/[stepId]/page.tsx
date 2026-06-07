'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import type { AgentDetail, AgentRunSummary } from '@/lib/admin/agent-detail'
import { useRecordHub } from '@/components/admin/record/use-record-hub'
import { EntityHeader } from '@/components/admin/record/entity-header'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import { StatusBadge } from '@/components/admin/record/status-badge'

type AgentApiResponse = {
  agent: AgentDetail
  recentRuns: AgentRunSummary[]
  lastRun: AgentRunSummary | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AgentRecordPage() {
  const params = useParams()
  const stepId = typeof params.stepId === 'string' ? params.stepId : ''
  const { data, loading, error } = useRecordHub<AgentApiResponse>(
    `/api/admin/agents/${stepId}`
  )

  if (loading) return <p className="p-4 text-sm text-muted">Loading agent…</p>
  if (error || !data) return <p className="p-4 text-sm text-destructive">{error ?? 'Not found'}</p>

  const { agent, recentRuns, lastRun } = data

  return (
    <div className="space-y-4 p-4">
      <EntityHeader
        title={agent.label}
        subtitle={`${agent.stageLabel} · ${agent.scope} scope`}
        meta={[
          { label: 'Step ID', value: <span className="font-mono text-[11px]">{agent.stepId}</span> },
          { label: 'Deploy', value: <span className="font-mono text-[11px]">{agent.deployName}</span> },
          {
            label: 'Status',
            value: (
              <StatusBadge
                label={agent.manifestStatus}
                variant={agent.manifestStatus === 'active' ? 'success' : 'danger'}
              />
            ),
          },
          { label: 'Model', value: lastRun?.model_name ?? '—' },
          { label: 'Last run', value: formatDate(lastRun?.started_at ?? null) },
          { label: 'Optional step', value: agent.optional ? 'Yes' : 'No' },
        ]}
      />

      <RecordSectionCard id="configuration" title="Agent configuration">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">Department</dt>
            <dd className="mt-0.5">{agent.department ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Workflow</dt>
            <dd className="mt-0.5">{agent.workflow ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Isolation params</dt>
            <dd className="mt-0.5 font-mono text-xs">{agent.isolationParams.join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Invoke options</dt>
            <dd className="mt-0.5 text-xs">
              maxChunks={agent.invokeOptions.maxChunks ?? '—'}, timeout=
              {agent.invokeOptions.timeoutMs}ms
            </dd>
          </div>
          {agent.cron && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted">Cron</dt>
              <dd className="mt-0.5 font-mono text-xs">
                {agent.cron.job_name} ({agent.cron.schedule})
              </dd>
            </div>
          )}
          {agent.secrets.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted">Secrets</dt>
              <dd className="mt-0.5 font-mono text-xs">{agent.secrets.join(', ')}</dd>
            </div>
          )}
        </dl>
      </RecordSectionCard>

      <RecordSectionCard id="prompt" title="Prompt (read-only)">
        <p className="text-sm text-muted">
          Prompts are embedded in the agent handler source. Editing and version history require a
          future prompt store — not available in v1.
        </p>
        {agent.sourcePath && (
          <p className="mt-2 font-mono text-xs text-muted">{agent.sourcePath}/handler.ts</p>
        )}
      </RecordSectionCard>

      <RecordSectionCard id="recent-runs" title="Recent runs">
        {recentRuns.length === 0 ? (
          <p className="text-xs text-muted">No pipeline runs recorded for this deploy name.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recentRuns.map((run) => (
              <li key={run.run_id} className="rounded-md border border-subtle px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <StatusBadge label={run.status} variant={run.status === 'success' ? 'success' : 'danger'} />
                  <time className="text-xs text-muted">{formatDate(run.started_at)}</time>
                </div>
                {run.model_name && (
                  <p className="mt-1 text-xs text-muted">Model: {run.model_name}</p>
                )}
                {run.error && <p className="mt-1 text-xs text-destructive">{run.error}</p>}
                {run.story_id && (
                  <Link
                    href={`/admin/stories/${run.story_id}`}
                    className="mt-1 inline-block text-xs text-accent-primary hover:underline"
                  >
                    Related story
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </RecordSectionCard>

      <RecordSectionCard id="audit" title="Audit trail">
        <p className="text-xs text-muted">
          Prompt changes and configuration audit history deferred until admin_pipeline_actions or
          equivalent exists.
        </p>
      </RecordSectionCard>
    </div>
  )
}
