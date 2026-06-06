'use client'

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'

type Preview = {
  linked_claims: number
  linked_events: number
  linked_positions: number
  shared_claims: number
  shared_events: number
  shared_positions: number
  orphan_claims: number
  orphan_events: number
  orphan_positions: number
}

export function ClearCanonicalButton({
  storyId,
  disabled,
  onCleared,
  onError,
}: {
  storyId: string
  disabled?: boolean
  onCleared: () => Promise<void>
  onError: (message: string) => void
}) {
  const [clearing, setClearing] = useState(false)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setPreviewLoading(true)
    void fetch(`/api/admin/stories/${storyId}/clear-canonical/preview`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setPreview(json.data)
      })
      .finally(() => setPreviewLoading(false))
  }, [open, storyId])

  const clear = async () => {
    setClearing(true)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/clear-canonical`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        onError(json.error?.message ?? 'Clear failed')
        return
      }
      setOpen(false)
      await onCleared()
    } catch {
      onError('Clear failed')
    } finally {
      setClearing(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="destructive" disabled={disabled || clearing}>
          Clear canonical links
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear canonical links?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Unlinks canonical IDs for this story. Merged extraction, chunks, and story entities
                are kept. Orphan-only global canonical rows are deleted; shared rows on other stories
                are preserved.
              </p>
              {previewLoading && <p>Loading impact preview…</p>}
              {preview && !previewLoading && (
                <ul className="list-inside list-disc text-xs">
                  <li>
                    Claims: {preview.linked_claims} linked ({preview.shared_claims} shared,{' '}
                    {preview.orphan_claims} orphan-only)
                  </li>
                  <li>
                    Events: {preview.linked_events} linked ({preview.shared_events} shared,{' '}
                    {preview.orphan_events} orphan-only)
                  </li>
                  <li>
                    Positions: {preview.linked_positions} linked ({preview.shared_positions} shared,{' '}
                    {preview.orphan_positions} orphan-only)
                  </li>
                </ul>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={clearing}
            onClick={(e) => {
              e.preventDefault()
              void clear()
            }}
          >
            {clearing ? 'Clearing…' : 'Confirm clear'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
