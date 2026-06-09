'use client'

import { useParams } from 'next/navigation'
import { AgentPromptAuditViewAllPage } from '@/components/admin/agents/agent-prompt-audit-view-all-page'
import { useRecordHub } from '@/components/admin/record/use-record-hub'

export default function AgentPromptAuditHistoryPage() {
  const params = useParams()
  const stepId = typeof params.stepId === 'string' ? params.stepId : ''
  const { data, loading, error } = useRecordHub<{ agent: { label: string } }>(
    `/api/admin/agents/${stepId}`
  )

  if (loading) return <p className="p-4 text-sm text-muted">Loading…</p>
  if (error || !data) {
    return <p className="p-4 text-sm text-destructive">{error ?? 'Agent not found'}</p>
  }

  return <AgentPromptAuditViewAllPage stepId={stepId} agentLabel={data.agent.label} />
}
