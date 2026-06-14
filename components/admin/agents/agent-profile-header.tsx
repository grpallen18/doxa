'use client'

import { Bot, User } from 'lucide-react'
import type { AgentDetail, AgentRunSummary } from '@/lib/admin/agent-detail'
import { formatNextCronRunTime } from '@/lib/admin/cron-next-run'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import { getAgentProfileCopy } from '@/lib/admin/agent-profile-copy'
import type { ResolvedAgentProfile } from '@/lib/admin/agent-display-names'
import { AgentProfileEditor } from '@/components/admin/agents/agent-profile-inline-field'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/admin/record/status-badge'
import { cn } from '@/lib/utils'

function resolveIconVariant(agent: AgentDetail) {
  if (agent.stepId === 'review-pending-stories') return 'human' as const
  if (agent.stepId === 'scrape-story-content') return 'cloud' as const
  return 'bot' as const
}

function StepIcon({ variant }: { variant: 'bot' | 'human' | 'cloud' }) {
  const Icon = variant === 'human' ? User : Bot
  const accent = variant === 'bot' ? 'text-indigo-600' : 'text-orange-600'
  return <Icon className={cn('size-5', accent)} aria-hidden />
}

function AgentProfileActivityMetrics({
  agent,
  lastRun,
  isActive,
}: {
  agent: AgentDetail
  lastRun: AgentRunSummary | null
  isActive: boolean
}) {
  const nextScheduled = isActive
    ? formatNextCronRunTime(agent.cron?.schedule)
    : '—'

  return (
    <dl className="flex flex-wrap items-start gap-x-8 gap-y-2">
      <div>
        <dt className="text-xs font-medium text-muted">Last runtime</dt>
        <dd className="mt-0.5 text-[11px] tabular-nums text-muted">
          {lastRun?.started_at ? formatAdminDateTime(lastRun.started_at) : '—'}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Last outcome</dt>
        <dd className="mt-0.5 text-[11px] text-muted">
          {lastRun ? (
            <StatusBadge
              label={lastRun.status}
              variant={
                lastRun.status === 'completed' || lastRun.status === 'success'
                  ? 'success'
                  : 'danger'
              }
            />
          ) : (
            '—'
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Next scheduled runtime</dt>
        <dd className="mt-0.5 text-[11px] tabular-nums text-muted">{nextScheduled}</dd>
      </div>
    </dl>
  )
}

function AgentProfileAvatarColumn({
  isActive,
  iconVariant,
}: {
  isActive: boolean
  iconVariant: 'bot' | 'human' | 'cloud'
}) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center justify-between">
      <Avatar
        className={cn(
          'size-12 border border-background shadow-sm',
          isActive
            ? 'ring-2 ring-[var(--agent-icon-active-bg)]'
            : 'ring-2 ring-[var(--agent-icon-inactive-bg)]'
        )}
      >
        {iconVariant === 'cloud' ? (
          <AvatarFallback className="items-stretch justify-stretch overflow-hidden rounded-full bg-transparent p-0">
            {/* Native img — Radix AvatarImage + next/image asChild does not receive load events */}
            <img
              src="/cloudflare-icon.png"
              alt=""
              className="aspect-square size-full object-cover"
              aria-hidden
            />
          </AvatarFallback>
        ) : (
          <AvatarFallback
            className={cn(
              'rounded-full',
              isActive
                ? 'bg-[var(--agent-icon-active-bg)] text-[var(--agent-icon-active-fg)]'
                : 'bg-[var(--agent-icon-inactive-bg)] text-[var(--agent-icon-inactive-fg)]'
            )}
          >
            <StepIcon variant={iconVariant} />
          </AvatarFallback>
        )}
      </Avatar>
      <StatusBadge
        label={isActive ? 'Active' : 'Inactive'}
        variant={isActive ? 'success' : 'danger'}
        className="w-full justify-center px-1 text-[10px] leading-tight"
      />
    </div>
  )
}

export function AgentProfileHeader({
  agent,
  lastRun,
  profile,
  onProfileSaved,
}: {
  agent: AgentDetail
  lastRun: AgentRunSummary | null
  profile: ResolvedAgentProfile
  onProfileSaved: (next: ResolvedAgentProfile) => void
}) {
  const catalogProfile = getAgentProfileCopy(agent, profile.displayNameOverride)
  const isActive = agent.manifestStatus === 'active'
  const iconVariant = resolveIconVariant(agent)

  return (
    <section className="mt-4">
      <div className="py-5">
        <AgentProfileEditor
          stepId={agent.stepId}
          profile={profile}
          departmentLabel={catalogProfile.departmentLabel}
          optionalBadge={
            agent.optional ? (
              <span className="rounded border border-subtle bg-surface-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                Optional
              </span>
            ) : undefined
          }
          identityRow={
            <AgentProfileAvatarColumn isActive={isActive} iconVariant={iconVariant} />
          }
          metrics={
            <AgentProfileActivityMetrics agent={agent} lastRun={lastRun} isActive={isActive} />
          }
          footer={
            agent.promptKind === 'llm' || agent.promptKind === 'embeddings' ? (
              <div>
                <Button size="sm" variant="outline" asChild>
                  <a href="#operating-instructions">Edit prompt</a>
                </Button>
              </div>
            ) : undefined
          }
          onSaved={onProfileSaved}
        />
      </div>
    </section>
  )
}
