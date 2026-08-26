'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export const ADMIN_QUICK_LINKS = [
  { href: '/admin', label: 'Admin Center', match: 'exact' as const },
  { href: '/admin/stories', label: 'Stories', match: 'prefix' as const },
  { href: '/admin/neo', label: 'Neo', match: 'prefix' as const },
  { href: '/admin/graph-controversies', label: 'Debate', match: 'prefix' as const },
  { href: '/admin/observability', label: 'Observability', match: 'prefix' as const },
] as const

function isLinkActive(pathname: string, href: string, match: 'exact' | 'prefix'): boolean {
  if (match === 'exact') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminCenterNav() {
  const pathname = usePathname()
  const activeHref =
    ADMIN_QUICK_LINKS.find((item) => isLinkActive(pathname, item.href, item.match))?.href ?? null

  return (
    <header className="flex w-full flex-col">
      <nav
        aria-label="Admin sections"
        className="flex w-full flex-wrap items-stretch justify-start"
      >
        {ADMIN_QUICK_LINKS.map((item, index) => {
          const isActive = item.href === activeHref

          return (
            <Fragment key={item.href}>
              {index > 0 && <Separator orientation="vertical" />}
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none"
                asChild
              >
                <Link href={item.href} aria-current={isActive ? 'page' : undefined}>
                  {item.label}
                </Link>
              </Button>
            </Fragment>
          )
        })}
      </nav>
      <Separator />
    </header>
  )
}
