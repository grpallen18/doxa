'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export const ADMIN_QUICK_LINKS = [
  { href: '/admin', label: 'Admin Center', match: 'exact' as const },
  { href: '/admin/stories', label: 'Stories', match: 'prefix' as const },
  { href: '/admin/neo', label: 'Neo', match: 'prefix' as const },
  { href: '/admin/graph-controversies', label: 'Debate', match: 'prefix' as const },
  { href: '/admin/health', label: 'Health', match: 'prefix' as const },
  { href: '/admin/topics', label: 'Topics', match: 'prefix' as const },
] as const

type AdminCenterNavProps = {
  className?: string
}

type UnderlineIndicator = {
  left: number
  width: number
  ready: boolean
}

function isLinkActive(pathname: string, href: string, match: 'exact' | 'prefix'): boolean {
  if (match === 'exact') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminCenterNav({ className }: AdminCenterNavProps) {
  const pathname = usePathname()
  const containerRef = useRef<HTMLElement>(null)
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>())
  const [indicator, setIndicator] = useState<UnderlineIndicator>({
    left: 0,
    width: 0,
    ready: false,
  })

  const activeHref =
    ADMIN_QUICK_LINKS.find((item) => isLinkActive(pathname, item.href, item.match))?.href ?? null

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const container = containerRef.current
      if (!container || !activeHref) {
        setIndicator((prev) => ({ ...prev, width: 0, ready: false }))
        return
      }

      const activeEl = linkRefs.current.get(activeHref)
      if (!activeEl) {
        setIndicator((prev) => ({ ...prev, width: 0, ready: false }))
        return
      }

      const containerRect = container.getBoundingClientRect()
      const linkRect = activeEl.getBoundingClientRect()
      setIndicator({
        left: linkRect.left - containerRect.left + container.scrollLeft,
        width: linkRect.width,
        ready: true,
      })
    }

    updateIndicator()

    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(updateIndicator)
    observer.observe(container)
    window.addEventListener('resize', updateIndicator)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateIndicator)
    }
  }, [activeHref, pathname])

  return (
    <nav
      ref={containerRef}
      aria-label="Admin sections"
      className={cn('relative flex flex-wrap items-center justify-center text-sm', className)}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-foreground',
          indicator.ready
            ? 'transition-[left,width] duration-300 ease-out'
            : 'opacity-0'
        )}
        style={{ left: indicator.left, width: indicator.width }}
      />
      {ADMIN_QUICK_LINKS.map((item, index) => {
        const isActive = item.href === activeHref

        return (
          <Fragment key={item.href}>
            {index > 0 && (
              <span className="px-2.5 text-muted/40 select-none" aria-hidden>
                |
              </span>
            )}
            <Link
              href={item.href}
              ref={(element) => {
                if (element) linkRefs.current.set(item.href, element)
                else linkRefs.current.delete(item.href)
              }}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative z-[1] rounded-md px-3 py-1.5 transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted hover:bg-muted/40 hover:text-foreground'
              )}
            >
              {item.label}
            </Link>
          </Fragment>
        )
      })}
    </nav>
  )
}
