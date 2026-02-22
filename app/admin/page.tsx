'use client'

import Link from 'next/link'
import { FileText, Activity, BookOpen, GitBranch } from 'lucide-react'
import { Panel } from '@/components/Panel'

const adminLinks = [
  { href: '/admin/topics', label: 'Topics', icon: FileText, description: 'Create topics, run the pipeline, and manage topic content.' },
  { href: '/admin/stories', label: 'Stories', icon: BookOpen, description: 'Review stories and moderate content.' },
  { href: '/admin/positions', label: 'Positions', icon: GitBranch, description: 'Browse positions, controversies, and viewpoints. Investigate pipeline output and trace to claims and stories.' },
  { href: '/admin/health', label: 'Health', icon: Activity, description: 'Monitor data health and pipeline status.' },
]

export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            Home
          </Link>
          <span className="text-muted">/</span>
          <span className="text-sm font-medium">Admin</span>
        </div>

        <section aria-labelledby="admin-dashboard-heading" className="space-y-4">
          <h1 id="admin-dashboard-heading" className="text-xl font-semibold">
            Admin dashboard
          </h1>
          <p className="text-sm text-muted">
            Manage topics, review stories, and monitor Doxa&apos;s data health.
          </p>
          <ul className="grid gap-3 sm:grid-cols-1">
            {adminLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>
                  <Panel variant="soft" interactive className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                        <item.icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{item.label}</p>
                        <p className="mt-0.5 text-sm text-muted">{item.description}</p>
                      </div>
                    </div>
                  </Panel>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
