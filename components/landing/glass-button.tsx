import Link from 'next/link'
import { cn } from '@/lib/utils'

type GlassButtonVariant = 'primary' | 'secondary'

interface GlassButtonProps {
  href: string
  children: React.ReactNode
  variant?: GlassButtonVariant
  className?: string
}

/**
 * Landing-hero CTA. Styling lives in `.glass-button` (globals.css); the inner
 * span keeps the label above the specular sheen pseudo-element.
 */
export function GlassButton({
  href,
  children,
  variant = 'primary',
  className,
}: GlassButtonProps) {
  return (
    <Link href={href} data-variant={variant} className={cn('glass-button', className)}>
      <span>{children}</span>
    </Link>
  )
}
