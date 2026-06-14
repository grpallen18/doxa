'use client'

import type {
  AgentDetail,
  AgentRunStats,
  AgentRunSummary,
} from '@/lib/admin/agent-detail'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import { getAgentProfileCopy } from '@/lib/admin/agent-profile-copy'
import { StatusBadge } from '@/components/admin/record/status-badge'

function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return `${minutes}m ${rem}s`
}

function formatRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${Math.round(rate * 100)}%`
}

export function AgentProfileAboutSection({ agent }: { agent: AgentDetail }) {
  const { about } = getAgentProfileCopy(agent)

  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div className="sm:col-span-2">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Role</dt>
        <dd className="mt-1 leading-relaxed">{about.summary}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Inputs</dt>
        <dd className="mt-1 leading-relaxed">{about.inputs}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Outputs</dt>
        <dd className="mt-1 leading-relaxed">{about.outputs}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Downstream</dt>
        <dd className="mt-1 leading-relaxed">{about.downstream}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Quality bar</dt>
        <dd className="mt-1 leading-relaxed">{about.qualityStandard}</dd>
      </div>
    </dl>
  )
}

export function AgentProfileResponsibilitiesSection({ agent }: { agent: AgentDetail }) {
  const { responsibilities } = getAgentProfileCopy(agent)

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {responsibilities.map((item) => (
        <li
          key={item}
          className="rounded-md border border-subtle bg-surface-soft px-3 py-2.5 text-sm leading-snug"
        >
          {item}
        </li>
      ))}
    </ul>
  )
}

export function AgentProfilePerformanceSection({
  runStats,
  lastRun,
}: {
  runStats: AgentRunStats
  lastRun: AgentRunSummary | null
}) {
  const statValueClass = 'mt-0.5 text-[11px] tabular-nums text-muted'

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-subtle bg-surface-soft px-3 py-2.5">
          <dt className="text-xs font-medium text-muted">
            Success rate
            {runStats.totalSampled > 0 ? ` (last ${runStats.totalSampled} runs)` : ''}
          </dt>
          <dd className={statValueClass}>{formatRate(runStats.successRate)}</dd>
        </div>
        <div className="rounded-md border border-subtle bg-surface-soft px-3 py-2.5">
          <dt className="text-xs font-medium text-muted">Failures</dt>
          <dd className={statValueClass}>{runStats.failureCount}</dd>
        </div>
        <div className="rounded-md border border-subtle bg-surface-soft px-3 py-2.5">
          <dt className="text-xs font-medium text-muted">Avg runtime</dt>
          <dd className={statValueClass}>{formatDuration(runStats.averageRuntimeMs)}</dd>
        </div>
        <div className="rounded-md border border-subtle bg-surface-soft px-3 py-2.5">
          <dt className="text-xs font-medium text-muted">Last success</dt>
          <dd className={statValueClass}>{formatAdminDateTime(runStats.lastSuccessAt)}</dd>
        </div>
      </dl>
      {lastRun?.model_name ? (
        <p className="text-[11px] text-muted">Recent model: {lastRun.model_name}</p>
      ) : null}
      {runStats.recentErrors.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Recent errors
          </h3>
          <ul className="space-y-2">
            {runStats.recentErrors.map((entry) => (
              <li
                key={`${entry.started_at}-${entry.error.slice(0, 24)}`}
                className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs"
              >
                <time className="text-muted">{formatAdminDateTime(entry.started_at)}</time>
                <p className="mt-1 text-destructive">{entry.error}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function AgentProfileWorkstationSection({
  agent,
  lastRun,
}: {
  agent: AgentDetail
  lastRun: AgentRunSummary | null
}) {
  const statValueClass = 'mt-0.5 text-[11px] text-muted'

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <div>
        <dt className="text-xs font-medium text-muted">Model</dt>
        <dd className={statValueClass}>{lastRun?.model_name ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Deploy name</dt>
        <dd className={statValueClass}>{agent.deployName}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Prompt type</dt>
        <dd className={`${statValueClass} capitalize`}>{agent.promptKind}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Isolation params</dt>
        <dd className={statValueClass}>{agent.isolationParams.join(', ') || '—'}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Department path</dt>
        <dd className={statValueClass}>{agent.department ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Workflow</dt>
        <dd className={statValueClass}>{agent.workflow ?? '—'}</dd>
      </div>
      {agent.cron ? (
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted">Cron</dt>
          <dd className={statValueClass}>
            {agent.cron.job_name} ({agent.cron.schedule})
          </dd>
        </div>
      ) : null}
      {agent.sourcePath ? (
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted">Handler source</dt>
          <dd className={statValueClass}>{agent.sourcePath}</dd>
        </div>
      ) : null}
      {agent.secrets.length > 0 ? (
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-muted">Secrets</dt>
          <dd className={statValueClass}>{agent.secrets.join(', ')}</dd>
        </div>
      ) : null}
    </dl>
  )
}
