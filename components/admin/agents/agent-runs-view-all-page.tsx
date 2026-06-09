'use client'

import Link from 'next/link'
import { AgentRecentRunsTable } from '@/components/admin/agents/agent-recent-runs-table'
import { RecordPageBody, RecordPageFrame } from '@/components/admin/record/record-page-frame'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'

export function AgentRunsViewAllPage({
  stepId,
  agentLabel,
}: {
  stepId: string
  agentLabel: string
}) {
  return (
    <RecordPageFrame>
      <header className="px-4 py-3 sm:px-5">
        <Link
          href={`/admin/agents/${stepId}`}
          className="text-sm text-accent-primary hover:underline"
        >
          ← Back to agent
        </Link>
        <h1 className="mt-2 text-base font-semibold text-[var(--record-section-header-fg)] sm:text-lg">
          {agentLabel} — all runs
        </h1>
      </header>

      <RecordPageBody>
        <RecordSectionCard id="recent-runs" title="Recent runs" variant="panel">
          <AgentRecentRunsTable stepId={stepId} viewAll />
        </RecordSectionCard>
      </RecordPageBody>
    </RecordPageFrame>
  )
}
