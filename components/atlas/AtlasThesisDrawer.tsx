'use client'

import { useEffect, useState } from 'react'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { VizNode } from './types'

interface AtlasThesisDrawerProps {
  node: VizNode | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ThesisDetail {
  thesis_text: string
  label: string
}

export default function AtlasThesisDrawer({
  node,
  open,
  onOpenChange,
}: AtlasThesisDrawerProps) {
  const [thesisDetail, setThesisDetail] = useState<ThesisDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!node || node.entity_type !== 'thesis') {
      setThesisDetail(null)
      return
    }

    setLoading(true)
    setThesisDetail(null)
    fetch(`/api/atlas/theses/${node.entity_id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) setThesisDetail(d.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [node?.entity_type, node?.entity_id])

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction="right"
    >
      <DrawerContent
        hideHandle
        className={cn(
          'inset-x-auto inset-y-0 right-0 left-auto mt-0 h-full w-full max-w-md',
          'rounded-l-[var(--radius-lg)] rounded-r-none',
          'border-l border-[var(--border-subtle)]',
          'bg-[var(--surface)] shadow-[var(--shadow-panel-soft)]'
        )}
      >
        <DrawerHeader className="border-b border-[var(--border-subtle)] p-4 text-left">
          <DrawerTitle className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
            Thesis
          </DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="flex-1 px-4 py-4">
          {loading && (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          )}
          {!loading && thesisDetail && (
            <div className="space-y-3 text-sm">
              {thesisDetail.label && (
                <p className="font-medium text-foreground">
                  {thesisDetail.label}
                </p>
              )}
              <p className="leading-relaxed text-[var(--muted)]">
                {thesisDetail.thesis_text}
              </p>
            </div>
          )}
          {!loading && !thesisDetail && node && (
            <p className="text-sm text-[var(--muted)]">
              Could not load thesis details.
            </p>
          )}
        </ScrollArea>

        <div className="border-t border-[var(--border-subtle)] p-4">
          <DrawerClose asChild>
            <Button variant="outline" className="w-full">
              Close
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
