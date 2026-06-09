'use client'

import Link from 'next/link'
import { AgentPromptAuditTable } from '@/components/admin/agents/agent-prompt-audit-table'

export function AgentPromptAuditViewAllPage({
  stepId,
  agentLabel,
}: {
  stepId: string
  agentLabel: string
}) {
  return (
    <div className="space-y-4 p-4">
      <Link
        href={`/admin/agents/${stepId}`}
        className="text-sm text-accent-primary hover:underline"
      >
        ← Back to agent
      </Link>
      <h1 className="text-lg font-semibold">{agentLabel} — prompt audit trail</h1>
      <AgentPromptAuditTable stepId={stepId} viewAll />
    </div>
  )
}
