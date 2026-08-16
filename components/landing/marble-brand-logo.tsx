import Image from 'next/image'
import Link from 'next/link'
import { LANDING_PATH } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Sized off height so the brand is the one thing that can shrink on a short
 * window. The `42rem` floor matches `MARBLE_BELOW_LOGO_BUDGET_CLASS` in
 * marble-shell (reserved content slot + gap + column padding). The floor stops
 * it collapsing once the card alone fills the viewport, and the cap keeps it at
 * hero size on tall ones. The artwork is exactly 3:1, so height drives the box.
 */
export const marbleLogoSizeClassName =
  'h-[min(calc(86vw_/_3),calc(34rem_/_3),max(3rem,calc(100svh_-_42rem)))] w-auto'

export const marbleLogoClassName = cn(
  marbleLogoSizeClassName,
  'doxa-logo-ltr object-contain drop-shadow-[0_3px_12px_rgba(36,31,26,0.18)] lg:object-left'
)

/**
 * Brand mark for the whole signed-out world. Rendered once by the `(marble)`
 * layout, so its reveal runs on entry and then holds while the column beneath
 * swaps between the landing CTAs and the auth cards.
 */
export function MarbleBrandLogo({ className }: { className?: string }) {
  return (
    <Link href={LANDING_PATH} aria-label="Doxa home" className={cn('block w-fit', className)}>
      <Image
        src="/logo-color-no-bg.png"
        alt="DOXA"
        width={2172}
        height={724}
        priority
        className={cn(marbleLogoClassName, 'animate-doxa-logo-ltr')}
      />
    </Link>
  )
}
