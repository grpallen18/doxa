'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CHART_CATALOG_IDS,
  type ChartCatalogId,
  DEFAULT_CHART_HREFS,
  DEFAULT_CHART_TITLES,
} from '@/lib/admin/dashboard-chart-catalog'
import { cn } from '@/lib/utils'

type DialogMode = 'edit' | 'swap'

type MetricCardEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  chartId: ChartCatalogId
  title: string
  titles: Record<ChartCatalogId, string>
  onSaveTitle: (title: string) => void
  onSwap: (pickedId: ChartCatalogId) => void
}

export function MetricCardEditDialog({
  open,
  onOpenChange,
  chartId,
  title,
  titles,
  onSaveTitle,
  onSwap,
}: MetricCardEditDialogProps) {
  const [mode, setMode] = useState<DialogMode>('edit')
  const [draftTitle, setDraftTitle] = useState(title)

  useEffect(() => {
    if (!open) return
    setMode('edit')
    setDraftTitle(title)
  }, [open, title, chartId])

  const href = DEFAULT_CHART_HREFS[chartId]
  const defaultLabel = DEFAULT_CHART_TITLES[chartId]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {mode === 'edit' ? (
          <>
            <DialogHeader>
              <DialogTitle>Edit chart</DialogTitle>
              <DialogDescription>
                Rename this chart or swap it for another metric.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Label htmlFor="metric-chart-title">Display name</Label>
              <Input
                id="metric-chart-title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                maxLength={80}
                autoFocus
              />
              {href ? (
                <Link
                  href={href}
                  className="mt-1 text-sm text-accent-primary underline-offset-4 hover:underline"
                >
                  Open {defaultLabel} →
                </Link>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="button" variant="outline" onClick={() => setMode('swap')}>
                Swap
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const next = draftTitle.trim() || defaultLabel
                  onSaveTitle(next)
                  onOpenChange(false)
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Swap chart</DialogTitle>
              <DialogDescription>
                Choose which metric fills this slot.
              </DialogDescription>
            </DialogHeader>
            <ul className="grid gap-1 py-2">
              {CHART_CATALOG_IDS.map((id) => {
                const isCurrent = id === chartId
                const label = titles[id] || DEFAULT_CHART_TITLES[id]
                return (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={isCurrent}
                      onClick={() => {
                        onSwap(id)
                        onOpenChange(false)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border border-border px-3 py-2.5 text-left text-sm transition-colors',
                        isCurrent
                          ? 'cursor-default border-accent-primary/40 bg-accent-primary/10 text-foreground'
                          : 'bg-surface-section text-foreground hover:bg-muted-hover'
                      )}
                    >
                      <span className="font-medium">{label}</span>
                      {isCurrent ? (
                        <span className="text-xs text-muted">Current</span>
                      ) : (
                        <span className="text-xs text-muted">
                          {DEFAULT_CHART_TITLES[id]}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMode('edit')}>
                Back
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
