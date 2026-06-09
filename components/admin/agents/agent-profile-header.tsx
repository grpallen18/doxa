'use client'

import { Bot } from 'lucide-react'
import type { AgentDetail } from '@/lib/admin/agent-detail'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export function formatAgentJobTitle(agent: AgentDetail): string {
  const department = agent.department
    ? agent.department
        .replace(/^\d+-/, '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : null

  return department ? `${department} · ${agent.stageLabel}` : `${agent.stageLabel} pipeline agent`
}

export function AgentProfileHeader({ agent }: { agent: AgentDetail }) {
  const isActive = agent.manifestStatus === 'active'

  return (
    <header className="px-4 pb-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          className={cn(
            'size-9 shrink-0 border border-background shadow-sm',
            isActive
              ? 'ring-2 ring-[var(--agent-icon-active-bg)]'
              : 'ring-2 ring-[var(--agent-icon-inactive-bg)]'
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
            <Bot className="size-4" aria-hidden />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight text-[var(--record-section-header-fg)] sm:text-lg">
            {agent.label}
          </h1>
          <p
            className={cn(
              'text-sm leading-tight',
              isActive
                ? 'text-[var(--record-section-header-fg)]'
                : 'text-destructive'
            )}
          >
            {isActive ? 'On duty' : 'Off duty'}
          </p>
        </div>
      </div>
    </header>
  )
}
