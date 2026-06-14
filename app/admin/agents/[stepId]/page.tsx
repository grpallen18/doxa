'use client'

import { useCallback, useState } from 'react'
import { useParams } from 'next/navigation'
import type { AgentDetail, AgentRunStats, AgentRunSummary } from '@/lib/admin/agent-detail'
import { AgentRecentRunsTable } from '@/components/admin/agents/agent-recent-runs-table'
import { AgentPromptAuditTable } from '@/components/admin/agents/agent-prompt-audit-table'
import { AgentProfileHeader } from '@/components/admin/agents/agent-profile-header'
import {
  AgentProfilePerformanceSection,
  AgentProfileWorkstationSection,
} from '@/components/admin/agents/agent-profile-sections'
import { AgentPromptSection } from '@/components/admin/agents/agent-prompt-section'
import { useRecordHub } from '@/components/admin/record/use-record-hub'
import {
  RecordPageBody,
  RecordPageError,
  RecordPageFrame,
  RecordPageLoading,
} from '@/components/admin/record/record-page-frame'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'

import type { ResolvedAgentProfile } from '@/lib/admin/agent-display-names'

type AgentApiResponse = ResolvedAgentProfile & {
  agent: AgentDetail
  lastRun: AgentRunSummary | null
  recentRuns: AgentRunSummary[]
  runStats: AgentRunStats
}

export default function AgentRecordPage() {
  const params = useParams()
  const stepId = typeof params.stepId === 'string' ? params.stepId : ''
  const { data, loading, error } = useRecordHub<AgentApiResponse>(
    `/api/admin/agents/${stepId}`
  )
  const [profileState, setProfileState] = useState<ResolvedAgentProfile | null>(null)

  const handleProfileSaved = useCallback((next: ResolvedAgentProfile) => {
    setProfileState(next)
  }, [])

  if (loading) return <RecordPageLoading message="Loading agent…" />
  if (error || !data) return <RecordPageError message={error ?? 'Not found'} />

  const { agent, lastRun, runStats } = data
  const profile: ResolvedAgentProfile = profileState ?? {
    displayName: data.displayName,
    defaultDisplayName: data.defaultDisplayName,
    displayNameOverride: data.displayNameOverride,
    jobTitle: data.jobTitle,
    defaultJobTitle: data.defaultJobTitle,
    jobTitleOverride: data.jobTitleOverride,
    bio: data.bio,
    defaultBio: data.defaultBio,
    bioOverride: data.bioOverride,
  }
  const showPromptSection =
    agent.promptKind === 'llm' || agent.promptKind === 'embeddings'

  return (
    <RecordPageFrame>
      <AgentProfileHeader
        agent={agent}
        lastRun={lastRun}
        profile={profile}
        onProfileSaved={handleProfileSaved}
      />

      <RecordPageBody>
        <RecordSectionCard id="performance" title="Performance & quality" variant="panel">
          <AgentProfilePerformanceSection runStats={runStats} lastRun={lastRun} />
        </RecordSectionCard>

        <RecordSectionCard id="workstation" title="Workstation" variant="panel">
          <AgentProfileWorkstationSection agent={agent} lastRun={lastRun} />
        </RecordSectionCard>

        <RecordSectionCard id="run-log" title="Run log" variant="panel">
          <AgentRecentRunsTable stepId={stepId} />
        </RecordSectionCard>

        {showPromptSection ? (
          <RecordSectionCard
            id="operating-instructions"
            title="Operating instructions"
            variant="panel"
            defaultOpen={false}
          >
            <AgentPromptSection stepId={stepId} agent={agent} />
          </RecordSectionCard>
        ) : null}

        {agent.promptKind === 'llm' ? (
          <RecordSectionCard
            id="audit"
            title="Prompt audit trail"
            variant="panel"
            defaultOpen={false}
          >
            <AgentPromptAuditTable stepId={stepId} />
          </RecordSectionCard>
        ) : null}
      </RecordPageBody>
    </RecordPageFrame>
  )
}
