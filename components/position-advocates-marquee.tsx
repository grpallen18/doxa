'use client'

import { cn } from '@/lib/utils'

export function PositionAdvocatesMarquee({ names }: { names: string[] }) {
  if (names.length === 0) return null

  const loop = [...names, ...names]

  return (
    <div
      className="relative w-full overflow-hidden"
      aria-label={`Notable advocates: ${names.join(', ')}`}
    >
      <div
        className={cn(
          'flex w-max items-center gap-4',
          'motion-reduce:animate-none animate-advocate-marquee-x'
        )}
      >
        {loop.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="shrink-0 whitespace-nowrap text-xs text-foreground"
            title={name}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
