import type { RecordLedgerTab } from '@/components/admin/record/record-ledger-table'
import {
  extractClaimsFromSnapshot,
  type ChunkClaimVersionSummary,
  type ChunkQaHistoryEvent,
  type ChunkQaHistoryPayload,
  type ClaimSnapshot,
} from '@/lib/admin/chunk-qa-history'

export type ClaimReviewWorkspaceStatus =
  | 'approved'
  | 'needs_refinement'
  | 'rejected'
  | 'pending'

export type ClaimReviewWorkspaceRow = {
  claimNumber: number
  claimId: string
  status: ClaimReviewWorkspaceStatus
  statusLabel: string
  preview: string
  issueSummary: string | null
  versionCount: number
  lastStep: string
  changed: boolean
}

export type ClaimAuditVerdict = 'pass' | 'needs_repair' | 'reject_final'

export type ClaimScopedReviewReport = {
  claim_verdict: ClaimAuditVerdict | null
  claim_verdict_label: string
  claim_summary: string | null
  issues: Record<string, unknown>[]
  patches: Record<string, unknown>[]
  claim_audit: Record<string, unknown>[]
  deterministic_issues: unknown[]
  refinement_instruction: string | null
}

export type ClaimLifecycleReviewStep = {
  kind: 'review'
  label: string
  event: ChunkQaHistoryEvent
  filteredReport: ClaimScopedReviewReport
}

export type ClaimLifecycleClaimStep = {
  kind: 'claim'
  label: string
  text: string
}

export type ClaimLifecycleStep = ClaimLifecycleReviewStep | ClaimLifecycleClaimStep

export type ClaimReviewLifecycle = {
  claimId: string
  claimNumber: number
  steps: ClaimLifecycleStep[]
  metadataDiff: ClaimVersionMetadataDiff | null
}

export type ClaimMetadataFieldDiff = {
  field: string
  label: string
  before: string
  after: string
}

export type ClaimVersionMetadataDiff = {
  hasChanges: boolean
  fields: ClaimMetadataFieldDiff[]
  noChangesNote: string | null
}

type ClaimVersionMetadata = {
  raw_text: string
  polarity: string | null
  stance: string | null
  source_excerpt: string | null
  span_start: number | null
  span_end: number | null
  extraction_confidence: number | null
}

export type ClaimReviewWorkspace = {
  tabs: RecordLedgerTab[]
  rowsByTab: Record<string, ClaimReviewWorkspaceRow[]>
  lifecycleByClaimId: Map<string, ClaimReviewLifecycle>
  defaultTabId: string
}

const STATUS_LABELS: Record<ClaimReviewWorkspaceStatus, string> = {
  approved: 'Approved',
  needs_refinement: 'Needs refinement',
  rejected: 'Rejected',
  pending: 'Pending',
}

const VERDICT_LABELS: Record<ClaimAuditVerdict, string> = {
  pass: 'Approved',
  needs_repair: 'Needs refinement',
  reject_final: 'Rejected',
}

const TAB_ORDER: ClaimReviewWorkspaceStatus[] = [
  'approved',
  'needs_refinement',
  'rejected',
  'pending',
]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatSpan(start: number | null, end: number | null): string {
  if (start == null && end == null) return '—'
  if (start != null && end != null) return `${start}–${end}`
  return String(start ?? end)
}

function formatConfidence(value: number | null): string {
  if (value == null) return '—'
  return value.toFixed(2)
}

function claimRecordInVersion(
  version: ChunkClaimVersionSummary,
  claimId: string
): ClaimVersionMetadata | null {
  const blob = asRecord(version.claims_json)
  if (!blob) return null

  for (const row of asArray(blob.claims)) {
    const record = asRecord(row)
    if (!record || str(record.claim_id) !== claimId) continue

    const raw_text = str(record.raw_text)?.trim() ?? ''
    if (!raw_text) return null

    return {
      raw_text,
      polarity: str(record.polarity),
      stance: str(record.stance),
      source_excerpt: str(record.source_excerpt),
      span_start: num(record.span_start),
      span_end: num(record.span_end),
      extraction_confidence: num(record.extraction_confidence),
    }
  }

  return null
}

function diffClaimVersionMetadata(
  before: ClaimVersionMetadata,
  after: ClaimVersionMetadata
): ClaimMetadataFieldDiff[] {
  const diffs: ClaimMetadataFieldDiff[] = []

  if (before.polarity !== after.polarity) {
    diffs.push({
      field: 'polarity',
      label: 'Polarity',
      before: before.polarity ?? '—',
      after: after.polarity ?? '—',
    })
  }

  if (before.stance !== after.stance) {
    diffs.push({
      field: 'stance',
      label: 'Stance',
      before: before.stance ?? '—',
      after: after.stance ?? '—',
    })
  }

  if (before.extraction_confidence !== after.extraction_confidence) {
    diffs.push({
      field: 'extraction_confidence',
      label: 'Confidence',
      before: formatConfidence(before.extraction_confidence),
      after: formatConfidence(after.extraction_confidence),
    })
  }

  const beforeSpan = formatSpan(before.span_start, before.span_end)
  const afterSpan = formatSpan(after.span_start, after.span_end)
  if (beforeSpan !== afterSpan) {
    diffs.push({
      field: 'span',
      label: 'Span',
      before: beforeSpan,
      after: afterSpan,
    })
  }

  if ((before.source_excerpt ?? '') !== (after.source_excerpt ?? '')) {
    diffs.push({
      field: 'source_excerpt',
      label: 'Source excerpt',
      before: before.source_excerpt?.trim() || '—',
      after: after.source_excerpt?.trim() || '—',
    })
  }

  return diffs
}

export function buildClaimMetadataDiffForClaim(
  claimId: string,
  versions: ChunkClaimVersionSummary[]
): ClaimVersionMetadataDiff | null {
  const ordered = sortedVersions(versions)
  const originalVersion = ordered.find((version) => version.version_number === 0) ?? ordered[0]
  const refinedVersion = [...ordered]
    .reverse()
    .find((version) => version.source === 'refiner' && claimInVersion(version, claimId))

  if (!originalVersion || !refinedVersion) return null

  const before = claimRecordInVersion(originalVersion, claimId)
  const after = claimRecordInVersion(refinedVersion, claimId)
  if (!before || !after) return null

  const fields = diffClaimVersionMetadata(before, after)
  const hasTextChange = before.raw_text !== after.raw_text
  const hasChanges = hasTextChange || fields.length > 0

  return {
    hasChanges,
    fields,
    noChangesNote: hasChanges
      ? null
      : 'No textual or metadata changes recorded between versions.',
  }
}

function claimTextInVersion(
  version: ChunkClaimVersionSummary,
  claimId: string
): string | null {
  const claims = extractClaimsFromSnapshot(version.claims_json)
  return claims.find((claim) => claim.claim_id === claimId)?.raw_text ?? null
}

function claimInVersion(version: ChunkClaimVersionSummary, claimId: string): boolean {
  return claimTextInVersion(version, claimId) != null
}

function sortedVersions(versions: ChunkClaimVersionSummary[]): ChunkClaimVersionSummary[] {
  return [...versions].sort((left, right) => left.version_number - right.version_number)
}

function activeEvents(events: ChunkQaHistoryEvent[]): ChunkQaHistoryEvent[] {
  return events.filter((event) => !event.reverted)
}

function claimOrderFromVersions(versions: ChunkClaimVersionSummary[]): string[] {
  const order: string[] = []
  const seen = new Set<string>()

  for (const version of sortedVersions(versions)) {
    const claims = extractClaimsFromSnapshot(version.claims_json)
    for (const claim of claims) {
      if (seen.has(claim.claim_id)) continue
      seen.add(claim.claim_id)
      order.push(claim.claim_id)
    }
  }

  return order
}

function claimIdAtIndex(claims: ClaimSnapshot[], index: number | null): string | null {
  if (index == null || index < 0 || index >= claims.length) return null
  return claims[index]?.claim_id ?? null
}

function claimMentionedInEvent(event: ChunkQaHistoryEvent, claimId: string): boolean {
  if (event.claims_after.some((claim) => claim.claim_id === claimId)) return true
  if (event.claims_before.some((claim) => claim.claim_id === claimId)) return true

  const report = asRecord(event.report)
  if (!report) return false

  const audit = asArray(report.claim_audit)
  if (audit.some((row) => asRecord(row)?.claim_id === claimId)) return true

  const issues = asArray(report.issues)
  for (const issue of issues) {
    const row = asRecord(issue)
    if (!row) continue
    const id = str(row.claim_id) ?? claimIdAtIndex(event.claims_after, row.claim_index as number)
    if (id === claimId) return true
  }

  const patches = asArray(report.patches)
  for (const patch of patches) {
    const row = asRecord(patch)
    if (!row) continue
    const ids = asArray(row.claim_ids).filter((id): id is string => typeof id === 'string')
    if (ids.includes(claimId)) return true
  }

  return false
}

function latestReviewForClaim(
  claimId: string,
  events: ChunkQaHistoryEvent[]
): ChunkQaHistoryEvent | null {
  const reviews = activeEvents(events).filter((event) => event.kind === 'review')
  for (let i = reviews.length - 1; i >= 0; i -= 1) {
    if (claimMentionedInEvent(reviews[i], claimId)) return reviews[i]
  }
  return null
}

function workspaceStatusFromVerdict(
  verdict: ClaimAuditVerdict | null
): ClaimReviewWorkspaceStatus {
  if (verdict === 'pass') return 'approved'
  if (verdict === 'needs_repair') return 'needs_refinement'
  if (verdict === 'reject_final') return 'rejected'
  return 'pending'
}

function latestVersionContainingClaim(
  claimId: string,
  versions: ChunkClaimVersionSummary[]
): ChunkClaimVersionSummary | null {
  const ordered = sortedVersions(versions)
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (claimInVersion(ordered[i], claimId)) return ordered[i]
  }
  return null
}

function deriveVerdictFromReview(
  event: ChunkQaHistoryEvent,
  claimId: string
): ClaimReviewWorkspaceStatus {
  return workspaceStatusFromVerdict(
    claimVerdictFromReport(event.report, claimId, event.claims_after)
  )
}

function deriveClaimStatus(
  claimId: string,
  versions: ChunkClaimVersionSummary[],
  events: ChunkQaHistoryEvent[]
): ClaimReviewWorkspaceStatus {
  const ordered = sortedVersions(versions)
  if (!ordered.some((version) => claimInVersion(version, claimId))) return 'rejected'

  const latestReview = latestReviewForClaim(claimId, events)
  if (!latestReview) return 'pending'

  const status = deriveVerdictFromReview(latestReview, claimId)

  if (status === 'needs_refinement') {
    const refinedAfterReview = ordered.some(
      (version) =>
        version.source === 'refiner' &&
        version.created_at > latestReview.created_at &&
        claimInVersion(version, claimId)
    )
    if (refinedAfterReview) return 'pending'

    const refinerRanAfter = ordered.some(
      (version) =>
        version.source === 'refiner' && version.created_at > latestReview.created_at
    )
    if (refinerRanAfter) return 'rejected'
  }

  if (status === 'rejected') {
    const refinedAfterReview = ordered.some(
      (version) =>
        version.source === 'refiner' &&
        version.created_at > latestReview.created_at &&
        claimInVersion(version, claimId)
    )
    if (refinedAfterReview) return 'pending'
  }

  return status
}

function issueSummaryForClaim(event: ChunkQaHistoryEvent | null, claimId: string): string | null {
  if (!event) return null
  const report = asRecord(event.report)
  if (!report) return null

  const types = new Set<string>()
  for (const issue of asArray(report.issues)) {
    const row = asRecord(issue)
    if (!row) continue
    const id = str(row.claim_id) ?? claimIdAtIndex(event.claims_after, row.claim_index as number)
    if (id !== claimId) continue
    const issueType = str(row.issue_type)
    if (issueType) types.add(issueType.replace(/_/g, ' '))
  }

  if (types.size === 0) {
    const auditRows = asArray(report.claim_audit)
    for (const row of auditRows) {
      const audit = asRecord(row)
      if (audit?.claim_id !== claimId) continue
      const reason = str(audit.reason)
      if (reason) return reason.replace(/_/g, ' ')
      const verdict = str(audit.verdict)
      if (verdict && verdict !== 'pass') return verdict.replace(/_/g, ' ')
    }
  }

  if (types.size === 0) return null
  return [...types].slice(0, 2).join(', ')
}

function countVersionsWithClaim(
  claimId: string,
  versions: ChunkClaimVersionSummary[]
): number {
  return sortedVersions(versions).filter((version) => claimInVersion(version, claimId)).length
}

function claimChangedAcrossVersions(
  claimId: string,
  versions: ChunkClaimVersionSummary[]
): boolean {
  const ordered = sortedVersions(versions)
  let previous: ClaimSnapshot | null = null

  for (const version of ordered) {
    const claims = extractClaimsFromSnapshot(version.claims_json)
    const current = claims.find((claim) => claim.claim_id === claimId) ?? null
    if (!current && !previous) continue
    if (!current || !previous) {
      if (previous && !current) return true
      previous = current
      continue
    }
    if (
      previous.raw_text !== current.raw_text ||
      previous.polarity !== current.polarity ||
      previous.stance !== current.stance
    ) {
      return true
    }
    previous = current
  }

  return false
}

function deriveLastStep(
  claimId: string,
  versions: ChunkClaimVersionSummary[],
  events: ChunkQaHistoryEvent[]
): string {
  const ordered = sortedVersions(versions)
  const latestVersion = ordered.at(-1)
  const latestVersionWithClaim = latestVersionContainingClaim(claimId, versions)

  if (!latestVersionWithClaim) return 'Removed'

  const refinerVersions = ordered.filter((version) => version.source === 'refiner')
  const lastRefiner = [...refinerVersions]
    .reverse()
    .find((version) => claimInVersion(version, claimId))
  if (lastRefiner && claimChangedAcrossVersions(claimId, versions)) {
    return `Refiner v${lastRefiner.version_number}`
  }

  const latestReview = latestReviewForClaim(claimId, events)
  if (latestReview) {
    const verdict = claimVerdictFromReport(
      latestReview.report,
      claimId,
      latestReview.claims_after
    )
    if (verdict === 'pass') return 'Review passed'
    if (verdict === 'needs_repair') return 'Review failed'
    if (verdict === 'reject_final') return 'Rejected'
  }

  if (
    latestVersion &&
    !claimInVersion(latestVersion, claimId) &&
    latestVersion.source === 'refiner'
  ) {
    return 'Review passed · unchanged'
  }

  return 'Extractor'
}

function issueClaimId(
  issue: Record<string, unknown>,
  claimsAfter: ClaimSnapshot[]
): string | null {
  return str(issue.claim_id) ?? claimIdAtIndex(claimsAfter, issue.claim_index as number)
}

function claimVerdictFromReport(
  report: unknown,
  claimId: string,
  claimsAfter: ClaimSnapshot[]
): ClaimAuditVerdict | null {
  const root = asRecord(report)
  if (!root) return null

  const auditRows = asArray(root.claim_audit)
  for (const row of auditRows) {
    const audit = asRecord(row)
    if (audit?.claim_id !== claimId) continue
    const verdict = str(audit.verdict)
    if (verdict === 'pass' || verdict === 'needs_repair' || verdict === 'reject_final') {
      return verdict
    }
  }

  const issues = asArray(root.issues)
    .map((issue) => asRecord(issue))
    .filter((issue): issue is Record<string, unknown> => issue != null)
    .filter((issue) => issueClaimId(issue, claimsAfter) === claimId)

  let hasRepairIssue = false
  for (const issue of issues) {
    const severity = str(issue.severity)
    const issueType = str(issue.issue_type)
    if (severity === 'blocking' && issueType === 'schema_issue') return 'reject_final'
    if (severity === 'blocking' || severity === 'major') hasRepairIssue = true
  }

  const patches = asArray(root.patches)
  for (const patch of patches) {
    const row = asRecord(patch)
    if (!row) continue
    const ids = asArray(row.claim_ids).filter((id): id is string => typeof id === 'string')
    if (ids.includes(claimId)) hasRepairIssue = true
  }

  if (typeof root.passes_review === 'boolean' && root.passes_review && !hasRepairIssue) {
    return 'pass'
  }
  if (hasRepairIssue) return 'needs_repair'
  if (typeof root.passes_review === 'boolean' && root.passes_review) return 'pass'
  return null
}

function claimSummaryFromScopedReport(params: {
  verdict: ClaimAuditVerdict | null
  issues: Record<string, unknown>[]
  claimAudit: Record<string, unknown>[]
}): string | null {
  const findings = params.issues
    .map((issue) => str(issue.finding))
    .filter((finding): finding is string => finding != null && finding.length > 0)

  if (findings.length > 0) return findings.join(' ')

  const auditReason = str(params.claimAudit[0]?.reason)
  if (auditReason && auditReason !== 'missing_audit_entry') {
    return auditReason.replace(/_/g, ' ')
  }

  if (params.verdict === 'pass') return 'No issues found for this claim.'
  if (params.verdict === 'needs_repair') return 'This claim requires repair before merge.'
  if (params.verdict === 'reject_final') return 'This claim was rejected and should not merge.'
  return null
}

export function filterReviewReportForClaim(
  report: unknown,
  claimId: string,
  claimsAfter: ClaimSnapshot[] = []
): ClaimScopedReviewReport {
  const root = asRecord(report)
  if (!root) {
    return {
      claim_verdict: null,
      claim_verdict_label: 'Unknown',
      claim_summary: null,
      issues: [],
      patches: [],
      claim_audit: [],
      deterministic_issues: [],
      refinement_instruction: null,
    }
  }

  const issues = asArray(root.issues)
    .map((issue) => asRecord(issue))
    .filter((issue): issue is Record<string, unknown> => issue != null)
    .filter((issue) => issueClaimId(issue, claimsAfter) === claimId)

  const patches = asArray(root.patches)
    .map((patch) => asRecord(patch))
    .filter((patch): patch is Record<string, unknown> => patch != null)
    .filter((patch) => {
      const ids = asArray(patch.claim_ids).filter((id): id is string => typeof id === 'string')
      return ids.includes(claimId)
    })

  const claimAudit = asArray(root.claim_audit)
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => row != null)
    .filter((row) => row.claim_id === claimId)

  const deterministicIssues = asArray(root.deterministic_issues).filter((issue) => {
    if (typeof issue !== 'string') return false
    return issue.includes(claimId)
  })

  const claimVerdict = claimVerdictFromReport(report, claimId, claimsAfter)
  const claimVerdictLabel =
    claimVerdict != null ? VERDICT_LABELS[claimVerdict] : 'Review completed'

  const needsRepairGuidance =
    claimVerdict === 'needs_repair' || claimVerdict === 'reject_final' || issues.length > 0

  return {
    claim_verdict: claimVerdict,
    claim_verdict_label: claimVerdictLabel,
    claim_summary: claimSummaryFromScopedReport({ verdict: claimVerdict, issues, claimAudit }),
    issues,
    patches,
    claim_audit: claimAudit,
    deterministic_issues: deterministicIssues,
    refinement_instruction: needsRepairGuidance ? str(root.refinement_instruction) : null,
  }
}

function buildLifecycleSteps(
  claimId: string,
  versions: ChunkClaimVersionSummary[],
  events: ChunkQaHistoryEvent[]
): ClaimLifecycleStep[] {
  const steps: ClaimLifecycleStep[] = []
  const ordered = sortedVersions(versions)
  const reviews = activeEvents(events).filter((event) => event.kind === 'review')
  const addedReviewIds = new Set<string>()

  const v0 = ordered.find((version) => version.version_number === 0) ?? ordered[0]
  if (v0) {
    const text = claimTextInVersion(v0, claimId)
    if (text) {
      steps.push({ kind: 'claim', label: 'v0 Extractor Claim', text })
    }
  }

  for (const refinerVersion of ordered.filter((version) => version.source === 'refiner')) {
    const reviewId = refinerVersion.created_from_review_artifact_id
    let reviewEvent =
      reviewId != null ? reviews.find((event) => event.id === reviewId) ?? null : null

    if (!reviewEvent) {
      reviewEvent =
        [...reviews]
          .filter(
            (event) =>
              event.created_at < refinerVersion.created_at &&
              claimMentionedInEvent(event, claimId)
          )
          .sort((left, right) => right.created_at.localeCompare(left.created_at))[0] ?? null
    }

    if (reviewEvent && !addedReviewIds.has(reviewEvent.id)) {
      addedReviewIds.add(reviewEvent.id)
      steps.push({
        kind: 'review',
        label: 'Reviewer Feedback',
        event: reviewEvent,
        filteredReport: filterReviewReportForClaim(
          reviewEvent.report,
          claimId,
          reviewEvent.claims_after
        ),
      })
    }

    const text = claimTextInVersion(refinerVersion, claimId)
    if (text) {
      steps.push({
        kind: 'claim',
        label: `v${refinerVersion.version_number} Refiner Claim`,
        text,
      })
    }
  }

  for (const reviewEvent of reviews) {
    if (addedReviewIds.has(reviewEvent.id)) continue
    if (!claimMentionedInEvent(reviewEvent, claimId)) continue
    addedReviewIds.add(reviewEvent.id)
    steps.push({
      kind: 'review',
      label: 'Reviewer Feedback',
      event: reviewEvent,
      filteredReport: filterReviewReportForClaim(
        reviewEvent.report,
        claimId,
        reviewEvent.claims_after
      ),
    })
  }

  return steps
}

function latestPreviewForClaim(
  claimId: string,
  versions: ChunkClaimVersionSummary[]
): string {
  const ordered = sortedVersions(versions)
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const text = claimTextInVersion(ordered[i], claimId)
    if (text) return text.trim()
  }
  return '—'
}

export function buildClaimReviewWorkspace(payload: ChunkQaHistoryPayload): ClaimReviewWorkspace {
  const { claim_versions: versions, events } = payload
  const claimIds = claimOrderFromVersions(versions)
  const lifecycleByClaimId = new Map<string, ClaimReviewLifecycle>()
  const rows: ClaimReviewWorkspaceRow[] = []

  claimIds.forEach((claimId, index) => {
    const claimNumber = index + 1
    const status = deriveClaimStatus(claimId, versions, events)
    const latestReview = latestReviewForClaim(claimId, events)

    rows.push({
      claimNumber,
      claimId,
      status,
      statusLabel: STATUS_LABELS[status],
      preview: latestPreviewForClaim(claimId, versions),
      issueSummary: issueSummaryForClaim(latestReview, claimId),
      versionCount: countVersionsWithClaim(claimId, versions),
      lastStep: deriveLastStep(claimId, versions, events),
      changed: claimChangedAcrossVersions(claimId, versions),
    })

    lifecycleByClaimId.set(claimId, {
      claimId,
      claimNumber,
      steps: buildLifecycleSteps(claimId, versions, events),
      metadataDiff: buildClaimMetadataDiffForClaim(claimId, versions),
    })
  })

  const rowsByTab: Record<string, ClaimReviewWorkspaceRow[]> = {
    approved: [],
    needs_refinement: [],
    rejected: [],
    pending: [],
  }

  for (const row of rows) {
    rowsByTab[row.status].push(row)
  }

  const tabs: RecordLedgerTab[] = TAB_ORDER.filter((status) => rowsByTab[status].length > 0).map(
    (status) => ({
      id: status,
      label: `${STATUS_LABELS[status]} (${rowsByTab[status].length})`,
    })
  )

  return {
    tabs,
    rowsByTab,
    lifecycleByClaimId,
    defaultTabId: tabs.some((tab) => tab.id === 'approved') ? 'approved' : (tabs[0]?.id ?? 'approved'),
  }
}
