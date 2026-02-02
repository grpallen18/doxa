'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useNavigationOverlay } from '@/components/NavigationOverlayContext'
import type { ReactNode } from 'react'

type PageLinkProps = {
  href: string
  children: ReactNode
  className?: string
}

/** Client link for /page/... routes that shows the navigation overlay on click. */
export function PageLink({ href, children, className }: PageLinkProps) {
  const router = useRouter()
  const overlay = useNavigationOverlay()

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    overlay?.showOverlayFor(href)
    router.push(href)
  }

  return (
    <Link href={href} onClick={handleClick} className={className}>
      {children}
    </Link>
  )
}
