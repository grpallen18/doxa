'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NEO_KIND_LEGEND } from '@/lib/admin/neo-graph/appearance'
import { neoNodeFillGradient } from '@/lib/admin/neo-graph/colors'
import { useNeoKindColors } from '@/lib/admin/neo-graph/use-neo-colors'
import {
  ALL_NODE_KINDS,
  clampNeoFa2Settings,
  NEO_FA2_GRAVITY_RANGE,
  NEO_FA2_SCALING_RANGE,
  type NeoFa2Settings,
  type NeoGraphFilters,
  type NeoLabelVisibility,
  type NeoNodeKind,
} from '@/lib/admin/neo-graph/types'
import { cn } from '@/lib/utils'

export function NeoGraphFiltersPanel({
  filters,
  onChange,
  fa2Settings,
  onFa2Change,
  className,
}: {
  filters: NeoGraphFilters
  onChange: (next: NeoGraphFilters) => void
  fa2Settings: NeoFa2Settings
  onFa2Change: (next: NeoFa2Settings) => void
  className?: string
}) {
  const [gravityDraft, setGravityDraft] = useState(String(fa2Settings.gravity))
  const [scalingDraft, setScalingDraft] = useState(
    String(fa2Settings.scalingRatio)
  )

  useEffect(() => {
    setGravityDraft(String(fa2Settings.gravity))
    setScalingDraft(String(fa2Settings.scalingRatio))
  }, [fa2Settings.gravity, fa2Settings.scalingRatio])

  const toggleKind = (kind: NeoNodeKind) => {
    onChange({
      ...filters,
      kinds: { ...filters.kinds, [kind]: !filters.kinds[kind] },
    })
  }

  const applyFa2 = () => {
    const next = clampNeoFa2Settings({
      gravity: gravityDraft,
      scalingRatio: scalingDraft,
    })
    setGravityDraft(String(next.gravity))
    setScalingDraft(String(next.scalingRatio))
    onFa2Change(next)
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-black/55 p-3 text-zinc-200 shadow-xl backdrop-blur',
        className
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Node types
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ALL_NODE_KINDS.map((kind) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant={filters.kinds[kind] ? 'default' : 'outline'}
            className={cn(
              'h-7 rounded-full px-2.5 text-[11px]',
              filters.kinds[kind]
                ? 'bg-white/15 text-zinc-100 hover:bg-white/20'
                : 'border-white/15 bg-transparent text-zinc-500 hover:bg-white/5'
            )}
            onClick={() => toggleKind(kind)}
          >
            {kind}
          </Button>
        ))}
      </div>

      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          ForceAtlas2 layout
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-[11px] text-zinc-400">Gravity</span>
            <Input
              type="number"
              inputMode="decimal"
              min={NEO_FA2_GRAVITY_RANGE.min}
              max={NEO_FA2_GRAVITY_RANGE.max}
              step={NEO_FA2_GRAVITY_RANGE.step}
              value={gravityDraft}
              onChange={(e) => setGravityDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyFa2()
                }
              }}
              className="h-8 border-white/15 bg-black/40 text-zinc-100"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] text-zinc-400">
              Scaling ratio
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={NEO_FA2_SCALING_RANGE.min}
              max={NEO_FA2_SCALING_RANGE.max}
              step={NEO_FA2_SCALING_RANGE.step}
              value={scalingDraft}
              onChange={(e) => setScalingDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyFa2()
                }
              }}
              className="h-8 border-white/15 bg-black/40 text-zinc-100"
            />
          </label>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 h-8 w-full border-white/15 bg-transparent text-zinc-200 hover:bg-white/5"
          onClick={applyFa2}
        >
          Apply layout
        </Button>
      </div>
    </div>
  )
}

export function NeoGraphLegend({
  className,
  highlightKind = null,
  labelVisibility,
  onToggleLabel,
}: {
  className?: string
  highlightKind?: NeoNodeKind | null
  labelVisibility: NeoLabelVisibility
  onToggleLabel: (kind: NeoNodeKind) => void
}) {
  const colors = useNeoKindColors()
  const items = NEO_KIND_LEGEND.map((item) => ({
    ...item,
    color: colors[item.kind] ?? item.color,
  }))

  return (
    <div
      className={cn(
        'max-w-full overflow-hidden px-1 py-0.5',
        className
      )}
    >
      <ul className="flex min-w-0 items-center justify-center gap-x-3 gap-y-1 overflow-x-auto">
        {items.map((item) => {
          const active = highlightKind === item.kind
          const labelsOn = labelVisibility[item.kind]
          return (
            <li key={item.kind} className="shrink-0">
              <button
                type="button"
                aria-pressed={labelsOn}
                aria-label={`${labelsOn ? 'Hide' : 'Show'} ${item.label} labels`}
                title={`${labelsOn ? 'Hide' : 'Show'} ${item.label} labels`}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] transition-colors',
                  labelsOn
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-zinc-300'
                )}
                onClick={() => onToggleLabel(item.kind)}
              >
                <span
                  className={cn(
                    'inline-block h-2.5 w-2.5 rounded-full transition-[box-shadow,transform,opacity] duration-300 ease-out',
                    active ? 'scale-110 opacity-100' : 'opacity-90'
                  )}
                  style={{
                    backgroundImage: neoNodeFillGradient(item.color),
                    boxShadow: active
                      ? `0 0 0 1px rgba(255,255,255,0.18), 0 0 4px 1px ${item.color}`
                      : '0 0 0 0 transparent',
                  }}
                />
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
