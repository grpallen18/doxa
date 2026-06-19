'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  ClaimIssueList,
  ClaimRepairGuidanceList,
  type ClaimsIssue,
  type ClaimsPatch,
} from '@/components/admin/extraction/claims-review-report'
import type {
  ClaimAuditVerdict,
  ClaimLifecycleClaimStep,
  ClaimLifecycleReviewStep,
  ClaimLifecycleStep,
  ClaimMetadataFieldDiff,
  ClaimReviewLifecycle,
} from '@/lib/admin/claim-review-workspace'
import { cn } from '@/lib/utils'

const drawerBodyTextClass = 'text-sm leading-snug text-foreground'
const drawerClaimTextClass = cn(drawerBodyTextClass, 'italic whitespace-pre-wrap break-words')
const drawerSectionTitleClass = 'text-xs font-medium uppercase tracking-wide text-muted'
const drawerSubsectionTitleClass = cn(drawerBodyTextClass, 'font-semibold')
const drawerMetaTextClass = 'text-sm text-muted-foreground'
const drawerListClassName = 'space-y-1'
const drawerListItemClassName = 'rounded bg-muted/20 px-2 py-1'

function LifecycleSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-1">
      <h3 className={drawerSectionTitleClass}>{title}</h3>
      {children}
    </section>
  )
}

function LifecycleSubsection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <h4 className={drawerSubsectionTitleClass}>{title}</h4>
      {children}
    </div>
  )
}

function verdictTone(verdict: ClaimAuditVerdict | null): string {
  switch (verdict) {
    case 'pass':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'needs_repair':
      return 'text-amber-600 dark:text-amber-400'
    case 'reject_final':
      return 'text-destructive'
    default:
      return 'text-foreground'
  }
}

const metadataDiffGridClass =
  'grid grid-cols-[minmax(5.5rem,7rem)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3'

function MetadataDiffList({ fields }: { fields: ClaimMetadataFieldDiff[] }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-subtle">
      <div
        className={cn(
          metadataDiffGridClass,
          'border-b border-subtle bg-muted/20 px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted'
        )}
      >
        <span>Field</span>
        <span>Before</span>
        <span>After</span>
      </div>
      {fields.map((field, index) => (
        <div
          key={field.field}
          className={cn(
            metadataDiffGridClass,
            'border-b border-subtle px-2 py-1.5 last:border-b-0',
            index % 2 === 0 ? 'bg-surface-soft' : 'bg-surface-section'
          )}
        >
          <span className={cn(drawerSubsectionTitleClass, 'self-start')}>{field.label}</span>
          <span
            className={cn(
              drawerBodyTextClass,
              'self-start whitespace-pre-wrap break-words text-muted-foreground'
            )}
          >
            {field.before}
          </span>
          <span className={cn(drawerBodyTextClass, 'self-start whitespace-pre-wrap break-words')}>
            {field.after}
          </span>
        </div>
      ))}
    </div>
  )
}

function parseDrawerSections(steps: ClaimLifecycleStep[]) {
  const original =
    steps.find((step): step is ClaimLifecycleClaimStep => step.kind === 'claim') ?? null

  let refined: ClaimLifecycleClaimStep | null = null
  let refinedIndex = -1
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i]
    if (step.kind === 'claim' && step.label.toLowerCase().includes('refiner')) {
      refined = step
      refinedIndex = i
      break
    }
  }

  let review: ClaimLifecycleReviewStep | null = null
  if (refinedIndex >= 0) {
    for (let i = refinedIndex - 1; i >= 0; i -= 1) {
      const step = steps[i]
      if (step.kind === 'review') {
        review = step
        break
      }
    }
  }
  if (!review) {
    review =
      [...steps].reverse().find((step): step is ClaimLifecycleReviewStep => step.kind === 'review') ??
      null
  }

  return {
    original,
    review,
    refined,
  }
}

export function ClaimReviewHistoryDrawer({
  open,
  onOpenChange,
  lifecycle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lifecycle: ClaimReviewLifecycle | null
}) {
  const sections = lifecycle ? parseDrawerSections(lifecycle.steps) : null
  const issues = (sections?.review?.filteredReport.issues ?? []) as ClaimsIssue[]
  const patches = (sections?.review?.filteredReport.patches ?? []) as ClaimsPatch[]
  const claimVerdict = sections?.review?.filteredReport.claim_verdict ?? null
  const claimVerdictLabel = sections?.review?.filteredReport.claim_verdict_label ?? null
  const metadataDiff = lifecycle?.metadataDiff ?? null
  const showMetadataSection =
    metadataDiff != null &&
    (metadataDiff.fields.length > 0 || metadataDiff.noChangesNote != null)

  return (
    <Drawer open={open} onOpenChange={onOpenChange} handleOnly>
      <DrawerContent
        hideHandle
        className="flex flex-col overflow-hidden border-subtle bg-surface-soft select-text"
      >
        <DrawerHeader className="shrink-0 gap-1 border-b border-subtle p-0 px-4 pb-2 pt-1.5 text-left">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3">
            <DrawerTitle className="col-start-1 min-w-0 truncate">
              Claim Version History
            </DrawerTitle>
            <DrawerHandle className="col-start-2 mx-0 mt-0 shrink-0 justify-self-center cursor-grab active:cursor-grabbing" />
            <DrawerClose className="col-start-3 shrink-0 justify-self-end rounded-sm text-muted-foreground opacity-70 ring-offset-background transition-opacity hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </DrawerClose>
          </div>
          {lifecycle ? (
            <DrawerDescription className="flex flex-wrap items-center gap-x-1.5">
              <span>Claim #{lifecycle.claimNumber}</span>
              {claimVerdictLabel ? (
                <>
                  <span aria-hidden className="text-muted-foreground/50">
                    ·
                  </span>
                  <span className={cn('font-medium', verdictTone(claimVerdict))}>
                    {claimVerdictLabel}
                  </span>
                </>
              ) : null}
            </DrawerDescription>
          ) : null}
        </DrawerHeader>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain select-text"
          data-vaul-no-drag
        >
          <div className="space-y-3 px-4 py-3">
            {!lifecycle ? (
              <p className={cn(drawerMetaTextClass, 'text-muted')}>
                Select a claim to inspect its history.
              </p>
            ) : lifecycle.steps.length === 0 ? (
              <p className={cn(drawerMetaTextClass, 'text-muted')}>
                No version history recorded for this claim.
              </p>
            ) : (
              <>
                {sections?.original ? (
                  <LifecycleSection title="Original claim">
                    <p className={drawerClaimTextClass}>{sections.original.text}</p>
                  </LifecycleSection>
                ) : null}

                {issues.length > 0 || patches.length > 0 ? (
                  <LifecycleSection title="Reviewer feedback">
                    <div className="space-y-2">
                      {issues.length > 0 ? (
                        <LifecycleSubsection title="Issues">
                          <ClaimIssueList
                            issues={issues}
                            className={cn(drawerBodyTextClass, drawerListItemClassName)}
                            listClassName={drawerListClassName}
                          />
                        </LifecycleSubsection>
                      ) : null}

                      {patches.length > 0 ? (
                        <LifecycleSubsection title="Repair guidance">
                          <ClaimRepairGuidanceList
                            patches={patches}
                            className={cn(drawerBodyTextClass, drawerListItemClassName)}
                            listClassName={drawerListClassName}
                          />
                        </LifecycleSubsection>
                      ) : null}
                    </div>
                  </LifecycleSection>
                ) : null}

                {showMetadataSection && metadataDiff ? (
                  <LifecycleSection title="Changes">
                    {metadataDiff.fields.length > 0 ? (
                      <MetadataDiffList fields={metadataDiff.fields} />
                    ) : (
                      <p className={cn(drawerMetaTextClass, 'italic')}>
                        {metadataDiff.noChangesNote}
                      </p>
                    )}
                  </LifecycleSection>
                ) : null}

                {sections?.refined ? (
                  <LifecycleSection title="Refined claim">
                    <p className={drawerClaimTextClass}>{sections.refined.text}</p>
                  </LifecycleSection>
                ) : null}
              </>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
