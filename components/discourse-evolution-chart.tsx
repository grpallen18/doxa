'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
import { positionAccentVar } from '@/lib/topic-explore-ui'
import type { Topic } from '@/lib/mock/topic-explore'

export function DiscourseEvolutionChart({ topic }: { topic: Topic }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const data = useMemo(
    () =>
      topic.discourse.map((point) => ({
        label: point.label,
        ...point.values,
      })),
    [topic.discourse]
  )

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="p-5">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        Discourse Evolution Over Time
      </h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {topic.positions.map((position) => {
          const accent = positionAccentVar(position.ordinal)
          const isHidden = hidden.has(position.id)
          return (
            <button
              key={position.id}
              type="button"
              onClick={() => toggle(position.id)}
              aria-pressed={!isHidden}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                isHidden ? 'border-subtle text-muted opacity-60' : 'border-subtle text-foreground'
              )}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: accent }} />
              Position {position.ordinal}
            </button>
          )
        })}
      </div>

      <div className="mt-4 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              stroke="var(--border-subtle)"
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} stroke="var(--border-subtle)" />
            {topic.discourseEvents.map((event) => (
              <ReferenceLine
                key={event.label}
                x={topic.discourse[event.at]?.label}
                stroke="var(--muted-soft)"
                strokeDasharray="4 4"
                label={{ value: event.label, position: 'insideTopRight', fontSize: 10, fill: 'var(--muted)' }}
              />
            ))}
            {topic.positions.map((position) => (
              <Line
                key={position.id}
                type="monotone"
                dataKey={position.id}
                hide={hidden.has(position.id)}
                stroke={positionAccentVar(position.ordinal)}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
