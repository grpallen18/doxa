'use client'

import { useState } from 'react'
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

export function ClearExtractionButton({
  storyId,
  disabled,
  onCleared,
  onError,
  compact = false,
}: {
  storyId: string
  disabled?: boolean
  onCleared: () => Promise<void>
  onError: (message: string) => void
  compact?: boolean
}) {
  const [clearing, setClearing] = useState(false)
  const [open, setOpen] = useState(false)

  const clear = async () => {
    setClearing(true)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/clear-extraction`, {
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
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={disabled || clearing}
          className={compact ? 'h-7 px-2 text-xs' : undefined}
        >
          {compact ? 'Clear' : 'Clear extraction'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear extraction data?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes all extracted entities, QA artifacts, and feedback for this story.
            Chunks are kept. Story-only canonical rows are deleted; shared canonical data on other
            stories is preserved. This cannot be undone.
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
