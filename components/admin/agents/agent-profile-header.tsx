'use client'

import { Bot } from 'lucide-react'
import type { AgentDetail, AgentRunSummary } from '@/lib/admin/agent-detail'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/admin/record/status-badge'
import { cn } from '@/lib/utils'

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDepartment(department: string | null): string | null {
  if (!department) return null
  return department
    .replace(/^\d+-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function AgentProfileHeader({
  agent,
  lastRun,
}: {
  agent: AgentDetail
  lastRun: AgentRunSummary | null
}) {
  const isActive = agent.manifestStatus === 'active'
  const department = formatDepartment(agent.department)
  const jobTitle = department
    ? `${department} · ${agent.stageLabel}`
    : `${agent.stageLabel} pipeline agent`

  return (
    <header className="rounded-lg border border-subtle bg-card px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <Avatar
          className={cn(
            'size-16 border-2 border-background shadow-sm sm:size-20',
            isActive ? 'ring-2 ring-[var(--agent-icon-active-bg)]' : 'ring-2 ring-[var(--agent-icon-inactive-bg)]'
          )}
        >
          <AvatarFallback
            className={cn(
              'rounded-full',
              isActive
                ? 'bg-[var(--agent-icon-active-bg)] text-[var(--agent-icon-active-fg)]'
                : 'bg-[var(--agent-icon-inactive-bg)] text-[var(--agent-icon-inactive-fg)]'
            )}
          >
            <Bot className="size-8 sm:size-9" aria-hidden />
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
                {agent.label}
              </h1>
              <p className="mt-1 text-sm text-muted">{jobTitle}</p>
            </div>
            <StatusBadge
              label={isActive ? 'On duty' : 'Off duty'}
              variant={isActive ? 'success' : 'danger'}
            />
          </div>

          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {lastRun?.model_name && (
              <li>
                <span className="text-foreground/80">{lastRun.model_name}</span>
              </li>
            )}
            <li>
              Last run{' '}
              <time className="text-foreground/80" dateTime={lastRun?.started_at ?? undefined}>
                {formatDate(lastRun?.started_at ?? null)}
              </time>
            </li>
          </ul>
        </div>
      </div>
    </header>
  )
}
