'use client'

import { AdminMetricCards } from '@/components/admin/admin-metric-cards'
import { GlobalLayoutPanel } from '@/components/admin/global-layout-panel'
import { NeoColorsPanel } from '@/components/admin/neo-colors-panel'
import { OpenAiModelConfigPanel } from '@/components/admin/openai-model-config-panel'
import { ADMIN_STATUS_PLACEHOLDER } from '@/lib/admin/admin-status-placeholder'

const healthMetrics = [
  { label: 'Pending QA', value: ADMIN_STATUS_PLACEHOLDER.storiesPendingQa, href: '/admin/stories' },
  { label: 'Scrape fails (24h)', value: ADMIN_STATUS_PLACEHOLDER.scrapeFailures24h, href: '/admin/observability' },
  { label: 'In pipeline', value: ADMIN_STATUS_PLACEHOLDER.storiesInPipeline, href: '/admin/stories' },
  { label: 'Agreement clusters', value: ADMIN_STATUS_PLACEHOLDER.agreementClusters, href: '/admin/graph-controversies' },
  { label: 'Claims linked', value: ADMIN_STATUS_PLACEHOLDER.canonicalClaimsLinked, href: '/admin/stories' },
  { label: 'Awaiting scrape', value: ADMIN_STATUS_PLACEHOLDER.awaitingScrape, href: '/admin/stories' },
  { label: 'Merge QA blocked', value: ADMIN_STATUS_PLACEHOLDER.mergeQaBlocked, href: '/admin/stories' },
  { label: 'Scrape success', value: ADMIN_STATUS_PLACEHOLDER.scrapeSuccessRate, href: '/admin/observability' },
  { label: 'Awaiting cleaning', value: ADMIN_STATUS_PLACEHOLDER.awaitingCleaning, href: '/admin/stories' },
  { label: 'Awaiting merge', value: ADMIN_STATUS_PLACEHOLDER.awaitingMerge, href: '/admin/stories' },
  { label: 'Chunks extracted (24h)', value: ADMIN_STATUS_PLACEHOLDER.chunksExtracted24h, href: '/admin/observability' },
  { label: 'Merges completed (24h)', value: ADMIN_STATUS_PLACEHOLDER.mergesCompleted24h, href: '/admin/observability' },
  { label: 'Controversies', value: ADMIN_STATUS_PLACEHOLDER.controversiesActive, href: '/admin/graph-controversies' },
  { label: 'Viewpoints', value: ADMIN_STATUS_PLACEHOLDER.viewpointsActive, href: '/admin/graph-controversies' },
  { label: 'Events linked', value: ADMIN_STATUS_PLACEHOLDER.eventsLinked, href: '/admin/stories' },
  { label: 'Stuck processing', value: ADMIN_STATUS_PLACEHOLDER.stuckProcessing, href: '/admin/observability' },
] as const

function AdminCenterContent() {
  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Dashboard metrics">
        <AdminMetricCards healthMetrics={[...healthMetrics]} />
      </section>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        Settings
      </h2>

      <section
        aria-label="Settings"
        className="grid gap-3 sm:grid-cols-2"
      >
        <OpenAiModelConfigPanel />
        <GlobalLayoutPanel />
        <NeoColorsPanel />
      </section>
    </div>
  )
}

export default function AdminCenterPage() {
  return <AdminCenterContent />
}
