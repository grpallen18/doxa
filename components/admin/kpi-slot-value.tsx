'use client'

import { useEffect, useState } from 'react'
import { SlidingNumber } from '@/components/motion-primitives/sliding-number'

export type ParsedMetric =
  | {
      kind: 'integer'
      value: number
      display: string
    }
  | {
      kind: 'decimal'
      value: number
      prefix: string
      suffix: string
      decimals: number
      display: string
    }
  | {
      kind: 'text'
      display: string
    }

export function parseMetricValue(value: string | number): ParsedMetric {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return {
        kind: 'integer',
        value,
        display: value.toLocaleString('en-US'),
      }
    }
    return {
      kind: 'decimal',
      value,
      prefix: '',
      suffix: '',
      decimals: Number.isFinite(value) ? 1 : 0,
      display: String(value),
    }
  }

  const trimmed = value.trim()
  if (trimmed === '—' || trimmed === '') {
    return { kind: 'text', display: trimmed || '—' }
  }

  const match = trimmed.match(/^([^0-9+\-]*)([+-]?\d+(?:\.\d+)?)(.*)$/)
  if (!match) {
    return { kind: 'text', display: trimmed }
  }

  const [, prefix, num, suffix] = match
  const end = Number(num)
  if (!Number.isFinite(end)) {
    return { kind: 'text', display: trimmed }
  }

  const decimals = num.includes('.')
    ? Math.min(num.split('.')[1]?.length ?? 0, 2)
    : 0
  if (decimals === 0 && !prefix && !suffix) {
    return {
      kind: 'integer',
      value: end,
      display: end.toLocaleString('en-US'),
    }
  }

  return {
    kind: 'decimal',
    value: end,
    prefix,
    suffix,
    decimals,
    display: trimmed,
  }
}

export function KpiMetricValue({ value }: { value: string | number }) {
  const parsed = parseMetricValue(value)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (parsed.kind === 'text' || reducedMotion) {
    return (
      <span className="inline-flex min-w-[5ch] flex-nowrap items-center whitespace-nowrap leading-none tabular-nums">
        {parsed.display}
      </span>
    )
  }

  if (parsed.kind === 'integer') {
    return (
      <span className="inline-flex min-w-[5ch] flex-nowrap items-center justify-start whitespace-nowrap leading-none tabular-nums">
        <SlidingNumber value={parsed.value} />
      </span>
    )
  }

  const numeric = Number(parsed.value.toFixed(parsed.decimals))

  return (
    <span className="inline-flex min-w-[5ch] flex-nowrap items-center justify-start whitespace-nowrap leading-none tabular-nums">
      {parsed.prefix}
      <SlidingNumber value={numeric} />
      {parsed.suffix}
    </span>
  )
}
