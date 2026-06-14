import Image from 'next/image'
import { cn } from '@/lib/utils'

export function CloudflareIcon({
  className,
  size = 20,
}: {
  className?: string
  size?: number
}) {
  return (
    <Image
      src="/cloudflare-icon.png"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
    />
  )
}
