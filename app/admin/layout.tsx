'use client'

import { usePathname } from 'next/navigation'
import { AdminShell } from '@/components/admin/admin-shell'

function adminMaxWidth(pathname: string): 'default' | 'wide' | 'content' {
  if (pathname === '/admin') return 'wide'
  if (/^\/admin\/stories\/[^/]+/.test(pathname)) return 'wide'
  if (pathname.startsWith('/admin/health') || pathname.startsWith('/admin/positions')) {
    return 'content'
  }
  return 'default'
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <AdminShell maxWidth={adminMaxWidth(pathname)}>{children}</AdminShell>
}
