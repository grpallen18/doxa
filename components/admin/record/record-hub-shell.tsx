'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { EntityHeader, type EntityHeaderMetaItem } from '@/components/admin/record/entity-header'
import {
  RecordPageBody,
  RecordPageFrame,
} from '@/components/admin/record/record-page-frame'
import {
  RecordEntityLinkBar,
  type RecordEntityLink,
} from '@/components/admin/record/record-entity-link-bar'
import type { EntityRecordKind } from '@/lib/admin/entity-record-icons'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import { StatusBadge } from '@/components/admin/record/status-badge'
import {
  PipelineStepNode,
  pipelineNodeTrackClass,
} from '@/components/admin/pipeline/pipeline-step-node'
import { RecordAuditSection } from '@/components/admin/record/record-audit-section'
import { cn } from '@/lib/utils'

export type RecordLifecycleNode = {
  id: string
  label: string
  status: 'complete' | 'current' | 'pending' | 'blocked' | 'optional'
}

export function RecordHubLifecyclePath({
  nodes,
}: {
  nodes: RecordLifecycleNode[]
}) {
  return (
    <div className="flex min-w-max items-center gap-4 overflow-x-auto pb-1">
      {nodes.map((node, index) => (
        <div key={node.id} className="relative flex flex-col items-center gap-1">
          {index > 0 && (
            <span
              aria-hidden
              className={cn(
                'absolute -left-4 top-3 h-0.5 w-4',
                pipelineNodeTrackClass(
                  nodes[index - 1].status === 'complete' || nodes[index - 1].status === 'optional'
                    ? 'complete'
                    : 'pending'
                )
              )}
            />
          )}
          <PipelineStepNode status={node.status} size="substage" />
          <span className="max-w-[5rem] text-center text-[10px] font-medium leading-tight">
            {node.label}
          </span>
        </div>
      ))}
    </div>
  )
}

export function RecordHubShell({
  title,
  subtitle,
  meta,
  links,
  lifecycle,
  sections,
  auditApiPath,
  entityType,
}: {
  title: string
  subtitle?: string
  entityType: EntityRecordKind
  meta?: EntityHeaderMetaItem[]
  links?: RecordEntityLink[]
  lifecycle?: { title: string; nodes: RecordLifecycleNode[] }
  sections: Array<{
    id: string
    title: string
    description?: string
    children: ReactNode
  }>
  auditApiPath?: string
}) {
  return (
    <RecordPageFrame>
      <EntityHeader
        layout="record"
        embedded
        entityType={entityType}
        title={title}
        subtitle={subtitle}
        meta={meta}
      />
      {links && links.length > 0 && <RecordEntityLinkBar links={links} />}

      <RecordPageBody>
        {lifecycle && (
          <RecordSectionCard
            id="lifecycle"
            title={lifecycle.title}
            variant="panel"
            defaultOpen={false}
          >
            <RecordHubLifecyclePath nodes={lifecycle.nodes} />
          </RecordSectionCard>
        )}
        {sections.map((section) => (
          <RecordSectionCard
            key={section.id}
            id={section.id}
            title={section.title}
            description={section.description}
            variant="panel"
          >
            {section.children}
          </RecordSectionCard>
        ))}
        {auditApiPath && (
          <RecordAuditSection
            apiPath={auditApiPath}
            title="History"
            variant="panel"
          />
        )}
      </RecordPageBody>
    </RecordPageFrame>
  )
}

export function ProvenanceStoryList({
  items,
}: {
  items: Array<{
    story_id: string
    story_title: string | null
    story_url: string | null
    excerpt: string
    confidence?: number
  }>
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted">No contributing stories.</p>
  }

  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item.story_id} className="rounded-md border border-subtle px-3 py-2">
          <Link
            href={`/admin/stories/${item.story_id}`}
            className="font-medium text-accent-primary hover:underline"
          >
            {item.story_title ?? item.story_id.slice(0, 8)}
          </Link>
          <p className="mt-1 leading-snug">{item.excerpt}</p>
          {item.confidence != null && (
            <p className="mt-1 text-xs text-muted">
              Extraction confidence: {Math.round(item.confidence * 100)}%
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ClusterLinkList({ ids, label }: { ids: string[]; label: string }) {
  if (ids.length === 0) return null
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <ul className="mt-1 space-y-1 text-sm">
        {ids.map((id) => (
          <li key={id}>
            <Link href={`/admin/agreements/${id}`} className="text-accent-primary hover:underline">
              {id.slice(0, 8)}…
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RecordStatusLine({ status }: { status: string }) {
  return <StatusBadge label={status} variant="default" />
}
