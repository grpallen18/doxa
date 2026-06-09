'use client'

import { usePathname } from 'next/navigation'
import { AdminShell } from '@/components/admin/admin-shell'

function isEntityRecordRoute(pathname: string): boolean {
  return (
    /^\/admin\/stories\/[^/]+/.test(pathname) ||
    pathname.startsWith('/admin/records/') ||
    pathname.startsWith('/admin/agents/') ||
    pathname.startsWith('/admin/agreements/') ||
    /^\/admin\/controversies\/[^/]+/.test(pathname)
  )
}

function adminMaxWidth(pathname: string): 'default' | 'wide' | 'full' | 'content' {
  if (pathname === '/admin') return 'wide'
  if (isEntityRecordRoute(pathname)) return 'full'
  if (pathname.startsWith('/admin/health') || pathname.startsWith('/admin/positions')) {
    return 'content'
  }
  return 'default'
}

function adminShellClass(pathname: string): string | undefined {
  if (isEntityRecordRoute(pathname)) {
    return 'min-h-full bg-surface-canvas px-0 sm:px-0 md:px-0 lg:px-0'
  }
  return undefined
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <AdminShell maxWidth={adminMaxWidth(pathname)} className={adminShellClass(pathname)}>
      {children}
    </AdminShell>
  )
}
