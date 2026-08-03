'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminDashboardWidget } from '@/components/admin/admin-dashboard-widget'
import { Button } from '@/components/ui/button'
import {
  isDefaultNeoKindColors,
  loadNeoKindColors,
  NEO_KIND_COLOR_DEFAULTS,
  NEO_KIND_COLOR_FIELDS,
  normalizeNeoColor,
  resetNeoKindColors,
  saveNeoKindColors,
  subscribeNeoKindColors,
  type NeoKindColorMap,
} from '@/lib/admin/neo-graph/colors'
import { showPipelineSuccess } from '@/lib/admin/pipeline-toast'
import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'

export function NeoColorsPanel() {
  const [colors, setColors] = useState<NeoKindColorMap>(NEO_KIND_COLOR_DEFAULTS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setColors(loadNeoKindColors())
    setReady(true)
    return subscribeNeoKindColors(setColors)
  }, [])

  const setKindColor = useCallback((kind: NeoNodeKind, value: string) => {
    setColors((prev) => {
      const next = {
        ...prev,
        [kind]: normalizeNeoColor(value, NEO_KIND_COLOR_DEFAULTS[kind]),
      }
      saveNeoKindColors(next)
      return next
    })
  }, [])

  const handleReset = useCallback(() => {
    const defaults = resetNeoKindColors()
    setColors(defaults)
    showPipelineSuccess('Neo colors reset to defaults')
  }, [])

  const usingDefaults = ready && isDefaultNeoKindColors(colors)

  return (
    <AdminDashboardWidget
      title="Neo Colors"
      titleClassName="text-sm font-semibold tracking-tight text-foreground"
      headerAside={
        <Button
          type="button"
          size="sm"
          onClick={handleReset}
          disabled={usingDefaults}
          className="h-7 px-2 text-xs border-0 bg-[var(--accent-primary)] text-inverted shadow-sm hover:bg-[var(--accent-primary)] hover:brightness-110 hover:text-inverted disabled:opacity-50"
        >
          Reset
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          Node colors for the Neo graph explorer and legend. Saved in this
          browser and applied globally.
        </p>
        <ul className="space-y-1.5">
          {NEO_KIND_COLOR_FIELDS.map(({ kind, label }) => {
            const fallback = NEO_KIND_COLOR_DEFAULTS[kind]
            const value = ready
              ? normalizeNeoColor(colors[kind] ?? fallback, fallback)
              : fallback
            return (
              <li key={kind}>
                <label className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: value }}
                      aria-hidden
                    />
                    <span className="truncate text-xs font-semibold tracking-tight text-foreground">
                      {label}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-semibold tracking-tight uppercase text-muted">
                      {value}
                    </span>
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => setKindColor(kind, e.target.value)}
                      className="size-5 cursor-pointer appearance-none overflow-hidden rounded-full border border-border bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                      aria-label={`${label} color`}
                    />
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </AdminDashboardWidget>
  )
}
