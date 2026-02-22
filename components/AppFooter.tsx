'use client'

import { AppFooterLinks } from '@/components/AppFooterLinks'

export function AppFooter() {
  return (
    <footer
      className="shrink-0 border-t border-sidebar-border bg-sidebar px-4 py-4 text-xs text-sidebar-foreground sm:px-6 md:px-8"
      role="contentinfo"
    >
      <div className="mx-auto flex w-full max-w-content flex-wrap items-center justify-center gap-4 sm:justify-between">
        <AppFooterLinks />
      </div>
    </footer>
  )
}
