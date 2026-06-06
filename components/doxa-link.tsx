import Link from 'next/link'
import { cn } from '@/lib/utils'
import { doxaLinkClassName } from '@/lib/explore-link-styles'
import type { ComponentProps } from 'react'

type DoxaLinkProps = ComponentProps<typeof Link> & {
  truncate?: boolean
}

export function DoxaLink({ className, truncate, children, title, ...props }: DoxaLinkProps) {
  const textLabel = typeof children === 'string' ? children : undefined

  return (
    <Link
      className={cn(doxaLinkClassName, truncate && 'doxa-link--truncate', className)}
      title={title ?? (truncate ? textLabel : undefined)}
      {...props}
    >
      <span className="doxa-link__text">{children}</span>
    </Link>
  )
}
