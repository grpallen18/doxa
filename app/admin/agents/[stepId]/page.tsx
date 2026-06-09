'use client'

import { useParams } from 'next/navigation'
import type { AgentDetail, AgentRunSummary } from '@/lib/admin/agent-detail'
import { AgentRecentRunsTable } from '@/components/admin/agents/agent-recent-runs-table'
import { AgentPromptAuditTable } from '@/components/admin/agents/agent-prompt-audit-table'
import { useRecordHub } from '@/components/admin/record/use-record-hub'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import { StatusBadge } from '@/components/admin/record/status-badge'
import { AgentProfileHeader } from '@/components/admin/agents/agent-profile-header'
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

  if (loading) return <p className="p-4 text-sm text-muted">Loading agent…</p>
  if (error || !data) return <p className="p-4 text-sm text-destructive">{error ?? 'Not found'}</p>

  const { agent, lastRun } = data
  const promptTitle =
    agent.promptKind === 'llm' ? 'System prompt' : 'Prompt'

  return (
    <div className="space-y-4 p-4">
      <AgentProfileHeader agent={agent} lastRun={lastRun} />

      <RecordSectionCard id="configuration" title="Agent configuration">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
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

      <RecordSectionCard id="prompt" title={promptTitle}>
        <AgentPromptSection stepId={stepId} agent={agent} />
      </RecordSectionCard>

      <RecordSectionCard id="recent-runs" title="Recent runs">
        <AgentRecentRunsTable stepId={stepId} />
      </RecordSectionCard>

      {agent.promptKind === 'llm' && (
        <RecordSectionCard id="audit" title="Prompt audit trail">
          <AgentPromptAuditTable stepId={stepId} />
        </RecordSectionCard>
      )}
    </div>
  )
}
