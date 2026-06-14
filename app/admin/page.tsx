'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'
import {
  AdminDashboardWidget,
  AdminHealthCheckWidget,
} from '@/components/admin/admin-dashboard-widget'
import { OpenAiModelConfigPanel } from '@/components/admin/openai-model-config-panel'
import { ADMIN_STATUS_PLACEHOLDER } from '@/lib/admin/admin-status-placeholder'
import { cn } from '@/lib/utils'

const quickLinks = [
  { href: '/admin/stories', label: 'Stories' },
  { href: '/admin/health', label: 'Health' },
  { href: '/admin/topics', label: 'Topics' },
  { href: '/admin/positions', label: 'Agreements' },
] as const

const healthMetrics = [
  { label: 'Pending QA', value: ADMIN_STATUS_PLACEHOLDER.storiesPendingQa, href: '/admin/stories' },
  { label: 'Scrape fails (24h)', value: ADMIN_STATUS_PLACEHOLDER.scrapeFailures24h, href: '/admin/health' },
  { label: 'In pipeline', value: ADMIN_STATUS_PLACEHOLDER.storiesInPipeline, href: '/admin/stories' },
  { label: 'Agreement clusters', value: ADMIN_STATUS_PLACEHOLDER.agreementClusters, href: '/admin/positions' },
  { label: 'Claims linked', value: ADMIN_STATUS_PLACEHOLDER.canonicalClaimsLinked, href: '/admin/stories' },
  { label: 'Awaiting scrape', value: 8, href: '/admin/stories' },
  { label: 'Merge QA blocked', value: 4, href: '/admin/stories' },
  { label: 'Scrape success', value: '94%', href: '/admin/health' },
] as const

const recentStories = [
  { title: 'Border policy shifts in Texas', id: 'demo-1' },
  { title: 'Fed holds rates steady', id: 'demo-2' },
  { title: 'EU AI Act enforcement timeline', id: 'demo-3' },
] as const

const recentTopics = [
  { title: 'Immigration', id: 'demo-topic-1' },
  { title: 'Monetary policy', id: 'demo-topic-2' },
] as const

function AdminCenterContent() {
  const pathname = usePathname()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <h1 className="shrink-0 text-lg font-semibold leading-tight">Admin Center</h1>
          <nav aria-label="Quick access" className="flex flex-wrap items-center pl-2.5 text-sm">
            {quickLinks.map((item, index) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`)

              return (
                <Fragment key={item.href}>
                  {index > 0 && (
                    <span className="px-2.5 text-muted/40 select-none" aria-hidden>
                      |
                    </span>
                  )}
                  <Link
                    href={item.href}
                    className={cn(
                      'rounded-md px-3 py-1.5 underline-offset-4 transition-colors',
                      isActive
                        ? 'bg-muted/50 font-medium text-foreground'
                        : 'text-muted hover:bg-muted/40 hover:text-foreground hover:underline'
                    )}
                  >
                    {item.label}
                  </Link>
                </Fragment>
              )
            })}
          </nav>
        </div>

      </div>

      <section
        aria-label="Dashboard widgets"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <OpenAiModelConfigPanel />

        <AdminHealthCheckWidget metrics={[...healthMetrics]} className="sm:col-span-2" />

        <AdminDashboardWidget title="Recent stories" href="/admin/stories">
          <ul className="space-y-2">
            {recentStories.map((story) => (
              <li key={story.id} className="truncate text-sm leading-snug">
                {story.title}
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-3 text-[11px] text-muted">Sample list · opens story search</p>
        </AdminDashboardWidget>

        <AdminDashboardWidget title="Agreement pair review" href="/admin/positions">
          <p className="text-3xl font-semibold tabular-nums leading-none">24</p>
          <p className="mt-2 text-sm text-muted">Position pairs awaiting relationship classification</p>
        </AdminDashboardWidget>

        <AdminDashboardWidget title="Topics activity" href="/admin/topics">
          <ul className="space-y-2">
            {recentTopics.map((topic) => (
              <li key={topic.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{topic.title}</span>
                <span className="shrink-0 text-[11px] text-muted">Draft</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-3 text-[11px] text-muted">3 topics ready to process</p>
        </AdminDashboardWidget>

        <AdminDashboardWidget title="Extraction review" href="/admin/stories">
          <p className="text-sm leading-relaxed text-muted">
            Compare article text against merged claims before canonical linking.
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">Open story queue →</p>
        </AdminDashboardWidget>

        <AdminDashboardWidget title="Pipeline roadmap" href="/admin/pipeline-roadmap">
          <p className="text-sm leading-relaxed text-muted">
            Phase plan for admin ops: story pipeline, record hubs, cluster ops, and operator polish.
          </p>
        </AdminDashboardWidget>
      </section>
    </div>
  )
}

export default function AdminCenterPage() {
  return <AdminCenterContent />
}
