import { cn } from '@/lib/utils'

type LegacyFinding = {
  severity?: string
  description?: string
  type?: string
}

export type ClaimsIssue = {
  severity?: string
  issue_type?: string
  finding?: string
  claim_id?: string | null
}

export type ClaimsPatch = {
  action?: string
  severity?: string
  reason?: string
  recommended_raw_text?: string | null
  claim_ids?: string[]
}

function EmptyMessage({ message }: { message: string }) {
  return <p className="text-xs text-muted">{message}</p>
}

export function ClaimsReviewReportDisplay({
  report,
  emptyMessage = 'No issues.',
}: {
  report: unknown
  emptyMessage?: string
}) {
  if (!report || typeof report !== 'object') return null
  const r = report as {
    summary?: string
    recommended_action?: string
    passes_review?: boolean
    issues?: ClaimsIssue[]
    patches?: ClaimsPatch[]
    findings?: LegacyFinding[]
  }

  const issues = r.issues ?? []
  const legacyFindings = r.findings ?? []
  const patches = r.patches ?? []

  return (
    <div className="space-y-2">
      {r.summary ? (
        <p className="rounded bg-muted/20 px-2 py-1.5 text-xs text-foreground">{r.summary}</p>
      ) : null}
      {r.recommended_action ? (
        <p className="text-xs text-muted">
          Action: <span className="font-medium text-foreground">{r.recommended_action}</span>
          {typeof r.passes_review === 'boolean'
            ? ` · passes_review=${r.passes_review ? 'true' : 'false'}`
            : null}
        </p>
      ) : null}

      {issues.length > 0 ? (
        <ul className="space-y-1.5">
          {issues.map((issue, i) => (
            <li key={i} className="rounded bg-muted/20 px-2 py-1.5 text-xs">
              <span className="font-medium capitalize">{issue.severity ?? 'note'}</span>
              {issue.issue_type ? ` · ${issue.issue_type.replace(/_/g, ' ')}` : ''}
              {issue.claim_id ? ` · ${issue.claim_id}` : ''}: {issue.finding}
            </li>
          ))}
        </ul>
      ) : legacyFindings.length > 0 ? (
        <ul className="space-y-1.5">
          {legacyFindings.map((f, i) => (
            <li key={i} className="rounded bg-muted/20 px-2 py-1.5 text-xs">
              <span className="font-medium capitalize">{f.severity ?? 'note'}</span>
              {f.type ? ` · ${f.type.replace(/_/g, ' ')}` : ''}: {f.description}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyMessage message={emptyMessage} />
      )}

      {patches.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">Recommended patches</p>
          <ul className="space-y-1.5">
            {patches.map((patch, i) => (
              <li key={i} className="rounded bg-muted/20 px-2 py-1.5 text-xs">
                <span className="font-medium capitalize">{patch.action ?? 'patch'}</span>
                {patch.severity ? ` · ${patch.severity}` : ''}
                {patch.claim_ids?.length ? ` · ${patch.claim_ids.join(', ')}` : ''}
                {patch.reason ? `: ${patch.reason}` : ''}
                {patch.recommended_raw_text ? (
                  <p className="mt-1 text-foreground">{patch.recommended_raw_text}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function ClaimIssueList({
  issues,
  className = 'text-xs',
  listClassName,
}: {
  issues: ClaimsIssue[]
  className?: string
  listClassName?: string
}) {
  if (issues.length === 0) return null

  return (
    <ul className={cn('space-y-1.5', listClassName)}>
      {issues.map((issue, i) =>
        issue.finding ? (
          <li key={i} className={cn('rounded bg-muted/20 px-2 py-1.5', className)}>
            {issue.finding}
          </li>
        ) : null
      )}
    </ul>
  )
}

export function ClaimRepairGuidanceList({
  patches,
  className = 'text-xs',
  listClassName,
}: {
  patches: ClaimsPatch[]
  className?: string
  listClassName?: string
}) {
  if (patches.length === 0) return null

  return (
    <ul className={cn('space-y-1.5', listClassName)}>
      {patches.map((patch, i) =>
        patch.reason ? (
          <li key={i} className={cn('rounded bg-muted/20 px-2 py-1.5', className)}>
            {patch.reason}
          </li>
        ) : null
      )}
    </ul>
  )
}

type ClaimScopedReviewFeedbackProps = {
  report: {
    claim_verdict?: 'pass' | 'needs_repair' | 'reject_final' | null
    claim_verdict_label?: string
    claim_summary?: string | null
    issues?: ClaimsIssue[]
    patches?: ClaimsPatch[]
    claim_audit?: Array<{ claim_id?: string; verdict?: string; reason?: string }>
    deterministic_issues?: unknown[]
    refinement_instruction?: string | null
  }
}

export function ClaimScopedReviewFeedback({ report }: ClaimScopedReviewFeedbackProps) {
  const issues = report.issues ?? []
  const patches = report.patches ?? []
  const deterministicIssues = (report.deterministic_issues ?? []).filter(
    (issue): issue is string => typeof issue === 'string'
  )

  return (
    <div className="space-y-2">
      {report.claim_summary ? (
        <p className="rounded bg-muted/20 px-2 py-1.5 text-xs text-foreground">
          {report.claim_summary}
        </p>
      ) : null}

      {deterministicIssues.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">Failed checks</p>
          <ul className="space-y-1.5">
            {deterministicIssues.map((issue, i) => (
              <li key={i} className="rounded bg-muted/20 px-2 py-1.5 text-xs text-foreground">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">Issues</p>
          <ClaimIssueList issues={issues} />
        </div>
      ) : report.claim_verdict === 'pass' ? (
        <EmptyMessage message="No issues for this claim." />
      ) : null}

      {patches.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">Repair guidance</p>
          <ClaimRepairGuidanceList patches={patches} />
        </div>
      ) : null}

      {report.refinement_instruction ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted">Refinement notes</p>
          <p className="rounded bg-muted/20 px-2 py-1.5 text-xs text-foreground">
            {report.refinement_instruction}
          </p>
        </div>
      ) : null}
    </div>
  )
}
