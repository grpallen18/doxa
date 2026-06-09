'use client'

import Link from 'next/link'
import { AgentRecentRunsTable } from '@/components/admin/agents/agent-recent-runs-table'

export function AgentRunsViewAllPage({
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
      <h1 className="text-lg font-semibold">{agentLabel} — all runs</h1>
      <AgentRecentRunsTable stepId={stepId} viewAll />
    </div>
  )
}
