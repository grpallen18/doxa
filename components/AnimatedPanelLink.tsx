'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useCallback, useEffect, type ReactNode } from 'react'
import { Panel } from '@/components/Panel'
import { INTERACTIVE_ANIMATION_MS } from '@/lib/constants'

type AnimatedPanelLinkProps = {
  href: string
  className?: string
  children: ReactNode
}

/** Link that wraps a soft interactive Panel and enforces minimum active time before navigation (same logic as primary Button). */
export function AnimatedPanelLink({ href, className, children }: AnimatedPanelLinkProps) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const mouseDownAt = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const handleMouseDown = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    panelRef.current?.classList.add('panel-active')
    mouseDownAt.current = Date.now()
    timeoutRef.current = setTimeout(() => {
      panelRef.current?.classList.remove('panel-active')
      timeoutRef.current = null
    }, INTERACTIVE_ANIMATION_MS)
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault()
      const elapsed = Date.now() - mouseDownAt.current
      const remaining = Math.max(0, INTERACTIVE_ANIMATION_MS - elapsed)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      timeoutRef.current = setTimeout(() => {
        panelRef.current?.classList.remove('panel-active')
        timeoutRef.current = null
        router.push(href)
      }, remaining)
    },
    [href, router]
  )

  return (
    <Link href={href} onMouseDown={handleMouseDown} onClick={handleClick}>
      <Panel ref={panelRef} variant="soft" className={className}>
        {children}
      </Panel>
    </Link>
  )
}
