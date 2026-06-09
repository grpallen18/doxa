'use client'

import { useParams } from 'next/navigation'
import type { AgentDetail, AgentRunSummary } from '@/lib/admin/agent-detail'
import { AgentRecentRunsTable } from '@/components/admin/agents/agent-recent-runs-table'
import { AgentPromptAuditTable } from '@/components/admin/agents/agent-prompt-audit-table'
import { useRecordHub } from '@/components/admin/record/use-record-hub'
import { RecordPageBody, RecordPageError, RecordPageFrame, RecordPageLoading } from '@/components/admin/record/record-page-frame'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import { StatusBadge } from '@/components/admin/record/status-badge'
import {
  AgentProfileHeader,
  formatAgentJobTitle,
} from '@/components/admin/agents/agent-profile-header'
import { AgentPromptSection } from '@/components/admin/agents/agent-prompt-section'

type AgentApiResponse = {
  agent: AgentDetail
  lastRun: AgentRunSummary | null
}

export default function AgentRecordPage() {
  const params = useParams()
  const stepId = typeof params.stepId === 'string' ? params.stepId : ''
  const { data, loading, error } = useRecordHub<AgentApiResponse>(
    `/api/admin/agents/${stepId}`
  )

  if (loading) return <RecordPageLoading message="Loading agent…" />
  if (error || !data) return <RecordPageError message={error ?? 'Not found'} />

  const { agent, lastRun } = data
  const promptTitle =
    agent.promptKind === 'llm' ? 'System prompt' : 'Prompt'
  const lastRunLabel = lastRun?.started_at
    ? new Date(lastRun.started_at).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Never'

  return (
    <RecordPageFrame>
      <AgentProfileHeader agent={agent} />

      <RecordPageBody>
      <RecordSectionCard id="configuration" title="Agent configuration" variant="panel">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">Pipeline stage</dt>
            <dd className="mt-0.5">{formatAgentJobTitle(agent)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Model</dt>
            <dd className="mt-0.5">{lastRun?.model_name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Last run</dt>
            <dd className="mt-0.5">
              {lastRun?.started_at ? (
                <time dateTime={lastRun.started_at}>{lastRunLabel}</time>
              ) : (
                lastRunLabel
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Deploy</dt>
            <dd className="mt-0.5 font-mono text-xs">{agent.deployName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Catalog status</dt>
            <dd className="mt-0.5">
              <StatusBadge
                label={agent.manifestStatus}
                variant={agent.manifestStatus === 'active' ? 'success' : 'danger'}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Department</dt>
            <dd className="mt-0.5">{agent.department ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Workflow</dt>
            <dd className="mt-0.5">{agent.workflow ?? '—'}</dd>
          </div>
          {agent.optional && (
            <div>
              <dt className="text-xs font-medium text-muted">Optional</dt>
              <dd className="mt-0.5">Yes</dd>
            </div>
          )}
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

      <RecordSectionCard id="prompt" title={promptTitle} variant="panel">
        <AgentPromptSection stepId={stepId} agent={agent} />
      </RecordSectionCard>

      <RecordSectionCard id="recent-runs" title="Recent runs" variant="panel">
        <AgentRecentRunsTable stepId={stepId} />
      </RecordSectionCard>

      {agent.promptKind === 'llm' && (
        <RecordSectionCard id="audit" title="Prompt audit trail" variant="panel">
          <AgentPromptAuditTable stepId={stepId} />
        </RecordSectionCard>
      )}
      </RecordPageBody>
    </RecordPageFrame>
  )
}
