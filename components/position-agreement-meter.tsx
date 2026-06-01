'use client'

import type { CSSProperties } from 'react'
import { agreementMeterFill } from '@/lib/topic-explore-ui'

const PRIMARY_TICKS = Array.from({ length: 11 }, (_, i) => i * 10)
const SECONDARY_TICKS = Array.from({ length: 10 }, (_, i) => i * 10 + 5)

const BAR_HEIGHT = 'h-5'

function tickPosition(tick: number): CSSProperties {
  if (tick === 0) return { left: 0 }
  if (tick === 100) return { right: 0 }
  return { left: `${tick}%`, transform: 'translateX(-50%)' }
}

export function PositionAgreementMeter({ percent }: { percent: number }) {
  const value = Math.min(100, Math.max(0, Math.round(percent)))

  return (
    <div className="relative h-7 w-full overflow-hidden">
      <div
        className={`absolute inset-x-0 bottom-0 z-0 ${BAR_HEIGHT} rounded-full bg-muted/25`}
        aria-hidden
      />
      {SECONDARY_TICKS.map((tick) => (
        <div
          key={`secondary-${tick}`}
          className={`absolute bottom-0 z-[5] ${BAR_HEIGHT} w-px bg-[var(--border)] opacity-60`}
          style={tickPosition(tick)}
          aria-hidden
        />
      ))}
      {PRIMARY_TICKS.map((tick) => (
        <div
          key={`primary-${tick}`}
          className="absolute top-0 bottom-0 z-[5] w-[2px] bg-[var(--border)]"
          style={tickPosition(tick)}
          aria-hidden
        />
      ))}
      <div
        className={`absolute bottom-0 left-0 z-[15] ${BAR_HEIGHT} rounded-r-full opacity-90`}
        style={{ width: `${value}%`, backgroundColor: agreementMeterFill }}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute bottom-0 left-0 z-20 flex ${BAR_HEIGHT} items-center overflow-hidden px-2.5`}
        style={{ width: `${value}%` }}
      >
        <span className="truncate text-xs font-semibold tabular-nums text-white">
          {value}% agree
        </span>
      </div>
      <span className="sr-only">{value} percent agree with this position</span>
    </div>
  )
}
