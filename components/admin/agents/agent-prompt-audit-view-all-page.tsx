'use client'

import Link from 'next/link'
import { AgentPromptAuditTable } from '@/components/admin/agents/agent-prompt-audit-table'
import { RecordPageBody, RecordPageFrame } from '@/components/admin/record/record-page-frame'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'

export function AgentPromptAuditViewAllPage({
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
          {agentLabel} — prompt audit trail
        </h1>
      </header>

      <RecordPageBody>
        <RecordSectionCard id="audit" title="Prompt audit trail" variant="panel">
          <AgentPromptAuditTable stepId={stepId} viewAll />
        </RecordSectionCard>
      </RecordPageBody>
    </RecordPageFrame>
  )
}
